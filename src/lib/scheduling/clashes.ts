/**
 * Problems a fixture can contain that nobody notices until match day: two
 * games booked on the same pitch at the same time, a team asked to play twice
 * at once, or a team appearing twice in one round.
 *
 * This reports rather than prevents. A league sometimes has a good reason for
 * an odd arrangement, so the interface shows the warnings and lets a human
 * decide.
 */

export interface ScheduledMatch {
  id: string;
  round: number | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** ISO instant, or null while the match is unscheduled. */
  kickoffAt: string | null;
  pitchId: string | null;
}

export type Clash =
  | { kind: "pitch"; pitchId: string; kickoffAt: string; matchIds: string[] }
  | { kind: "team"; teamId: string; kickoffAt: string; matchIds: string[] }
  | { kind: "round"; teamId: string; round: number; matchIds: string[] };

function groupBy<T>(items: readonly T[], key: (item: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    const bucket = groups.get(k);
    if (bucket) bucket.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

const teamsOf = (m: ScheduledMatch) =>
  [m.homeTeamId, m.awayTeamId].filter((id): id is string => id !== null);

export function findClashes(matches: readonly ScheduledMatch[]): Clash[] {
  const clashes: Clash[] = [];

  // Same pitch, same instant.
  const byPitchTime = groupBy(matches, (m) =>
    m.pitchId && m.kickoffAt ? `${m.pitchId}@${m.kickoffAt}` : null,
  );
  for (const [key, group] of byPitchTime) {
    if (group.length < 2) continue;
    const [pitchId, kickoffAt] = key.split("@");
    clashes.push({
      kind: "pitch",
      pitchId: pitchId!,
      kickoffAt: kickoffAt!,
      matchIds: group.map((m) => m.id),
    });
  }

  // One team, two kick-offs at the same instant.
  const teamTime = new Map<string, ScheduledMatch[]>();
  for (const match of matches) {
    if (!match.kickoffAt) continue;
    for (const teamId of teamsOf(match)) {
      const key = `${teamId}@${match.kickoffAt}`;
      const bucket = teamTime.get(key);
      if (bucket) bucket.push(match);
      else teamTime.set(key, [match]);
    }
  }
  for (const [key, group] of teamTime) {
    if (group.length < 2) continue;
    const [teamId, kickoffAt] = key.split("@");
    clashes.push({
      kind: "team",
      teamId: teamId!,
      kickoffAt: kickoffAt!,
      matchIds: group.map((m) => m.id),
    });
  }

  // One team, twice in the same round. This one means the draw itself is wrong,
  // not just the timetable.
  const teamRound = new Map<string, ScheduledMatch[]>();
  for (const match of matches) {
    if (match.round === null) continue;
    for (const teamId of teamsOf(match)) {
      const key = `${teamId}#${match.round}`;
      const bucket = teamRound.get(key);
      if (bucket) bucket.push(match);
      else teamRound.set(key, [match]);
    }
  }
  for (const [key, group] of teamRound) {
    if (group.length < 2) continue;
    const [teamId, round] = key.split("#");
    clashes.push({
      kind: "round",
      teamId: teamId!,
      round: Number(round),
      matchIds: group.map((m) => m.id),
    });
  }

  return clashes;
}
