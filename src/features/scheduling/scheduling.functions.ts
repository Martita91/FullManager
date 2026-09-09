import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgAccess, requireOrgEditor } from "@/features/organizations/membership";
import { orgSlug, uuid } from "@/features/catalog/validation";
import {
  allocateFixture,
  type AvailabilityWindow,
  type TimePreference,
} from "@/lib/scheduling/allocate";
import { isoToZonedInput, zonedInputToIso } from "@/lib/time/zoned";

const TIME = z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM");
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const WEEKDAY = z.coerce.number().int().min(0).max(6);

// ---------------------------------------------------------------------------
// Pitch availability
// ---------------------------------------------------------------------------

export interface AvailabilityRow {
  id: string;
  pitchId: string;
  pitchName: string;
  venueName: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  slotMinutes: number;
}

/** Postgres `time` comes back as HH:MM:SS; the interface works in HH:MM. */
const shortTime = (value: string) => value.slice(0, 5);

export const listAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug }).parse(input))
  .handler(async ({ data, context }): Promise<AvailabilityRow[]> => {
    const { orgId } = await requireOrgAccess(context.supabase, context.userId, data.orgSlug);

    const { data: rows, error } = await context.supabase
      .from("pitch_availability")
      .select(
        "id, pitch_id, weekday, starts_at, ends_at, slot_minutes, pitches(name, venues(name))",
      )
      .eq("org_id", orgId)
      .order("weekday")
      .order("starts_at");

    if (error) throw new Error(error.message);

    return (
      (rows ?? []) as unknown as {
        id: string;
        pitch_id: string;
        weekday: number;
        starts_at: string;
        ends_at: string;
        slot_minutes: number;
        pitches: { name: string; venues: { name: string } | null } | null;
      }[]
    ).map((r) => ({
      id: r.id,
      pitchId: r.pitch_id,
      pitchName: r.pitches?.name ?? "",
      venueName: r.pitches?.venues?.name ?? "",
      weekday: r.weekday,
      startsAt: shortTime(r.starts_at),
      endsAt: shortTime(r.ends_at),
      slotMinutes: r.slot_minutes,
    }));
  });

export const createAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        orgSlug,
        pitchId: uuid,
        weekday: WEEKDAY,
        startsAt: TIME,
        endsAt: TIME,
        slotMinutes: z.coerce.number().int().min(10).max(480),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { orgId } = await requireOrgEditor(context.supabase, context.userId, data.orgSlug);
    if (data.endsAt <= data.startsAt) throw new Error("END_BEFORE_START");

    const { data: row, error } = await context.supabase
      .from("pitch_availability")
      .insert({
        org_id: orgId,
        pitch_id: data.pitchId,
        weekday: data.weekday,
        starts_at: data.startsAt,
        ends_at: data.endsAt,
        slot_minutes: data.slotMinutes,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return row as { id: string };
  });

export const deleteAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);
    const { error } = await context.supabase.from("pitch_availability").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

// ---------------------------------------------------------------------------
// Team time preferences
// ---------------------------------------------------------------------------

export interface PreferenceRow {
  id: string;
  teamId: string;
  teamName: string;
  weekday: number;
  startsAt: string | null;
  endsAt: string | null;
  kind: "preferred" | "avoid" | "unavailable";
}

export const listPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, competitionId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<PreferenceRow[]> => {
    await requireOrgAccess(context.supabase, context.userId, data.orgSlug);

    const { data: rows, error } = await context.supabase
      .from("team_time_preferences")
      .select("id, team_id, weekday, starts_at, ends_at, kind, teams(name)")
      .eq("competition_id", data.competitionId)
      .order("weekday");

    if (error) throw new Error(error.message);

    return (
      (rows ?? []) as unknown as {
        id: string;
        team_id: string;
        weekday: number;
        starts_at: string | null;
        ends_at: string | null;
        kind: PreferenceRow["kind"];
        teams: { name: string } | null;
      }[]
    ).map((r) => ({
      id: r.id,
      teamId: r.team_id,
      teamName: r.teams?.name ?? "",
      weekday: r.weekday,
      startsAt: r.starts_at ? shortTime(r.starts_at) : null,
      endsAt: r.ends_at ? shortTime(r.ends_at) : null,
      kind: r.kind,
    }));
  });

const nullableTime = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  TIME.nullable(),
);

export const createPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        orgSlug,
        competitionId: uuid,
        teamId: uuid,
        weekday: WEEKDAY,
        startsAt: nullableTime,
        endsAt: nullableTime,
        kind: z.enum(["preferred", "avoid", "unavailable"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { orgId } = await requireOrgEditor(context.supabase, context.userId, data.orgSlug);
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) {
      throw new Error("END_BEFORE_START");
    }

    const { data: row, error } = await context.supabase
      .from("team_time_preferences")
      .insert({
        org_id: orgId,
        competition_id: data.competitionId,
        team_id: data.teamId,
        weekday: data.weekday,
        starts_at: data.startsAt,
        ends_at: data.endsAt,
        kind: data.kind,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return row as { id: string };
  });

export const deletePreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);
    const { error } = await context.supabase
      .from("team_time_preferences")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

export interface AllocationPreviewRow {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  round: number | null;
  date: string;
  time: string;
  pitchName: string;
  venueName: string;
}

export interface AllocationPreview {
  assignments: AllocationPreviewRow[];
  unassigned: { matchId: string; label: string; reason: string }[];
  timeZone: string;
}

const allocateInput = z.object({
  orgSlug,
  competitionId: uuid,
  fromDate: DATE,
  toDate: DATE,
});

/**
 * Gather everything the allocator needs and run it.
 *
 * Only matches that have no kick-off yet are considered. A match somebody moved
 * by hand, or one already played, is left exactly where it is — an
 * auto-scheduler that silently rearranges settled fixtures is worse than none.
 */
async function buildAllocation(
  supabase: Parameters<typeof requireOrgAccess>[0],
  orgId: string,
  input: z.infer<typeof allocateInput>,
) {
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("timezone")
    .eq("id", orgId)
    .single();
  if (orgError) throw new Error(orgError.message);

  const { data: matchRows, error: matchError } = await supabase
    .from("matches")
    .select(
      "id, round_number, home_team_id, away_team_id, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)",
    )
    .eq("competition_id", input.competitionId)
    .is("kickoff_at", null)
    .eq("status", "scheduled");
  if (matchError) throw new Error(matchError.message);

  const { data: windowRows, error: windowError } = await supabase
    .from("pitch_availability")
    .select("pitch_id, weekday, starts_at, ends_at, slot_minutes, pitches(name, venues(name))")
    .eq("org_id", orgId);
  if (windowError) throw new Error(windowError.message);

  const { data: preferenceRows, error: preferenceError } = await supabase
    .from("team_time_preferences")
    .select("team_id, weekday, starts_at, ends_at, kind")
    .eq("competition_id", input.competitionId);
  if (preferenceError) throw new Error(preferenceError.message);

  // Slots already used by matches this run is not allowed to move.
  const { data: bookedRows, error: bookedError } = await supabase
    .from("matches")
    .select("kickoff_at, pitch_id")
    .eq("org_id", orgId)
    .not("kickoff_at", "is", null)
    .not("pitch_id", "is", null);
  if (bookedError) throw new Error(bookedError.message);

  // Matches in THIS competition that already have a date. They anchor the
  // round order, so an auto-placed round 4 lands after a hand-placed round 3.
  const { data: anchorRows, error: anchorError } = await supabase
    .from("matches")
    .select("round_number, kickoff_at")
    .eq("competition_id", input.competitionId)
    .not("kickoff_at", "is", null);
  if (anchorError) throw new Error(anchorError.message);

  type MatchRecord = {
    id: string;
    round_number: number | null;
    home_team_id: string | null;
    away_team_id: string | null;
    home_team: { name: string } | null;
    away_team: { name: string } | null;
  };
  type WindowRecord = {
    pitch_id: string;
    weekday: number;
    starts_at: string;
    ends_at: string;
    slot_minutes: number;
    pitches: { name: string; venues: { name: string } | null } | null;
  };

  const matches = ((matchRows ?? []) as unknown as MatchRecord[]).filter(
    (m) => m.home_team_id && m.away_team_id,
  );

  const windows = (windowRows ?? []) as unknown as WindowRecord[];

  const pitchNames = new Map(
    windows.map((w) => [
      w.pitch_id,
      { pitch: w.pitches?.name ?? "", venue: w.pitches?.venues?.name ?? "" },
    ]),
  );

  const timeZone = (org as { timezone: string }).timezone;

  const alreadyScheduled = (
    (anchorRows ?? []) as { round_number: number | null; kickoff_at: string }[]
  )
    .filter((row) => row.round_number !== null)
    .map((row) => ({
      round: row.round_number!,
      // The allocator reasons in the league's local calendar, so an instant has
      // to be read back as the date the league would call it.
      date: isoToZonedInput(row.kickoff_at, timeZone).slice(0, 10),
    }))
    .filter((row) => row.date !== "");

  const allocation = allocateFixture(
    matches.map((m) => ({
      id: m.id,
      round: m.round_number ?? 1,
      homeTeamId: m.home_team_id!,
      awayTeamId: m.away_team_id!,
    })),
    {
      fromDate: input.fromDate,
      toDate: input.toDate,
      windows: windows.map((w): AvailabilityWindow => ({
        pitchId: w.pitch_id,
        weekday: w.weekday,
        startsAt: shortTime(w.starts_at),
        endsAt: shortTime(w.ends_at),
        slotMinutes: w.slot_minutes,
      })),
      preferences: (
        (preferenceRows ?? []) as unknown as {
          team_id: string;
          weekday: number;
          starts_at: string | null;
          ends_at: string | null;
          kind: TimePreference["kind"];
        }[]
      ).map((p): TimePreference => ({
        teamId: p.team_id,
        weekday: p.weekday,
        startsAt: p.starts_at ? shortTime(p.starts_at) : null,
        endsAt: p.ends_at ? shortTime(p.ends_at) : null,
        kind: p.kind,
      })),
      alreadyScheduled,
    },
  );

  // Drop any assignment that lands on a pitch and instant already committed to
  // another match, anywhere in the league.
  const booked = new Set(
    ((bookedRows ?? []) as { kickoff_at: string; pitch_id: string }[]).map(
      (b) => `${b.pitch_id}@${b.kickoff_at}`,
    ),
  );

  const labelOf = (id: string) => {
    const m = matches.find((x) => x.id === id);
    return `${m?.home_team?.name ?? "?"} v ${m?.away_team?.name ?? "?"}`;
  };

  return { allocation, matches, pitchNames, timeZone, booked, labelOf };
}

export const previewAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => allocateInput.parse(input))
  .handler(async ({ data, context }): Promise<AllocationPreview> => {
    const { orgId } = await requireOrgAccess(context.supabase, context.userId, data.orgSlug);
    const { allocation, matches, pitchNames, timeZone, labelOf } = await buildAllocation(
      context.supabase,
      orgId,
      data,
    );

    return {
      timeZone,
      assignments: allocation.assignments.map((a) => {
        const match = matches.find((m) => m.id === a.matchId);
        const names = pitchNames.get(a.pitchId);
        return {
          matchId: a.matchId,
          homeTeamName: match?.home_team?.name ?? "",
          awayTeamName: match?.away_team?.name ?? "",
          round: match?.round_number ?? null,
          date: a.date,
          time: a.time,
          pitchName: names?.pitch ?? "",
          venueName: names?.venue ?? "",
        };
      }),
      unassigned: allocation.unassigned.map((u) => ({
        matchId: u.matchId,
        label: labelOf(u.matchId),
        reason: u.reason,
      })),
    };
  });

export const applyAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => allocateInput.parse(input))
  .handler(async ({ data, context }): Promise<{ scheduled: number; skipped: number }> => {
    const { orgId } = await requireOrgEditor(context.supabase, context.userId, data.orgSlug);
    const { allocation, timeZone, booked } = await buildAllocation(context.supabase, orgId, data);

    let scheduled = 0;
    let skipped = 0;

    for (const assignment of allocation.assignments) {
      // The allocator works in the league's wall clock; the database stores an
      // instant. This is the one place that conversion happens.
      const iso = zonedInputToIso(`${assignment.date}T${assignment.time}`, timeZone);
      if (!iso) {
        skipped += 1;
        continue;
      }

      if (booked.has(`${assignment.pitchId}@${iso}`)) {
        skipped += 1;
        continue;
      }

      const { error } = await context.supabase
        .from("matches")
        .update({ kickoff_at: iso, pitch_id: assignment.pitchId })
        .eq("id", assignment.matchId)
        // Belt and braces: never move a match that gained a kick-off while this
        // was being computed.
        .is("kickoff_at", null);

      if (error) throw new Error(error.message);
      booked.add(`${assignment.pitchId}@${iso}`);
      scheduled += 1;
    }

    return { scheduled, skipped };
  });
