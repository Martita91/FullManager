export type CompetitionFormat = "league" | "cup" | "league_finals";
export type CompetitionStatus = "draft" | "fixtured" | "in_progress" | "complete";
export type MatchStatus = "scheduled" | "played" | "postponed" | "cancelled" | "forfeit";

export const COMPETITION_FORMATS: readonly CompetitionFormat[] = ["league", "cup", "league_finals"];
export const MATCH_STATUSES: readonly MatchStatus[] = [
  "scheduled",
  "played",
  "postponed",
  "cancelled",
  "forfeit",
];

export interface Competition {
  id: string;
  name: string;
  seasonId: string;
  seasonName: string;
  divisionId: string;
  divisionName: string;
  format: CompetitionFormat;
  rounds: number;
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  suspensionYellowCards: number;
  status: CompetitionStatus;
  isPublished: boolean;
  teamCount: number;
  matchCount: number;
}

export interface RegisteredTeam {
  teamId: string;
  name: string;
  shortName: string | null;
}

export interface MatchRow {
  id: string;
  round: number | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  kickoffAt: string | null;
  pitchId: string | null;
  pitchName: string | null;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  notes: string | null;
}

export interface EventType {
  id: string;
  key: string;
  name: string;
  scores: boolean;
}

export interface MatchEvent {
  id: string;
  teamId: string;
  personId: string | null;
  personName: string | null;
  eventTypeId: string;
  eventKey: string;
  eventName: string;
  minute: number | null;
}

/** What a generated draw looks like before anything is written. */
export interface FixturePreview {
  rounds: number;
  matches: { round: number; homeTeamId: string; awayTeamId: string }[];
}
