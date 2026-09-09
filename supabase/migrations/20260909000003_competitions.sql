-- Phase 2 — competitions, the fixture, and what happens in a match.
--
-- A competition is a division crossed with a season, the shape Gamz uses and a
-- better one than a free-standing "tournament": teams belong to the league and
-- register into competitions, so one roster serves many of them.

create type public.competition_format as enum ('league', 'cup', 'league_finals');
create type public.competition_status as enum ('draft', 'fixtured', 'in_progress', 'complete');
create type public.match_status as enum ('scheduled', 'played', 'postponed', 'cancelled', 'forfeit');
create type public.match_stage as enum (
  'regular', 'quarter_final', 'semi_final', 'final', 'third_place'
);
create type public.bracket_source as enum ('winner', 'loser');

-- ---------------------------------------------------------------------------
-- Event types — the multi-sport hook, now with something hanging off it.
-- Adding basketball means inserting its event types, not migrating match_events.
-- ---------------------------------------------------------------------------

create table public.sport_event_types (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,32}$'),
  name text not null,
  -- Whether this event is a scoring one. Kept for stats and for later
  -- cross-checks against the entered score; it does not compute the score.
  scores boolean not null default false,
  sort_order smallint not null default 0,
  unique (sport_id, key)
);

insert into public.sport_event_types (sport_id, key, name, scores, sort_order)
select s.id, v.key, v.name, v.scores, v.sort_order
from public.sports s
cross join (values
  ('goal', 'Goal', true, 10),
  ('penalty_goal', 'Penalty', true, 20),
  ('own_goal', 'Own goal', true, 30),
  ('assist', 'Assist', false, 40),
  ('yellow_card', 'Yellow card', false, 50),
  ('red_card', 'Red card', false, 60)
) as v(key, name, scores, sort_order)
where s.key = 'soccer';

alter table public.sport_event_types enable row level security;
create policy sport_event_types_select on public.sport_event_types
for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Competitions
-- ---------------------------------------------------------------------------

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete restrict,
  division_id uuid not null references public.divisions (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  format public.competition_format not null default 'league',
  -- 1 = single round robin, 2 = home and away.
  rounds smallint not null default 1 check (rounds between 1 and 4),
  points_win smallint not null default 3 check (points_win between 0 and 10),
  points_draw smallint not null default 1 check (points_draw between 0 and 10),
  points_loss smallint not null default 0 check (points_loss between 0 and 10),
  status public.competition_status not null default 'draft',
  -- Publishing is per competition, not per league: a club can run its public
  -- summer league and keep an internal one unlisted.
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, season_id, division_id, name)
);

create index competitions_org_idx on public.competitions (org_id);
create index competitions_season_idx on public.competitions (season_id);

-- The season and the division have to be the league's own, and org_id is taken
-- from them rather than trusted from the caller.
create or replace function public.enforce_competition_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  season_org uuid;
  division_org uuid;
begin
  select org_id into season_org from public.seasons where id = new.season_id;
  select org_id into division_org from public.divisions where id = new.division_id;

  if season_org is null or division_org is null then
    raise exception 'Season or division does not exist.' using errcode = 'foreign_key_violation';
  end if;

  if season_org <> division_org then
    raise exception 'Season and division belong to different organizations.'
      using errcode = 'check_violation';
  end if;

  new.org_id = season_org;
  return new;
end;
$fn$;

create trigger competitions_enforce_org
before insert or update on public.competitions
for each row execute function public.enforce_competition_org();

-- ---------------------------------------------------------------------------
-- Which teams are in a competition
-- ---------------------------------------------------------------------------

create table public.team_registrations (
  competition_id uuid not null references public.competitions (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Used to place teams in a bracket; ignored by a plain league.
  seed smallint,
  created_at timestamptz not null default now(),
  primary key (competition_id, team_id)
);

create index team_registrations_team_idx on public.team_registrations (team_id);
create index team_registrations_org_idx on public.team_registrations (org_id);

create or replace function public.enforce_registration_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  competition_org uuid;
  team_org uuid;
begin
  select org_id into competition_org from public.competitions where id = new.competition_id;
  select org_id into team_org from public.teams where id = new.team_id;

  if competition_org is null or team_org is null then
    raise exception 'Competition or team does not exist.' using errcode = 'foreign_key_violation';
  end if;

  if competition_org <> team_org then
    raise exception 'A team can only register into its own organization''s competition.'
      using errcode = 'check_violation';
  end if;

  new.org_id = competition_org;
  return new;
end;
$fn$;

create trigger team_registrations_enforce_org
before insert or update on public.team_registrations
for each row execute function public.enforce_registration_org();

-- ---------------------------------------------------------------------------
-- Matches
--
-- Teams are nullable so a knockout match can exist before its participants are
-- known: it points at the matches that feed it, and gets filled in when those
-- are played. Phase 5 resolves those; phase 2 only ever writes regular rounds.
-- ---------------------------------------------------------------------------

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  competition_id uuid not null references public.competitions (id) on delete cascade,
  round_number smallint check (round_number is null or round_number > 0),
  stage public.match_stage not null default 'regular',
  home_team_id uuid references public.teams (id) on delete restrict,
  away_team_id uuid references public.teams (id) on delete restrict,
  home_source_match_id uuid references public.matches (id) on delete set null,
  home_source_rule public.bracket_source,
  away_source_match_id uuid references public.matches (id) on delete set null,
  away_source_rule public.bracket_source,
  -- Stored as an instant; rendered in the organization's time zone.
  kickoff_at timestamptz,
  pitch_id uuid references public.pitches (id) on delete set null,
  status public.match_status not null default 'scheduled',
  -- The score is entered by the league and is authoritative. Events below are
  -- the detail behind it and are not required to add up — a league that records
  -- a 3-1 without naming the scorers is normal, and blocking that would just
  -- mean nobody enters events at all.
  home_score smallint check (home_score is null or home_score >= 0),
  away_score smallint check (away_score is null or away_score >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    home_team_id is null or away_team_id is null or home_team_id <> away_team_id
  )
);

create index matches_competition_idx on public.matches (competition_id, round_number);
create index matches_org_idx on public.matches (org_id);
create index matches_kickoff_idx on public.matches (kickoff_at);
create index matches_home_team_idx on public.matches (home_team_id);
create index matches_away_team_idx on public.matches (away_team_id);

create or replace function public.enforce_match_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  competition_org uuid;
begin
  select org_id into competition_org from public.competitions where id = new.competition_id;

  if competition_org is null then
    raise exception 'Competition does not exist.' using errcode = 'foreign_key_violation';
  end if;

  -- Both teams must be registered in this competition. Without this a manager
  -- could schedule a team that never entered — which then appears on the ladder.
  if new.home_team_id is not null and not exists (
    select 1 from public.team_registrations r
    where r.competition_id = new.competition_id and r.team_id = new.home_team_id
  ) then
    raise exception 'Home team is not registered in this competition.'
      using errcode = 'check_violation';
  end if;

  if new.away_team_id is not null and not exists (
    select 1 from public.team_registrations r
    where r.competition_id = new.competition_id and r.team_id = new.away_team_id
  ) then
    raise exception 'Away team is not registered in this competition.'
      using errcode = 'check_violation';
  end if;

  new.org_id = competition_org;
  return new;
end;
$fn$;

create trigger matches_enforce_org
before insert or update on public.matches
for each row execute function public.enforce_match_org();

-- ---------------------------------------------------------------------------
-- Match events — the detail behind a score.
--
-- `team_id` is the team the event is credited to. For an own goal that is the
-- team that benefits, while `person_id` is the player who put it in — which is
-- why the two columns are not redundant.
-- ---------------------------------------------------------------------------

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete restrict,
  person_id uuid references public.people (id) on delete set null,
  event_type_id uuid not null references public.sport_event_types (id) on delete restrict,
  minute smallint check (minute is null or minute between 0 and 200),
  created_at timestamptz not null default now()
);

create index match_events_match_idx on public.match_events (match_id);
create index match_events_person_idx on public.match_events (person_id);
create index match_events_org_idx on public.match_events (org_id);

create or replace function public.enforce_match_event_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  match_org uuid;
begin
  select org_id into match_org from public.matches where id = new.match_id;

  if match_org is null then
    raise exception 'Match does not exist.' using errcode = 'foreign_key_violation';
  end if;

  new.org_id = match_org;
  return new;
end;
$fn$;

create trigger match_events_enforce_org
before insert or update on public.match_events
for each row execute function public.enforce_match_event_org();

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create trigger competitions_set_updated_at before update on public.competitions
for each row execute function public.set_updated_at();

create trigger matches_set_updated_at before update on public.matches
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Still members-only. Phase 3 adds the anon policies for published
-- competitions, which is why is_published already exists here.
-- ---------------------------------------------------------------------------

alter table public.competitions enable row level security;
alter table public.team_registrations enable row level security;
alter table public.matches enable row level security;
alter table public.match_events enable row level security;

create policy competitions_select on public.competitions
for select to authenticated using (public.is_org_member(org_id));
create policy competitions_write on public.competitions
for all to authenticated
using (public.is_org_editor(org_id)) with check (public.is_org_editor(org_id));

create policy team_registrations_select on public.team_registrations
for select to authenticated using (public.is_org_member(org_id));
create policy team_registrations_write on public.team_registrations
for all to authenticated
using (public.is_org_editor(org_id)) with check (public.is_org_editor(org_id));

create policy matches_select on public.matches
for select to authenticated using (public.is_org_member(org_id));
create policy matches_write on public.matches
for all to authenticated
using (public.is_org_editor(org_id)) with check (public.is_org_editor(org_id));

create policy match_events_select on public.match_events
for select to authenticated using (public.is_org_member(org_id));
create policy match_events_write on public.match_events
for all to authenticated
using (public.is_org_editor(org_id)) with check (public.is_org_editor(org_id));
