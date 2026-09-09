-- Tenancy foundation: organizations (a league or federation) and their members.
--
-- Every tenant table added from here on carries an `org_id` and repeats this
-- shape: RLS enabled, reads gated by membership, writes gated by role. RLS is
-- the only enforcement point — application code must never be the thing that
-- decides who may see what.

create extension if not exists "pgcrypto";

create type public.org_role as enum ('owner', 'admin', 'staff', 'team_admin', 'viewer');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  -- Appears in public URLs (/{slug}/...), so the shape is constrained here too
  -- and not only in the client.
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,48}$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  logo_url text,
  primary_color text,
  -- Kick-off times are stored as timestamptz and rendered in this zone, so a
  -- league in another country reads its own fixtures correctly.
  timezone text not null default 'UTC',
  -- Whether the organization appears in the public directory at all. Individual
  -- competitions carry their own publish flag on top of this.
  is_public boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index org_members_user_id_idx on public.org_members (user_id);

-- ---------------------------------------------------------------------------
-- Membership helpers
--
-- These are SECURITY DEFINER on purpose. A policy on `org_members` that queries
-- `org_members` directly recurses and Postgres rejects it; routing the lookup
-- through a definer function breaks the cycle. They read nothing but auth.uid(),
-- so they cannot be used to see another user's rows.
-- ---------------------------------------------------------------------------

create or replace function public.current_org_role(p_org uuid)
returns public.org_role
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select m.role
  from public.org_members m
  where m.org_id = p_org
    and m.user_id = auth.uid();
$fn$;

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = p_org
      and m.user_id = auth.uid()
  );
$fn$;

-- Allowed to change league data and manage people.
create or replace function public.is_org_manager(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select public.current_org_role(p_org) in ('owner', 'admin');
$fn$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

-- The creator becomes owner in the same transaction as the insert. Doing this
-- from the application would take a second round trip, and a failure there
-- would leave an organization nobody is a member of — which no policy could
-- then repair, because every policy is written in terms of membership.
create or replace function public.add_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.org_members (org_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$fn$;

create trigger organizations_add_creator_as_owner
after insert on public.organizations
for each row execute function public.add_creator_as_owner();

-- An organization with no owner is unrecoverable: nobody can invite, promote or
-- delete. Block the last one from leaving instead of discovering it later.
create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  remaining int;
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;

  select count(*) into remaining
  from public.org_members m
  where m.org_id = old.org_id
    and m.role = 'owner'
    and m.user_id <> old.user_id;

  if remaining = 0 then
    raise exception 'An organization must keep at least one owner.'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$fn$;

create trigger org_members_prevent_last_owner_removal
before update or delete on public.org_members
for each row execute function public.prevent_last_owner_removal();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.org_members enable row level security;

-- Anonymous visitors can see public organizations; members can always see their
-- own, public or not. This is what makes the public site work without a login.
create policy organizations_select
on public.organizations
for select
to anon, authenticated
using (is_public or public.is_org_member(id));

-- Any signed-in user may start a league, but only as themselves.
create policy organizations_insert
on public.organizations
for insert
to authenticated
with check (created_by = auth.uid());

create policy organizations_update
on public.organizations
for update
to authenticated
using (public.is_org_manager(id))
with check (public.is_org_manager(id));

create policy organizations_delete
on public.organizations
for delete
to authenticated
using (public.current_org_role(id) = 'owner');

-- The member roster is never public: it contains real people's accounts.
create policy org_members_select
on public.org_members
for select
to authenticated
using (public.is_org_member(org_id));

create policy org_members_insert
on public.org_members
for insert
to authenticated
with check (public.is_org_manager(org_id));

create policy org_members_update
on public.org_members
for update
to authenticated
using (public.is_org_manager(org_id))
with check (public.is_org_manager(org_id));

-- Managers can remove people; anyone can remove themselves (leave).
create policy org_members_delete
on public.org_members
for delete
to authenticated
using (public.is_org_manager(org_id) or user_id = auth.uid());
