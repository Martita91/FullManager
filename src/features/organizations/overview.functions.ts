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

    const now = new Date().toISOString();

    // Eleven independent questions, asked at once.
    //
    // This is the whole reason the dashboard was the slowest screen in the
    // app: the six counters already ran together, and then five more queries
    // went out one at a time, each waiting on an answer it had no use for.
    // Nothing below depends on anything else below it.
    const [
      competitions,
      teams,
      people,
      venues,
      seasons,
      divisions,
      upcoming,
      missing,
      noKickoff,
      comps,
      org,
    ] = await Promise.all([
      countOf("competitions"),
      countOf("teams"),
      countOf("people"),
      countOf("venues"),
      countOf("seasons"),
      countOf("divisions"),

      supabase
        .from("matches")
        .select(
          "id, kickoff_at, competitions(name), home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name), pitches(venues(name))",
        )
        .eq("org_id", orgId)
        .eq("status", "scheduled")
        .not("kickoff_at", "is", null)
        .gte("kickoff_at", now)
        .order("kickoff_at")
        .limit(5),

      // Played in the past but still without a score: the single most common
      // thing a league forgets.
      supabase
        .from("matches")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "scheduled")
        .not("kickoff_at", "is", null)
        .lt("kickoff_at", now),

      supabase
        .from("matches")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "scheduled")
        .is("kickoff_at", null),

      supabase
        .from("competitions")
        .select("id, is_published, team_registrations(count), matches(count)")
        .eq("org_id", orgId),

      supabase.from("organizations").select("timezone").eq("id", orgId).single(),
    ]);

    if (upcoming.error) throw new Error(upcoming.error.message);
    if (missing.error) throw new Error(missing.error.message);
    if (noKickoff.error) throw new Error(noKickoff.error.message);
    if (comps.error) throw new Error(comps.error.message);
    if (org.error) throw new Error(org.error.message);

    const competitionRows = (comps.data ?? []) as unknown as {
      is_published: boolean;
      team_registrations: { count: number }[];
      matches: { count: number }[];
    }[];

    return {
      counts: { competitions, teams, people, venues, seasons, divisions },
      timeZone: (org.data as { timezone: string }).timezone,
      upcoming: (
        (upcoming.data ?? []) as unknown as {
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
        missingResults: missing.count ?? 0,
        matchesWithoutKickoff: noKickoff.count ?? 0,
        competitionsWithoutFixture: competitionRows.filter(
          (c) => (c.team_registrations?.[0]?.count ?? 0) > 0 && (c.matches?.[0]?.count ?? 0) === 0,
        ).length,
        unpublishedWithFixture: competitionRows.filter(
          (c) => !c.is_published && (c.matches?.[0]?.count ?? 0) > 0,
        ).length,
      },
    };
  });
