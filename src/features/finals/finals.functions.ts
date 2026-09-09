import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgAccess, requireOrgEditor } from "@/features/organizations/membership";
import { orgSlug, uuid } from "@/features/catalog/validation";
import {
  buildBracket,
  championOf,
  resolveBracket,
  type BracketMatch,
  type BracketResult,
  type BracketSize,
  type FinalsStage,
} from "@/lib/finals/bracket";
import { computeStandings } from "@/lib/standings/table";

/**
 * The bracket's shape lives in the match rows themselves: `stage` says which
 * round, and the source columns say which earlier match feeds each place. That
 * means there is no separate bracket table to drift out of step with the
 * fixture — but it also means the key used by the pure functions has to be
 * rebuilt from the rows each time. `bracketKeyOf` is that mapping.
 */
const STAGE_PREFIX: Record<FinalsStage, string> = {
  quarter_final: "qf",
  semi_final: "sf",
  final: "final",
  third_place: "third",
};

function bracketKeyOf(stage: FinalsStage, order: number): string {
  const prefix = STAGE_PREFIX[stage];
  return stage === "final" || stage === "third_place" ? prefix : `${prefix}${order}`;
}

export interface FinalsMatch {
  id: string;
  key: string;
  stage: FinalsStage;
  order: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeSourceKey: string | null;
  awaySourceKey: string | null;
  kickoffAt: string | null;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamId: string | null;
}

export interface FinalsView {
  matches: FinalsMatch[];
  championTeamId: string | null;
  championTeamName: string | null;
}

interface FinalsRecord {
  id: string;
  stage: FinalsStage;
  round_number: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_source_match_id: string | null;
  home_source_rule: "winner" | "loser" | null;
  away_source_match_id: string | null;
  away_source_rule: "winner" | "loser" | null;
  kickoff_at: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: string | null;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
}

const FINALS_SELECT =
  "id, stage, round_number, home_team_id, away_team_id, home_source_match_id, home_source_rule," +
  "away_source_match_id, away_source_rule, kickoff_at, status, home_score, away_score, winner_team_id," +
  "home_team:teams!matches_home_team_id_fkey(name)," +
  "away_team:teams!matches_away_team_id_fkey(name)";

/** Knockout rows carry their position in the stage in `round_number`. */
async function loadFinals(
  supabase: Parameters<typeof requireOrgAccess>[0],
  competitionId: string,
): Promise<FinalsRecord[]> {
  const { data, error } = await supabase
    .from("matches")
    .select(FINALS_SELECT)
    .eq("competition_id", competitionId)
    .neq("stage", "regular")
    .order("stage")
    .order("round_number");

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FinalsRecord[];
}

function toBracket(records: FinalsRecord[]): {
  bracket: BracketMatch[];
  results: BracketResult[];
  keyById: Map<string, string>;
} {
  const keyById = new Map(
    records.map((r) => [r.id, bracketKeyOf(r.stage, r.round_number ?? 1)] as const),
  );

  const bracket: BracketMatch[] = records.map((r) => {
    const key = keyById.get(r.id)!;
    const slotFor = (
      teamId: string | null,
      sourceId: string | null,
      rule: "winner" | "loser" | null,
    ) => {
      if (sourceId && rule) {
        const from = keyById.get(sourceId);
        if (from) return { kind: rule, from } as const;
      }
      // A first-round place with the team already written in.
      return { kind: "seed" as const, teamId: teamId ?? "", seed: 0 };
    };

    return {
      key,
      stage: r.stage,
      order: r.round_number ?? 1,
      home: slotFor(r.home_team_id, r.home_source_match_id, r.home_source_rule),
      away: slotFor(r.away_team_id, r.away_source_match_id, r.away_source_rule),
    };
  });

  const results: BracketResult[] = records.map((r) => ({
    key: keyById.get(r.id)!,
    homeTeamId: r.home_team_id,
    awayTeamId: r.away_team_id,
    homeScore: r.home_score,
    awayScore: r.away_score,
    status: r.status,
    winnerTeamId: r.winner_team_id,
  }));

  return { bracket, results, keyById };
}

export const getFinals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, competitionId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<FinalsView> => {
    await requireOrgAccess(context.supabase, context.userId, data.orgSlug);

    const records = await loadFinals(context.supabase, data.competitionId);
    const { bracket, results, keyById } = toBracket(records);

    const championTeamId = championOf(bracket, results);
    const names = new Map<string, string>();
    for (const record of records) {
      if (record.home_team_id && record.home_team)
        names.set(record.home_team_id, record.home_team.name);
      if (record.away_team_id && record.away_team)
        names.set(record.away_team_id, record.away_team.name);
    }

    return {
      championTeamId,
      championTeamName: championTeamId ? (names.get(championTeamId) ?? null) : null,
      matches: records.map((r) => ({
        id: r.id,
        key: keyById.get(r.id)!,
        stage: r.stage,
        order: r.round_number ?? 1,
        homeTeamId: r.home_team_id,
        awayTeamId: r.away_team_id,
        homeTeamName: r.home_team?.name ?? null,
        awayTeamName: r.away_team?.name ?? null,
        homeSourceKey: r.home_source_match_id
          ? (keyById.get(r.home_source_match_id) ?? null)
          : null,
        awaySourceKey: r.away_source_match_id
          ? (keyById.get(r.away_source_match_id) ?? null)
          : null,
        kickoffAt: r.kickoff_at,
        status: r.status,
        homeScore: r.home_score,
        awayScore: r.away_score,
        winnerTeamId: r.winner_team_id,
      })),
    };
  });

export const generateFinals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        orgSlug,
        competitionId: uuid,
        size: z.coerce
          .number()
          .int()
          .refine((n): n is BracketSize => [2, 4, 8].includes(n)),
        thirdPlace: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ created: number }> => {
    const { orgId } = await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const existing = await loadFinals(context.supabase, data.competitionId);
    if (existing.length > 0) throw new Error("ALREADY_HAS_FINALS");

    const { data: competition, error: compError } = await context.supabase
      .from("competitions")
      .select("points_win, points_draw, points_loss")
      .eq("id", data.competitionId)
      .single();
    if (compError) throw new Error(compError.message);

    const { data: registrations, error: regError } = await context.supabase
      .from("team_registrations")
      .select("team_id, teams(name)")
      .eq("competition_id", data.competitionId);
    if (regError) throw new Error(regError.message);

    const { data: leagueMatches, error: matchError } = await context.supabase
      .from("matches")
      .select("home_team_id, away_team_id, home_score, away_score, status")
      .eq("competition_id", data.competitionId)
      .eq("stage", "regular");
    if (matchError) throw new Error(matchError.message);

    const teams = (
      (registrations ?? []) as unknown as { team_id: string; teams: { name: string } | null }[]
    ).map((r) => ({ id: r.team_id, name: r.teams?.name ?? "" }));

    const points = competition as { points_win: number; points_draw: number; points_loss: number };

    // Map the columns explicitly. Handing the raw rows to computeStandings and
    // silencing the mismatch with a cast is how this shipped seeded
    // alphabetically: every snake_case field read as undefined, so no match
    // counted, every team finished on zero, and the last tiebreaker — team name
    // — decided the entire bracket.
    const table = computeStandings(
      teams,
      (
        (leagueMatches ?? []) as {
          home_team_id: string | null;
          away_team_id: string | null;
          home_score: number | null;
          away_score: number | null;
          status: string;
        }[]
      ).map((m) => ({
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
        homeScore: m.home_score,
        awayScore: m.away_score,
        status: m.status,
      })),
      { win: points.points_win, draw: points.points_draw, loss: points.points_loss },
    );

    // A bracket seeded off an empty ladder is meaningless, and the failure is
    // invisible once the rows exist. Refuse instead.
    if (table.every((row) => row.played === 0)) throw new Error("NO_RESULTS");

    // Seeding is the ladder, so the bracket is only as meaningful as the league
    // phase that produced it — which is the point of finishing top.
    const bracket = buildBracket(
      table.map((row) => row.teamId),
      { size: data.size as BracketSize, thirdPlace: data.thirdPlace },
    );

    // Two passes: rows first so every match has an id, then the source links,
    // because a match can only point at one that already exists.
    const idByKey = new Map<string, string>();

    for (const match of bracket) {
      const { data: row, error } = await context.supabase
        .from("matches")
        .insert({
          org_id: orgId,
          competition_id: data.competitionId,
          stage: match.stage,
          round_number: match.order,
          home_team_id: match.home.kind === "seed" ? match.home.teamId : null,
          away_team_id: match.away.kind === "seed" ? match.away.teamId : null,
        })
        .select("id")
        .single();

      if (error) throw new Error(error.message);
      idByKey.set(match.key, (row as { id: string }).id);
    }

    for (const match of bracket) {
      const home = match.home;
      const away = match.away;
      if (home.kind === "seed" && away.kind === "seed") continue;

      const { error } = await context.supabase
        .from("matches")
        .update({
          home_source_match_id: home.kind === "seed" ? null : (idByKey.get(home.from) ?? null),
          home_source_rule: home.kind === "seed" ? null : home.kind,
          away_source_match_id: away.kind === "seed" ? null : (idByKey.get(away.from) ?? null),
          away_source_rule: away.kind === "seed" ? null : away.kind,
        })
        .eq("id", idByKey.get(match.key)!);

      if (error) throw new Error(error.message);
    }

    return { created: bracket.length };
  });

/** Throw the bracket away, so it can be drawn again. */
export const clearFinals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, competitionId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ cleared: number }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const records = await loadFinals(context.supabase, data.competitionId);
    if (records.some((r) => r.status === "played" || r.status === "forfeit")) {
      throw new Error("HAS_RESULTS");
    }

    // Later rounds first: a match cannot be deleted while another still points
    // at it as its source.
    const ordered = [...records].sort(
      (a, b) =>
        ["quarter_final", "semi_final", "third_place", "final"].indexOf(b.stage) -
        ["quarter_final", "semi_final", "third_place", "final"].indexOf(a.stage),
    );

    for (const record of ordered) {
      const { error } = await context.supabase.from("matches").delete().eq("id", record.id);
      if (error) throw new Error(error.message);
    }

    return { cleared: records.length };
  });

/** Move whoever has qualified into the next round. */
export const resolveFinals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, competitionId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ updated: number }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const records = await loadFinals(context.supabase, data.competitionId);
    const { bracket, results, keyById } = toBracket(records);
    const idByKey = new Map([...keyById].map(([id, key]) => [key, id] as const));

    const resolutions = resolveBracket(bracket, results);
    let updated = 0;

    for (const resolution of resolutions) {
      const id = idByKey.get(resolution.key);
      if (!id) continue;

      const { error } = await context.supabase
        .from("matches")
        .update({ home_team_id: resolution.homeTeamId, away_team_id: resolution.awayTeamId })
        .eq("id", id);

      if (error) throw new Error(error.message);
      updated += 1;
    }

    return { updated };
  });

/** Record who went through when the score finished level. */
export const setMatchWinner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        orgSlug,
        matchId: uuid,
        winnerTeamId: z.preprocess(
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
      .update({ winner_team_id: data.winnerTeamId })
      .eq("id", data.matchId);

    if (error) throw new Error(error.message);
    return { id: data.matchId };
  });
