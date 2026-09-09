import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgAccess, requireOrgEditor } from "@/features/organizations/membership";
import { orgSlug, uuid } from "@/features/catalog/validation";
import type { Competition, CompetitionFormat, CompetitionStatus, RegisteredTeam } from "./types";

const UNIQUE_VIOLATION = "23505";

interface CompetitionRow {
  id: string;
  name: string;
  season_id: string;
  division_id: string;
  format: CompetitionFormat;
  rounds: number;
  points_win: number;
  points_draw: number;
  points_loss: number;
  suspension_yellow_cards: number;
  status: CompetitionStatus;
  is_published: boolean;
  seasons: { name: string } | null;
  divisions: { name: string } | null;
  team_registrations: { count: number }[];
  matches: { count: number }[];
}

const SELECT =
  "id, name, season_id, division_id, format, rounds, points_win, points_draw, points_loss, suspension_yellow_cards, status, is_published, seasons(name), divisions(name), team_registrations(count), matches(count)";

const toCompetition = (r: CompetitionRow): Competition => ({
  id: r.id,
  name: r.name,
  seasonId: r.season_id,
  seasonName: r.seasons?.name ?? "",
  divisionId: r.division_id,
  divisionName: r.divisions?.name ?? "",
  format: r.format,
  rounds: r.rounds,
  pointsWin: r.points_win,
  pointsDraw: r.points_draw,
  pointsLoss: r.points_loss,
  suspensionYellowCards: r.suspension_yellow_cards,
  status: r.status,
  isPublished: r.is_published,
  teamCount: r.team_registrations?.[0]?.count ?? 0,
  matchCount: r.matches?.[0]?.count ?? 0,
});

export const listCompetitions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug }).parse(input))
  .handler(async ({ data, context }): Promise<Competition[]> => {
    const { orgId } = await requireOrgAccess(context.supabase, context.userId, data.orgSlug);

    const { data: rows, error } = await context.supabase
      .from("competitions")
      .select(SELECT)
      .eq("org_id", orgId)
      .order("name");

    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as CompetitionRow[]).map(toCompetition);
  });

export const getCompetition = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<Competition | null> => {
    await requireOrgAccess(context.supabase, context.userId, data.orgSlug);

    const { data: row, error } = await context.supabase
      .from("competitions")
      .select(SELECT)
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return row ? toCompetition(row as unknown as CompetitionRow) : null;
  });

const competitionInput = z.object({
  orgSlug,
  seasonId: uuid,
  divisionId: uuid,
  name: z.string().trim().min(2).max(80),
  format: z.enum(["league", "cup", "league_finals"]),
  rounds: z.coerce.number().int().min(1).max(4),
  pointsWin: z.coerce.number().int().min(0).max(10),
  pointsDraw: z.coerce.number().int().min(0).max(10),
  pointsLoss: z.coerce.number().int().min(0).max(10),
  suspensionYellowCards: z.coerce.number().int().min(0).max(20),
});

export const createCompetition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => competitionInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { orgId } = await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    // org_id is overwritten by a trigger from the season, which also refuses a
    // season and division that belong to different leagues.
    const { data: row, error } = await context.supabase
      .from("competitions")
      .insert({
        org_id: orgId,
        season_id: data.seasonId,
        division_id: data.divisionId,
        name: data.name,
        format: data.format,
        rounds: data.rounds,
        points_win: data.pointsWin,
        points_draw: data.pointsDraw,
        points_loss: data.pointsLoss,
        suspension_yellow_cards: data.suspensionYellowCards,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new Error("NAME_TAKEN");
      throw new Error(error.message);
    }
    return row as { id: string };
  });

export const updateCompetition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => competitionInput.extend({ id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const { error } = await context.supabase
      .from("competitions")
      .update({
        season_id: data.seasonId,
        division_id: data.divisionId,
        name: data.name,
        format: data.format,
        rounds: data.rounds,
        points_win: data.pointsWin,
        points_draw: data.pointsDraw,
        points_loss: data.pointsLoss,
        suspension_yellow_cards: data.suspensionYellowCards,
      })
      .eq("id", data.id);

    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new Error("NAME_TAKEN");
      throw new Error(error.message);
    }
    return { id: data.id };
  });

export const setCompetitionPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ orgSlug, id: uuid, isPublished: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const { error } = await context.supabase
      .from("competitions")
      .update({
        is_published: data.isPublished,
        published_at: data.isPublished ? new Date().toISOString() : null,
      })
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { id: data.id };
  });

export const deleteCompetition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);
    const { error } = await context.supabase.from("competitions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

// ---------------------------------------------------------------------------
// Which teams are in it
// ---------------------------------------------------------------------------

interface RegistrationRow {
  team_id: string;
  teams: { name: string; short_name: string | null } | null;
}

export const listRegistrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, competitionId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<RegisteredTeam[]> => {
    await requireOrgAccess(context.supabase, context.userId, data.orgSlug);

    const { data: rows, error } = await context.supabase
      .from("team_registrations")
      .select("team_id, teams(name, short_name)")
      .eq("competition_id", data.competitionId);

    if (error) throw new Error(error.message);

    return ((rows ?? []) as unknown as RegistrationRow[])
      .map((r) => ({
        teamId: r.team_id,
        name: r.teams?.name ?? "",
        shortName: r.teams?.short_name ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

export const registerTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ orgSlug, competitionId: uuid, teamId: uuid }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ teamId: string }> => {
    const { orgId } = await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const { error } = await context.supabase.from("team_registrations").insert({
      competition_id: data.competitionId,
      team_id: data.teamId,
      org_id: orgId,
    });

    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new Error("ALREADY_REGISTERED");
      throw new Error(error.message);
    }
    return { teamId: data.teamId };
  });

export const unregisterTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ orgSlug, competitionId: uuid, teamId: uuid }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ teamId: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    // A team with matches already drawn can't quietly disappear — the fixture
    // would keep rows pointing at a team nobody registered.
    const { count, error: countError } = await context.supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("competition_id", data.competitionId)
      .or(`home_team_id.eq.${data.teamId},away_team_id.eq.${data.teamId}`);

    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 0) throw new Error("HAS_MATCHES");

    const { error } = await context.supabase
      .from("team_registrations")
      .delete()
      .eq("competition_id", data.competitionId)
      .eq("team_id", data.teamId);

    if (error) throw new Error(error.message);
    return { teamId: data.teamId };
  });
