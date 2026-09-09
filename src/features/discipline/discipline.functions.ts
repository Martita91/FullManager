import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgAccess } from "@/features/organizations/membership";
import { orgSlug, uuid } from "@/features/catalog/validation";
import {
  computeSuspensions,
  tallyCards,
  upcomingSuspensions,
  type DisciplineEvent,
  type PlayerCards,
  type Suspension,
  type TeamRound,
} from "@/lib/discipline/suspensions";

export interface DisciplineView {
  threshold: number;
  cards: (PlayerCards & { teamName: string })[];
  suspensions: (Suspension & { teamName: string })[];
}

export const getDiscipline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, competitionId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<DisciplineView> => {
    await requireOrgAccess(context.supabase, context.userId, data.orgSlug);

    const { data: competition, error: compError } = await context.supabase
      .from("competitions")
      .select("suspension_yellow_cards")
      .eq("id", data.competitionId)
      .single();
    if (compError) throw new Error(compError.message);

    // Cards live on match_events; the round they were shown in lives on the
    // match, which is why this reads through the join rather than the event.
    const { data: eventRows, error: eventError } = await context.supabase
      .from("match_events")
      .select(
        "person_id, team_id, sport_event_types!inner(key), people(first_name, last_name), teams(name), matches!inner(round_number, competition_id, stage)",
      )
      .eq("matches.competition_id", data.competitionId)
      .in("sport_event_types.key", ["yellow_card", "red_card"]);
    if (eventError) throw new Error(eventError.message);

    const { data: matchRows, error: matchError } = await context.supabase
      .from("matches")
      .select("round_number, home_team_id, away_team_id")
      .eq("competition_id", data.competitionId)
      .eq("stage", "regular");
    if (matchError) throw new Error(matchError.message);

    type EventRecord = {
      person_id: string | null;
      team_id: string;
      sport_event_types: { key: string } | null;
      people: { first_name: string; last_name: string } | null;
      teams: { name: string } | null;
      matches: { round_number: number | null } | null;
    };

    const records = (eventRows ?? []) as unknown as EventRecord[];

    const teamNames = new Map<string, string>();
    for (const record of records) {
      if (record.teams) teamNames.set(record.team_id, record.teams.name);
    }

    // A card with no player attached can't suspend anyone, so it is counted in
    // no tally rather than being blamed on a placeholder.
    const events: DisciplineEvent[] = records
      .filter((r) => r.person_id !== null && r.matches?.round_number != null)
      .map((r) => ({
        personId: r.person_id!,
        personName: r.people ? `${r.people.first_name} ${r.people.last_name}` : "—",
        teamId: r.team_id,
        round: r.matches!.round_number!,
        kind: r.sport_event_types?.key === "red_card" ? "red" : "yellow",
      }));

    const teamRounds: TeamRound[] = (
      (matchRows ?? []) as {
        round_number: number | null;
        home_team_id: string | null;
        away_team_id: string | null;
      }[]
    ).flatMap((m) =>
      m.round_number === null
        ? []
        : [m.home_team_id, m.away_team_id]
            .filter((id): id is string => id !== null)
            .map((teamId) => ({ teamId, round: m.round_number! })),
    );

    const threshold = (competition as { suspension_yellow_cards: number }).suspension_yellow_cards;
    const options = { yellowsForSuspension: threshold };

    const withTeamName = <T extends { teamId: string }>(row: T) => ({
      ...row,
      teamName: teamNames.get(row.teamId) ?? "",
    });

    return {
      threshold,
      cards: tallyCards(events, options).map(withTeamName),
      suspensions: upcomingSuspensions(computeSuspensions(events, teamRounds, options)).map(
        withTeamName,
      ),
    };
  });
