-- Phase 1 — the catalog a league loads before it can run anything:
-- sports, seasons, divisions, teams, people, rosters, venues and pitches.
--
-- Same shape as the tenancy migration: every table carries org_id, has RLS
-- enabled, and gates reads by membership and writes by role. `sports` is the
-- one exception — it is global reference data, not tenant data.

-- ---------------------------------------------------------------------------
-- Who may write
--
-- `is_org_manager` (owner/admin) governs the organization itself and its
-- people. Loading league data is the day job of `staff` too, so that needs its
-- own helper rather than widening the manager check.
-- ---------------------------------------------------------------------------

create or replace function public.is_org_editor(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select public.current_org_role(p_org) in ('owner', 'admin', 'staff');
$fn$;

-- ---------------------------------------------------------------------------
-- Shared enums
-- ---------------------------------------------------------------------------

create type public.entity_status as enum ('active', 'inactive');
create type public.season_status as enum ('draft', 'active', 'archived');
create type public.team_role as enum ('player', 'captain', 'coach', 'manager');

-- ---------------------------------------------------------------------------
-- Sports — global reference data, seeded by us, read by everyone.
--
-- This is the multi-sport hook. Today it holds one row. Adding basketball later
-- is an insert plus its scoring rules, not a migration of the match tables.
-- ---------------------------------------------------------------------------

create table public.sports (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]{2,32}$'),
  name text not null
);

insert into public.sports (key, name) values ('soccer', 'Football');

alter table public.sports enable row level security;

create policy sports_select
on public.sports
for select
to anon, authenticated
using (true);

-- No insert/update/delete policies: sports are managed by migrations, so even a
-- league owner cannot invent one. That is deliberate — scoring rules and stats
-- are written against these keys.

-- ---------------------------------------------------------------------------
-- Seasons
-- ---------------------------------------------------------------------------

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  starts_on date,
  ends_on date,
  status public.season_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name),
  -- A season that ends before it starts is a typo, not a state worth storing.
  check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

create index seasons_org_id_idx on public.seasons (org_id);

-- ---------------------------------------------------------------------------
-- Divisions — a grade or age group within a sport ("Division A", "Under 15").
-- A competition is a division crossed with a season.
-- ---------------------------------------------------------------------------

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  sport_id uuid not null references public.sports (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  status public.entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, sport_id, name)
);

create index divisions_org_id_idx on public.divisions (org_id);

-- ---------------------------------------------------------------------------
-- Teams — owned by the organization, not by a competition. A team registers
-- into many competitions over time while keeping one roster.
-- ---------------------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  short_name text check (short_name is null or char_length(btrim(short_name)) between 1 and 12),
  crest_url text,
  notes text,
  status public.entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

create index teams_org_id_idx on public.teams (org_id);

-- ---------------------------------------------------------------------------
-- People — players, coaches and staff known to the league.
--
-- This table holds personal data (email, phone, date of birth). It is never
-- readable by anon, and the public site in phase 3 must expose a narrow view of
-- it (display name and shirt number), never the table itself.
-- ---------------------------------------------------------------------------

create table public.people (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 60),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 60),
  email text check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone text,
  date_of_birth date,
  -- Set when the person claims their profile from the player app. Null until
  -- then, which is the normal state for someone the league typed in.
  user_id uuid references auth.users (id) on delete set null,
  status public.entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index people_org_id_idx on public.people (org_id);

-- One email per league, when there is one at all. Two people may both have no
-- email, so this has to be a partial index rather than a unique constraint.
create unique index people_org_email_key
on public.people (org_id, lower(email))
where email is not null;

-- A user account belongs to at most one person per league.
create unique index people_org_user_key
on public.people (org_id, user_id)
where user_id is not null;

-- ---------------------------------------------------------------------------
-- Team memberships — who is on which team, in what role, wearing what number.
-- ---------------------------------------------------------------------------

create table public.team_memberships (
  team_id uuid not null references public.teams (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  -- Denormalized from the team so RLS and org-wide queries don't need a join.
  -- Kept honest by a trigger rather than by trust.
  org_id uuid not null references public.organizations (id) on delete cascade,
  role public.team_role not null default 'player',
  shirt_number smallint check (shirt_number is null or shirt_number between 0 and 999),
  status public.entity_status not null default 'active',
  joined_on date not null default current_date,
  left_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, person_id),
  check (left_on is null or left_on >= joined_on)
);

create index team_memberships_person_idx on public.team_memberships (person_id);
create index team_memberships_org_idx on public.team_memberships (org_id);

-- Two active players can't wear the same number on the same team.
create unique index team_memberships_shirt_key
on public.team_memberships (team_id, shirt_number)
where shirt_number is not null and status = 'active';

-- The team and the person must belong to the same league, and org_id must match
-- both. Without this a manager of league A could attach one of their people to
-- a team in league B by passing its id.
create or replace function public.enforce_team_membership_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  team_org uuid;
  person_org uuid;
begin
  select org_id into team_org from public.teams where id = new.team_id;
  select org_id into person_org from public.people where id = new.person_id;

  if team_org is null or person_org is null then
    raise exception 'Team or person does not exist.' using errcode = 'foreign_key_violation';
  end if;

  if team_org <> person_org then
    raise exception 'A person can only join a team in their own organization.'
      using errcode = 'check_violation';
  end if;

  -- Authoritative, so a caller cannot set it to someone else's league.
  new.org_id = team_org;
  return new;
end;
$fn$;

create trigger team_memberships_enforce_org
before insert or update on public.team_memberships
for each row execute function public.enforce_team_membership_org();

-- ---------------------------------------------------------------------------
-- Venues and pitches — a venue is a site, a pitch is a playable surface on it.
-- Phase 4 hangs time slots off pitches.
-- ---------------------------------------------------------------------------

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  address text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  status public.entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

create index venues_org_id_idx on public.venues (org_id);

create table public.pitches (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  -- Denormalized for the same reason as team_memberships, and kept honest the
  -- same way.
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  surface text,
  status public.entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, name)
);

create index pitches_org_id_idx on public.pitches (org_id);
create index pitches_venue_id_idx on public.pitches (venue_id);

create or replace function public.enforce_pitch_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  venue_org uuid;
begin
  select org_id into venue_org from public.venues where id = new.venue_id;

  if venue_org is null then
    raise exception 'Venue does not exist.' using errcode = 'foreign_key_violation';
  end if;

  new.org_id = venue_org;
  return new;
end;
$fn$;

create trigger pitches_enforce_org
before insert or update on public.pitches
for each row execute function public.enforce_pitch_org();

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create trigger seasons_set_updated_at before update on public.seasons
for each row execute function public.set_updated_at();

create trigger divisions_set_updated_at before update on public.divisions
for each row execute function public.set_updated_at();

create trigger teams_set_updated_at before update on public.teams
for each row execute function public.set_updated_at();

create trigger people_set_updated_at before update on public.people
for each row execute function public.set_updated_at();

create trigger team_memberships_set_updated_at before update on public.team_memberships
for each row execute function public.set_updated_at();

create trigger venues_set_updated_at before update on public.venues
for each row execute function public.set_updated_at();

create trigger pitches_set_updated_at before update on public.pitches
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Nothing here is public yet. The public site (phase 3) will add read policies
-- gated on a competition being published — and for `people` it will go through
-- a narrow view, never this table, because this one holds contact details and
-- dates of birth.
-- ---------------------------------------------------------------------------

alter table public.seasons enable row level security;
alter table public.divisions enable row level security;
alter table public.teams enable row level security;
alter table public.people enable row level security;
alter table public.team_memberships enable row level security;
alter table public.venues enable row level security;
alter table public.pitches enable row level security;

create policy seasons_select on public.seasons
for select to authenticated using (public.is_org_member(org_id));
create policy seasons_write on public.seasons
for all to authenticated
using (public.is_org_editor(org_id)) with check (public.is_org_editor(org_id));

create policy divisions_select on public.divisions
for select to authenticated using (public.is_org_member(org_id));
create policy divisions_write on public.divisions
for all to authenticated
using (public.is_org_editor(org_id)) with check (public.is_org_editor(org_id));

create policy teams_select on public.teams
for select to authenticated using (public.is_org_member(org_id));
create policy teams_write on public.teams
for all to authenticated
using (public.is_org_editor(org_id)) with check (public.is_org_editor(org_id));

create policy people_select on public.people
for select to authenticated using (public.is_org_member(org_id));
create policy people_write on public.people
for all to authenticated
using (public.is_org_editor(org_id)) with check (public.is_org_editor(org_id));

create policy team_memberships_select on public.team_memberships
for select to authenticated using (public.is_org_member(org_id));
create policy team_memberships_write on public.team_memberships
for all to authenticated
using (public.is_org_editor(org_id)) with check (public.is_org_editor(org_id));

create policy venues_select on public.venues
for select to authenticated using (public.is_org_member(org_id));
create policy venues_write on public.venues
for all to authenticated
using (public.is_org_editor(org_id)) with check (public.is_org_editor(org_id));

create policy pitches_select on public.pitches
for select to authenticated using (public.is_org_member(org_id));
create policy pitches_write on public.pitches
for all to authenticated
using (public.is_org_editor(org_id)) with check (public.is_org_editor(org_id));
