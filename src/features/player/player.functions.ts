import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { uuid } from "@/features/catalog/validation";
import type { MatchStatus } from "@/features/competitions/types";

export interface PlayerProfile {
  personId: string;
  firstName: string;
  lastName: string;
  orgId: string;
  orgSlug: string | null;
  orgName: string | null;
  timeZone: string;
  teams: { id: string; name: string; shirtNumber: number | null }[];
}

export interface PlayerMatch {
  id: string;
  competitionId: string;
  competitionName: string;
  kickoffAt: string | null;
  status: MatchStatus;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  venueName: string | null;
  isHome: boolean;
}

export interface PlayerStats {
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
}

/**
 * Every player record linked to this account.
 *
 * A person can play in more than one league, and each league holds its own row
 * — they are different people as far as the data is concerned, linked only by
 * the account that claimed them.
 */
export const getMyProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlayerProfile[]> => {
    const { data: rows, error } = await context.supabase
      .from("people")
      .select(
        "id, first_name, last_name, org_id, organizations(slug, name, timezone), team_memberships(team_id, shirt_number, teams(name))",
      )
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);

    return (
      (rows ?? []) as unknown as {
        id: string;
        first_name: string;
        last_name: string;
        org_id: string;
        organizations: { slug: string; name: string; timezone: string } | null;
        team_memberships: {
          team_id: string;
          shirt_number: number | null;
          teams: { name: string } | null;
        }[];
      }[]
    ).map((row) => ({
      personId: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      orgId: row.org_id,
      orgSlug: row.organizations?.slug ?? null,
      orgName: row.organizations?.name ?? null,
      timeZone: row.organizations?.timezone ?? "UTC",
      teams: (row.team_memberships ?? []).map((m) => ({
        id: m.team_id,
        name: m.teams?.name ?? "",
        shirtNumber: m.shirt_number,
      })),
    }));
  });

/**
 * Link this account to a player record the league already typed in, matching on
 * the email address the caller signed in with.
 */
export const claimProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ personId: string | null }> => {
    const { data: personId, error } = await context.supabase.rpc("claim_player_profile", {
      p_org: data.orgId,
    });

    if (error) throw new Error(error.message);
    return { personId: (personId as string | null) ?? null };
  });

/** Matches for the teams this player belongs to, in published competitions. */
export const getMyMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ teamIds: z.array(uuid).max(50) }).parse(input))
  .handler(async ({ data, context }): Promise<PlayerMatch[]> => {
    if (data.teamIds.length === 0) return [];

    const list = data.teamIds.join(",");
    const { data: rows, error } = await context.supabase
      .from("matches")
      .select(
        "id, competition_id, kickoff_at, status, home_team_id, away_team_id, home_score, away_score," +
          "competitions(name)," +
          "home_team:teams!matches_home_team_id_fkey(name)," +
          "away_team:teams!matches_away_team_id_fkey(name)," +
          "pitches(venues(name))",
      )
      .or(`home_team_id.in.(${list}),away_team_id.in.(${list})`)
      .order("kickoff_at", { nullsFirst: false });

    if (error) throw new Error(error.message);

    const mine = new Set(data.teamIds);

    return (
      (rows ?? []) as unknown as {
        id: string;
        competition_id: string;
        kickoff_at: string | null;
        status: MatchStatus;
        home_team_id: string | null;
        away_team_id: string | null;
        home_score: number | null;
        away_score: number | null;
        competitions: { name: string } | null;
        home_team: { name: string } | null;
        away_team: { name: string } | null;
        pitches: { venues: { name: string } | null } | null;
      }[]
    ).map((m) => ({
      id: m.id,
      competitionId: m.competition_id,
      competitionName: m.competitions?.name ?? "",
      kickoffAt: m.kickoff_at,
      status: m.status,
      homeTeamName: m.home_team?.name ?? null,
      awayTeamName: m.away_team?.name ?? null,
      homeScore: m.home_score,
      awayScore: m.away_score,
      venueName: m.pitches?.venues?.name ?? null,
      isHome: m.home_team_id !== null && mine.has(m.home_team_id),
    }));
  });

/**
 * What this player has done, counted from published competitions only — the
 * same numbers anyone else would see.
 */
export const getMyStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ personId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<PlayerStats> => {
    const { data: rows, error } = await context.supabase
      .from("public_match_events")
      .select("event_key")
      .eq("person_id", data.personId);

    if (error) throw new Error(error.message);

    const events = (rows ?? []) as { event_key: string }[];
    const count = (key: string) => events.filter((e) => e.event_key === key).length;

    return {
      goals: count("goal") + count("penalty_goal"),
      assists: count("assist"),
      yellowCards: count("yellow_card"),
      redCards: count("red_card"),
    };
  });
