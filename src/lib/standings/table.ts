/**
 * The ladder, computed from results rather than stored.
 *
 * Keeping this a pure function instead of a database view is a deliberate
 * trade: a stored table eventually drifts from the results it claims to
 * summarise, and a SQL function can't be unit tested. A league's worth of
 * matches is small enough that recomputing costs nothing.
 */

export type CountedStatus = "played" | "forfeit";

export interface StandingsMatch {
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

export interface PointsConfig {
  win: number;
  draw: number;
  loss: number;
}

export interface StandingRow {
  position: number;
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

/** A match only counts once it has been played and has a score on both sides. */
function counts(match: StandingsMatch): boolean {
  return (
    (match.status === "played" || match.status === "forfeit") &&
    match.homeTeamId !== null &&
    match.awayTeamId !== null &&
    match.homeScore !== null &&
    match.awayScore !== null
  );
}

export function computeStandings(
  teams: readonly { id: string; name: string }[],
  matches: readonly StandingsMatch[],
  points: PointsConfig,
): StandingRow[] {
  const rows = new Map<string, StandingRow>();

  for (const team of teams) {
    rows.set(team.id, {
      position: 0,
      teamId: team.id,
      teamName: team.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    });
  }

  for (const match of matches) {
    if (!counts(match)) continue;

    const home = rows.get(match.homeTeamId!);
    const away = rows.get(match.awayTeamId!);
    // A match against a team that isn't in the list is ignored rather than
    // invented — the caller decides which teams belong on this ladder.
    if (!home || !away) continue;

    const homeScore = match.homeScore!;
    const awayScore = match.awayScore!;

    home.played += 1;
    away.played += 1;
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.won += 1;
      away.lost += 1;
      home.points += points.win;
      away.points += points.loss;
    } else if (homeScore < awayScore) {
      away.won += 1;
      home.lost += 1;
      away.points += points.win;
      home.points += points.loss;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += points.draw;
      away.points += points.draw;
    }
  }

  const table = [...rows.values()];
  for (const row of table) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }

  table.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.teamName.localeCompare(b.teamName),
  );

  // Teams that are level on every tiebreaker share a position, and the next
  // team takes the place after all of them — 1, 2, 2, 4. Splitting them by name
  // would read as a ranking the results don't support.
  let previous: StandingRow | null = null;
  table.forEach((row, index) => {
    const tied =
      previous !== null &&
      previous.points === row.points &&
      previous.goalDifference === row.goalDifference &&
      previous.goalsFor === row.goalsFor;

    row.position = tied ? previous!.position : index + 1;
    previous = row;
  });

  return table;
}
