-- Phase 4 — when a pitch is free, and when a team can play.
--
-- Availability is stored as recurring weekly windows rather than as a row per
-- playable slot. A league says "Pitch 1, Saturdays, 9am to 3pm, hour games"
-- once; the concrete slots are worked out for whatever date range is being
-- scheduled. Storing them would mean thousands of rows that go stale the moment
-- the window changes.
--
-- Times are `time` with no zone, read in the organization's time zone — the
-- same rule the rest of the app follows for kick-offs.

create type public.preference_kind as enum ('preferred', 'avoid', 'unavailable');

create table public.pitch_availability (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid not null references public.pitches (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- 0 = Sunday, matching JavaScript's getDay().
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  -- How long one match occupies the pitch, including turnaround.
  slot_minutes smallint not null default 60 check (slot_minutes between 10 and 480),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index pitch_availability_pitch_idx on public.pitch_availability (pitch_id);
create index pitch_availability_org_idx on public.pitch_availability (org_id);

create or replace function public.enforce_pitch_availability_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pitch_org uuid;
begin
  select org_id into pitch_org from public.pitches where id = new.pitch_id;
  if pitch_org is null then
    raise exception 'Pitch does not exist.' using errcode = 'foreign_key_violation';
  end if;
  new.org_id = pitch_org;
  return new;
end;
$fn$;

create trigger pitch_availability_enforce_org
before insert or update on public.pitch_availability
for each row execute function public.enforce_pitch_availability_org();

-- ---------------------------------------------------------------------------
-- When a team can play
--
-- Scoped to a competition, because the same club can have different
-- constraints in different grades.
-- ---------------------------------------------------------------------------

create table public.team_time_preferences (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time,
  ends_at time,
  -- `unavailable` is a hard rule the scheduler must not break. The other two
  -- only move a slot up or down the ranking.
  kind public.preference_kind not null default 'preferred',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create index team_time_preferences_competition_idx
  on public.team_time_preferences (competition_id);
create index team_time_preferences_org_idx on public.team_time_preferences (org_id);

create or replace function public.enforce_time_preference_org()
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
    raise exception 'Team and competition belong to different organizations.'
      using errcode = 'check_violation';
  end if;

  new.org_id = competition_org;
  return new;
end;
$fn$;

create trigger team_time_preferences_enforce_org
before insert or update on public.team_time_preferences
for each row execute function public.enforce_time_preference_org();

create trigger pitch_availability_set_updated_at before update on public.pitch_availability
for each row execute function public.set_updated_at();

create trigger team_time_preferences_set_updated_at before update on public.team_time_preferences
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Internal planning data. A visitor sees the fixture that comes out of it, not
-- the constraints that produced it, so there is no anon policy here.
-- ---------------------------------------------------------------------------

alter table public.pitch_availability enable row level security;
alter table public.team_time_preferences enable row level security;

create policy pitch_availability_select on public.pitch_availability
for select to authenticated using (public.is_org_member(org_id));
create policy pitch_availability_write on public.pitch_availability
for all to authenticated
using (public.is_org_editor(org_id)) with check (public.is_org_editor(org_id));

create policy team_time_preferences_select on public.team_time_preferences
for select to authenticated using (public.is_org_member(org_id));
create policy team_time_preferences_write on public.team_time_preferences
for all to authenticated
using (public.is_org_editor(org_id)) with check (public.is_org_editor(org_id));
