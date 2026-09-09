import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgAccess } from "@/features/organizations/membership";
import { orgSlug } from "@/features/catalog/validation";

/**
 * What a league organiser needs on opening the dashboard: what exists, what is
 * about to be played, and what is half-finished.
 *
 * The last one is the point. Counts are reassuring and useless; a competition
 * with teams but no fixture, or a match played a week ago with no score, is
 * the thing that actually needs doing today.
 */
export interface OrgOverview {
  counts: {
    competitions: number;
    teams: number;
    people: number;
    venues: number;
    seasons: number;
    divisions: number;
  };
  upcoming: {
    matchId: string;
    competitionName: string;
    homeTeamName: string;
    awayTeamName: string;
    kickoffAt: string;
    venueName: string | null;
  }[];
  attention: {
    missingResults: number;
    competitionsWithoutFixture: number;
    unpublishedWithFixture: number;
    matchesWithoutKickoff: number;
  };
  timeZone: string;
}

export const getOrgOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug }).parse(input))
  .handler(async ({ data, context }): Promise<OrgOverview> => {
    const { orgId } = await requireOrgAccess(context.supabase, context.userId, data.orgSlug);
    const supabase = context.supabase;

    const countOf = async (table: string) => {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId);
      if (error) throw new Error(error.message);
      return count ?? 0;
    };

    const [competitions, teams, people, venues, seasons, divisions] = await Promise.all([
      countOf("competitions"),
      countOf("teams"),
      countOf("people"),
      countOf("venues"),
      countOf("seasons"),
      countOf("divisions"),
    ]);

    const now = new Date().toISOString();

    const { data: upcomingRows, error: upcomingError } = await supabase
      .from("matches")
      .select(
        "id, kickoff_at, competitions(name), home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name), pitches(venues(name))",
      )
      .eq("org_id", orgId)
      .eq("status", "scheduled")
      .not("kickoff_at", "is", null)
      .gte("kickoff_at", now)
      .order("kickoff_at")
      .limit(5);
    if (upcomingError) throw new Error(upcomingError.message);

    // Played in the past but still without a score: the single most common
    // thing a league forgets.
    const { count: missingResults, error: missingError } = await supabase
      .from("matches")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "scheduled")
      .not("kickoff_at", "is", null)
      .lt("kickoff_at", now);
    if (missingError) throw new Error(missingError.message);

    const { count: matchesWithoutKickoff, error: noKickoffError } = await supabase
      .from("matches")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "scheduled")
      .is("kickoff_at", null);
    if (noKickoffError) throw new Error(noKickoffError.message);

    const { data: compRows, error: compError } = await supabase
      .from("competitions")
      .select("id, is_published, team_registrations(count), matches(count)")
      .eq("org_id", orgId);
    if (compError) throw new Error(compError.message);

    const comps = (compRows ?? []) as unknown as {
      is_published: boolean;
      team_registrations: { count: number }[];
      matches: { count: number }[];
    }[];

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("timezone")
      .eq("id", orgId)
      .single();
    if (orgError) throw new Error(orgError.message);

    return {
      counts: { competitions, teams, people, venues, seasons, divisions },
      timeZone: (org as { timezone: string }).timezone,
      upcoming: (
        (upcomingRows ?? []) as unknown as {
          id: string;
          kickoff_at: string;
          competitions: { name: string } | null;
          home_team: { name: string } | null;
          away_team: { name: string } | null;
          pitches: { venues: { name: string } | null } | null;
        }[]
      ).map((m) => ({
        matchId: m.id,
        competitionName: m.competitions?.name ?? "",
        homeTeamName: m.home_team?.name ?? "",
        awayTeamName: m.away_team?.name ?? "",
        kickoffAt: m.kickoff_at,
        venueName: m.pitches?.venues?.name ?? null,
      })),
      attention: {
        missingResults: missingResults ?? 0,
        matchesWithoutKickoff: matchesWithoutKickoff ?? 0,
        competitionsWithoutFixture: comps.filter(
          (c) => (c.team_registrations?.[0]?.count ?? 0) > 0 && (c.matches?.[0]?.count ?? 0) === 0,
        ).length,
        unpublishedWithFixture: comps.filter(
          (c) => !c.is_published && (c.matches?.[0]?.count ?? 0) > 0,
        ).length,
      },
    };
  });
