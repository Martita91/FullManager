-- Phase 3 — what the public can see, and how a player claims their profile.
--
-- Everything so far has been members-only. This opens a narrow, deliberate
-- window: a competition the league has explicitly published, in an
-- organization that is listed, and nothing else.
--
-- Two rules govern the whole file:
--
--   1. Visibility is always derived from `competitions.is_published` AND
--      `organizations.is_public`. Neither alone is enough.
--
--   2. `people` holds emails, phone numbers and dates of birth. It gets NO
--      public policy at all. Names reach the outside world through views that
--      do not select those columns, so there is no policy anyone could later
--      loosen that would expose them.
--
-- Note every public policy below grants to `anon, authenticated`. A signed-in
-- player is not a member of the league they play in — only staff are — so a
-- policy limited to `anon` would show them an empty app the moment they log in.

-- ---------------------------------------------------------------------------
-- Helpers: is this on public display?
-- ---------------------------------------------------------------------------

create or replace function public.is_competition_public(p_competition uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.competitions c
    join public.organizations o on o.id = c.org_id
    where c.id = p_competition
      and c.is_published
      and o.is_public
  );
$fn$;

create or replace function public.is_team_public(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.team_registrations r
    where r.team_id = p_team
      and public.is_competition_public(r.competition_id)
  );
$fn$;

-- ---------------------------------------------------------------------------
-- Read policies for visitors and for signed-in players
-- ---------------------------------------------------------------------------

create policy competitions_public_select on public.competitions
for select to anon, authenticated
using (is_published and exists (
  select 1 from public.organizations o where o.id = org_id and o.is_public
));

create policy seasons_public_select on public.seasons
for select to anon, authenticated
using (exists (
  select 1 from public.competitions c
  where c.season_id = seasons.id and public.is_competition_public(c.id)
));

create policy divisions_public_select on public.divisions
for select to anon, authenticated
using (exists (
  select 1 from public.competitions c
  where c.division_id = divisions.id and public.is_competition_public(c.id)
));

create policy team_registrations_public_select on public.team_registrations
for select to anon, authenticated
using (public.is_competition_public(competition_id));

create policy teams_public_select on public.teams
for select to anon, authenticated
using (public.is_team_public(id));

create policy matches_public_select on public.matches
for select to anon, authenticated
using (public.is_competition_public(competition_id));

-- A ground that hosts a public fixture is public information.
create policy venues_public_select on public.venues
for select to anon, authenticated
using (exists (
  select 1
  from public.pitches p
  join public.matches m on m.pitch_id = p.id
  where p.venue_id = venues.id and public.is_competition_public(m.competition_id)
));

create policy pitches_public_select on public.pitches
for select to anon, authenticated
using (exists (
  select 1 from public.matches m
  where m.pitch_id = pitches.id and public.is_competition_public(m.competition_id)
));

-- A player can always read their own record, including their own contact
-- details. This is the only way a non-staff account reaches the `people` table.
create policy people_self_select on public.people
for select to authenticated
using (user_id = auth.uid());

create policy team_memberships_self_select on public.team_memberships
for select to authenticated
using (exists (
  select 1 from public.people p
  where p.id = team_memberships.person_id and p.user_id = auth.uid()
));

-- ---------------------------------------------------------------------------
-- Public views — the only route by which a person's name leaves the league
--
-- These are SECURITY DEFINER views on purpose (the Postgres default), so they
-- read `people` with the view owner's rights rather than the caller's. That is
-- exactly why the WHERE clauses matter, and why the column list is short: an
-- email address is not in the select list, so no caller can ask for one.
-- ---------------------------------------------------------------------------

create view public.public_team_members as
select
  tm.team_id,
  tm.person_id,
  tm.org_id,
  tm.role,
  tm.shirt_number,
  p.first_name,
  p.last_name
from public.team_memberships tm
join public.people p on p.id = tm.person_id
where tm.status = 'active'
  and public.is_team_public(tm.team_id);

create view public.public_match_events as
select
  e.id,
  e.match_id,
  e.team_id,
  e.person_id,
  e.minute,
  et.key as event_key,
  et.name as event_name,
  p.first_name,
  p.last_name
from public.match_events e
join public.matches m on m.id = e.match_id
join public.sport_event_types et on et.id = e.event_type_id
left join public.people p on p.id = e.person_id
where public.is_competition_public(m.competition_id);

grant select on public.public_team_members to anon, authenticated;
grant select on public.public_match_events to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Favorites — a viewer's own saved teams and competitions.
-- ---------------------------------------------------------------------------

create type public.favorite_kind as enum ('team', 'competition', 'organization');

create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.favorite_kind not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, entity_id)
);

create index favorites_user_idx on public.favorites (user_id);

alter table public.favorites enable row level security;

-- Strictly personal: a favorite is never visible to anyone else, league staff
-- included.
create policy favorites_own on public.favorites
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Claiming a player profile
--
-- A league types its players in long before those players ever sign in, so a
-- `people` row starts with no account attached. This links the two when the
-- email matches — and it has to be SECURITY DEFINER, because at the moment of
-- claiming, the row does not yet belong to the caller and no policy could let
-- them write it.
-- ---------------------------------------------------------------------------

create or replace function public.claim_player_profile(p_org uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  caller_email text;
  claimed uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  caller_email := lower(nullif(auth.jwt() ->> 'email', ''));
  if caller_email is null then
    raise exception 'No email on this account' using errcode = 'insufficient_privilege';
  end if;

  -- Only an unclaimed row, and only one whose address the caller has proven
  -- they control by signing in with it.
  update public.people
  set user_id = auth.uid()
  where org_id = p_org
    and lower(email) = caller_email
    and user_id is null
  returning id into claimed;

  return claimed;
end;
$fn$;

revoke execute on function public.claim_player_profile(uuid) from anon;
grant execute on function public.claim_player_profile(uuid) to authenticated;
