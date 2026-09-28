import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { publicSupabase } from "@/integrations/supabase/public-client";
import { uuid } from "@/features/catalog/validation";
import type { MatchStatus } from "@/features/competitions/types";

/**
 * Everything here reads as an anonymous visitor. There is no auth middleware on
 * purpose: RLS decides what comes back, and the answer must not depend on who
 * is looking.
 */

export interface PublicOrganization {
  id: string;
  slug: string;
  name: string;
  timezone: string;
}

export interface PublicCompetitionSummary {
  id: string;
  name: string;
  seasonName: string;
  divisionName: string;
  teamCount: number;
}

export interface PublicMatch {
  id: string;
  round: number | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  kickoffAt: string | null;
  venueName: string | null;
  pitchName: string | null;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
}

export interface PublicCompetition {
  id: string;
  name: string;
  seasonName: string;
  divisionName: string;
  organization: PublicOrganization;
  points: { win: number; draw: number; loss: number };
  teams: { id: string; name: string }[];
  matches: PublicMatch[];
}

export const getPublicOrganization = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ slug: z.string().trim().min(1).max(48) }).parse(input))
  .handler(
    async ({
      data,
    }): Promise<{
      organization: PublicOrganization;
      competitions: PublicCompetitionSummary[];
    } | null> => {
      const supabase = publicSupabase();

      const { data: org, error } = await supabase
        .from("organizations")
        .select("id, slug, name, timezone")
        .eq("slug", data.slug)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!org) return null;

      const organization = org as PublicOrganization;

      const { data: comps, error: compError } = await supabase
        .from("competitions")
        .select("id, name, seasons(name), divisions(name), team_registrations(count)")
        .eq("org_id", organization.id)
        .order("name");

      if (compError) throw new Error(compError.message);

      const competitions = (
        (comps ?? []) as unknown as {
          id: string;
          name: string;
          seasons: { name: string } | null;
          divisions: { name: string } | null;
          team_registrations: { count: number }[];
        }[]
      ).map((c) => ({
        id: c.id,
        name: c.name,
        seasonName: c.seasons?.name ?? "",
        divisionName: c.divisions?.name ?? "",
        teamCount: c.team_registrations?.[0]?.count ?? 0,
      }));

      return { organization, competitions };
    },
  );

const MATCH_SELECT =
  "id, round_number, home_team_id, away_team_id, kickoff_at, status, home_score, away_score," +
  "home_team:teams!matches_home_team_id_fkey(name)," +
  "away_team:teams!matches_away_team_id_fkey(name)," +
  "pitches(name, venues(name))";

export const getPublicCompetition = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ competitionId: uuid }).parse(input))
  .handler(async ({ data }): Promise<PublicCompetition | null> => {
    const supabase = publicSupabase();

    // Three queries, one identifier, no dependencies between them. This is the
    // page a prospect clicks first, and it was making them in single file.
    const [comp, registrations, matches] = await Promise.all([
      supabase
        .from("competitions")
        .select(
          "id, name, points_win, points_draw, points_loss, seasons(name), divisions(name), organizations(id, slug, name, timezone)",
        )
        .eq("id", data.competitionId)
        .maybeSingle(),

      supabase
        .from("team_registrations")
        .select("team_id, teams(name)")
        .eq("competition_id", data.competitionId),

      supabase
        .from("matches")
        .select(MATCH_SELECT)
        .eq("competition_id", data.competitionId)
        .order("round_number", { nullsFirst: false })
        .order("kickoff_at", { nullsFirst: false }),
    ]);

    if (comp.error) throw new Error(comp.error.message);
    if (!comp.data) return null;
    if (registrations.error) throw new Error(registrations.error.message);
    if (matches.error) throw new Error(matches.error.message);

    const row = comp.data as unknown as {
      id: string;
      name: string;
      points_win: number;
      points_draw: number;
      points_loss: number;
      seasons: { name: string } | null;
      divisions: { name: string } | null;
      organizations: PublicOrganization | null;
    };

    if (!row.organizations) return null;

    return {
      id: row.id,
      name: row.name,
      seasonName: row.seasons?.name ?? "",
      divisionName: row.divisions?.name ?? "",
      organization: row.organizations,
      points: { win: row.points_win, draw: row.points_draw, loss: row.points_loss },
      teams: (
        (registrations.data ?? []) as unknown as {
          team_id: string;
          teams: { name: string } | null;
        }[]
      )
        .map((r) => ({ id: r.team_id, name: r.teams?.name ?? "" }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      matches: (
        (matches.data ?? []) as unknown as {
          id: string;
          round_number: number | null;
          home_team_id: string | null;
          away_team_id: string | null;
          kickoff_at: string | null;
          status: MatchStatus;
          home_score: number | null;
          away_score: number | null;
          home_team: { name: string } | null;
          away_team: { name: string } | null;
          pitches: { name: string; venues: { name: string } | null } | null;
        }[]
      ).map((m) => ({
        id: m.id,
        round: m.round_number,
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
        homeTeamName: m.home_team?.name ?? null,
        awayTeamName: m.away_team?.name ?? null,
        kickoffAt: m.kickoff_at,
        venueName: m.pitches?.venues?.name ?? null,
        pitchName: m.pitches?.name ?? null,
        status: m.status,
        homeScore: m.home_score,
        awayScore: m.away_score,
      })),
    };
  });
