import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgAccess, requireOrgEditor } from "@/features/organizations/membership";
import { optionalNumber, orgSlug, uuid } from "@/features/catalog/validation";
import { generateRoundRobin, roundCount } from "@/lib/scheduling/roundRobin";
import type { EventType, FixturePreview, MatchEvent, MatchRow, MatchStatus } from "./types";

interface MatchRecord {
  id: string;
  round_number: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  kickoff_at: string | null;
  pitch_id: string | null;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
  notes: string | null;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
  pitches: { name: string } | null;
}

// Two foreign keys point at `teams`, so each embed needs an explicit alias and
// the constraint it travels through — otherwise PostgREST can't tell them apart.
const MATCH_SELECT =
  "id, round_number, home_team_id, away_team_id, kickoff_at, pitch_id, status, home_score, away_score, notes," +
  "home_team:teams!matches_home_team_id_fkey(name)," +
  "away_team:teams!matches_away_team_id_fkey(name)," +
  "pitches(name)";

const toMatch = (r: MatchRecord): MatchRow => ({
  id: r.id,
  round: r.round_number,
  homeTeamId: r.home_team_id,
  awayTeamId: r.away_team_id,
  homeTeamName: r.home_team?.name ?? null,
  awayTeamName: r.away_team?.name ?? null,
  kickoffAt: r.kickoff_at,
  pitchId: r.pitch_id,
  pitchName: r.pitches?.name ?? null,
  status: r.status,
  homeScore: r.home_score,
  awayScore: r.away_score,
  notes: r.notes,
});

export const listMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, competitionId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<MatchRow[]> => {
    await requireOrgAccess(context.supabase, context.userId, data.orgSlug);

    const { data: rows, error } = await context.supabase
      .from("matches")
      .select(MATCH_SELECT)
      .eq("competition_id", data.competitionId)
      .order("round_number", { nullsFirst: false })
      .order("kickoff_at", { nullsFirst: false });

    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as MatchRecord[]).map(toMatch);
  });

/**
 * Work out a draw without writing anything.
 *
 * The preview exists so a league can look at the pairings — and reshuffle with
 * a different seed — before committing a season's worth of rows.
 */
export const previewFixture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ orgSlug, competitionId: uuid, seed: z.coerce.number().int().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<FixturePreview> => {
    await requireOrgAccess(context.supabase, context.userId, data.orgSlug);

    const { data: competition, error: compError } = await context.supabase
      .from("competitions")
      .select("rounds")
      .eq("id", data.competitionId)
      .single();
    if (compError) throw new Error(compError.message);

    const { data: registrations, error } = await context.supabase
      .from("team_registrations")
      .select("team_id")
      .eq("competition_id", data.competitionId);
    if (error) throw new Error(error.message);

    const teamIds = (registrations ?? []).map((r) => (r as { team_id: string }).team_id);
    if (teamIds.length < 2) throw new Error("TOO_FEW_TEAMS");

    const legs = (competition as { rounds: number }).rounds;
    const matches = generateRoundRobin(teamIds, { legs, seed: data.seed });

    return { rounds: roundCount(teamIds.length, legs), matches };
  });

/**
 * Write a generated draw.
 *
 * Refuses when the competition already has matches: regenerating over a live
 * fixture would silently discard results. Clearing it is a separate, explicit
 * act.
 */
export const commitFixture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ orgSlug, competitionId: uuid, seed: z.coerce.number().int().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ created: number }> => {
    const { orgId } = await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const { count, error: countError } = await context.supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("competition_id", data.competitionId);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 0) throw new Error("ALREADY_FIXTURED");

    const { data: competition, error: compError } = await context.supabase
      .from("competitions")
      .select("rounds")
      .eq("id", data.competitionId)
      .single();
    if (compError) throw new Error(compError.message);

    const { data: registrations, error } = await context.supabase
      .from("team_registrations")
      .select("team_id")
      .eq("competition_id", data.competitionId);
    if (error) throw new Error(error.message);

    const teamIds = (registrations ?? []).map((r) => (r as { team_id: string }).team_id);
    if (teamIds.length < 2) throw new Error("TOO_FEW_TEAMS");

    const draw = generateRoundRobin(teamIds, {
      legs: (competition as { rounds: number }).rounds,
      seed: data.seed,
    });

    const { error: insertError } = await context.supabase.from("matches").insert(
      draw.map((m) => ({
        org_id: orgId,
        competition_id: data.competitionId,
        round_number: m.round,
        home_team_id: m.homeTeamId,
        away_team_id: m.awayTeamId,
      })),
    );
    if (insertError) throw new Error(insertError.message);

    await context.supabase
      .from("competitions")
      .update({ status: "fixtured" })
      .eq("id", data.competitionId);

    return { created: draw.length };
  });

/** Throw the whole draw away. Only allowed while nothing has been played. */
export const clearFixture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, competitionId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ cleared: boolean }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const { count, error: countError } = await context.supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("competition_id", data.competitionId)
      .in("status", ["played", "forfeit"]);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 0) throw new Error("HAS_RESULTS");

    const { error } = await context.supabase
      .from("matches")
      .delete()
      .eq("competition_id", data.competitionId);
    if (error) throw new Error(error.message);

    await context.supabase
      .from("competitions")
      .update({ status: "draft" })
      .eq("id", data.competitionId);

    return { cleared: true };
  });

/** When and where a match is played. */
export const scheduleMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        orgSlug,
        matchId: uuid,
        // datetime-local gives "2026-10-03T09:00"; empty means unscheduled.
        kickoffAt: z.preprocess(
          (v) => (typeof v === "string" && v.trim() === "" ? null : v),
          z.string().nullable(),
        ),
        pitchId: z.preprocess(
          (v) => (typeof v === "string" && v.trim() === "" ? null : v),
          z.string().uuid().nullable(),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const { error } = await context.supabase
      .from("matches")
      .update({
        kickoff_at: data.kickoffAt ? new Date(data.kickoffAt).toISOString() : null,
        pitch_id: data.pitchId,
      })
      .eq("id", data.matchId);

    if (error) throw new Error(error.message);
    return { id: data.matchId };
  });

export const saveResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        orgSlug,
        matchId: uuid,
        status: z.enum(["scheduled", "played", "postponed", "cancelled", "forfeit"]),
        homeScore: optionalNumber(0, 999),
        awayScore: optionalNumber(0, 999),
        notes: z.preprocess(
          (v) => (typeof v === "string" && v.trim() === "" ? null : v),
          z.string().max(2000).nullable(),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    // A result that counts towards the ladder needs both scores. Saving "played"
    // with one side blank would drop the match out of the table with no hint why.
    if (
      (data.status === "played" || data.status === "forfeit") &&
      (data.homeScore === null || data.awayScore === null)
    ) {
      throw new Error("SCORE_REQUIRED");
    }

    const { error } = await context.supabase
      .from("matches")
      .update({
        status: data.status,
        home_score: data.homeScore,
        away_score: data.awayScore,
        notes: data.notes,
      })
      .eq("id", data.matchId);

    if (error) throw new Error(error.message);
    return { id: data.matchId };
  });

// ---------------------------------------------------------------------------
// The detail behind a score
// ---------------------------------------------------------------------------

export const listEventTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EventType[]> => {
    const { data, error } = await context.supabase
      .from("sport_event_types")
      .select("id, key, name, scores")
      .order("sort_order");

    if (error) throw new Error(error.message);
    return (data ?? []) as EventType[];
  });

interface EventRecord {
  id: string;
  team_id: string;
  person_id: string | null;
  event_type_id: string;
  minute: number | null;
  people: { first_name: string; last_name: string } | null;
  sport_event_types: { key: string; name: string } | null;
}

export const listMatchEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, matchId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<MatchEvent[]> => {
    await requireOrgAccess(context.supabase, context.userId, data.orgSlug);

    const { data: rows, error } = await context.supabase
      .from("match_events")
      .select(
        "id, team_id, person_id, event_type_id, minute, people(first_name, last_name), sport_event_types(key, name)",
      )
      .eq("match_id", data.matchId)
      .order("minute", { nullsFirst: false });

    if (error) throw new Error(error.message);

    return ((rows ?? []) as unknown as EventRecord[]).map((r) => ({
      id: r.id,
      teamId: r.team_id,
      personId: r.person_id,
      personName: r.people ? `${r.people.first_name} ${r.people.last_name}` : null,
      eventTypeId: r.event_type_id,
      eventKey: r.sport_event_types?.key ?? "",
      eventName: r.sport_event_types?.name ?? "",
      minute: r.minute,
    }));
  });

export const addMatchEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        orgSlug,
        matchId: uuid,
        teamId: uuid,
        personId: z.preprocess(
          (v) => (typeof v === "string" && v.trim() === "" ? null : v),
          z.string().uuid().nullable(),
        ),
        eventTypeId: uuid,
        minute: optionalNumber(0, 200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { orgId } = await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const { data: row, error } = await context.supabase
      .from("match_events")
      .insert({
        org_id: orgId,
        match_id: data.matchId,
        team_id: data.teamId,
        person_id: data.personId,
        event_type_id: data.eventTypeId,
        minute: data.minute,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return row as { id: string };
  });

export const deleteMatchEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);
    const { error } = await context.supabase.from("match_events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });
