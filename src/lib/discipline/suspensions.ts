/**
 * Who misses the next match, and why.
 *
 * Two rules, which is what almost every amateur league runs:
 *   - yellow cards accumulate, and every Nth one costs a match;
 *   - a red card costs the next match on its own.
 *
 * N is per competition, because it genuinely differs — five in a long season,
 * three in a short one. Zero turns accumulation off entirely.
 *
 * Kept pure so the rule can be argued about and tested without a fixture in
 * front of it. Deciding who is suspended is the kind of thing a league will
 * dispute, and "the code says so" is only an answer if the code is legible.
 */

export type CardKind = "yellow" | "red";

export interface DisciplineEvent {
  personId: string;
  personName: string;
  teamId: string;
  round: number;
  kind: CardKind;
}

/** Rounds in which each team has a match, so "the next match" is knowable. */
export interface TeamRound {
  teamId: string;
  round: number;
}

export type SuspensionReason = "yellow_accumulation" | "red_card";

export interface Suspension {
  personId: string;
  personName: string;
  teamId: string;
  reason: SuspensionReason;
  /** The round in which the offence happened. */
  triggeredInRound: number;
  /** The team's next round after that, or null if the season ends first. */
  servesRound: number | null;
  /** Yellow count at the moment it triggered. Null for a red card. */
  yellowCount: number | null;
}

export interface PlayerCards {
  personId: string;
  personName: string;
  teamId: string;
  yellows: number;
  reds: number;
  /** Yellows still to go before the next accumulation ban, or null if off. */
  yellowsToNextBan: number | null;
}

export interface DisciplineOptions {
  /** Yellows that cost a match. 0 disables accumulation entirely. */
  yellowsForSuspension: number;
}

function nextRoundFor(
  teamRounds: readonly TeamRound[],
  teamId: string,
  after: number,
): number | null {
  const later = teamRounds
    .filter((tr) => tr.teamId === teamId && tr.round > after)
    .map((tr) => tr.round)
    .sort((a, b) => a - b);
  return later[0] ?? null;
}

export function computeSuspensions(
  events: readonly DisciplineEvent[],
  teamRounds: readonly TeamRound[],
  options: DisciplineOptions,
): Suspension[] {
  const threshold = options.yellowsForSuspension;
  const ordered = [...events].sort((a, b) => a.round - b.round);

  const yellowsByPerson = new Map<string, number>();
  const suspensions: Suspension[] = [];

  for (const event of ordered) {
    if (event.kind === "red") {
      suspensions.push({
        personId: event.personId,
        personName: event.personName,
        teamId: event.teamId,
        reason: "red_card",
        triggeredInRound: event.round,
        servesRound: nextRoundFor(teamRounds, event.teamId, event.round),
        yellowCount: null,
      });
      continue;
    }

    const count = (yellowsByPerson.get(event.personId) ?? 0) + 1;
    yellowsByPerson.set(event.personId, count);

    // Every Nth yellow, not only the Nth: a player who reaches ten with a
    // threshold of five sits out twice over the season.
    if (threshold > 0 && count % threshold === 0) {
      suspensions.push({
        personId: event.personId,
        personName: event.personName,
        teamId: event.teamId,
        reason: "yellow_accumulation",
        triggeredInRound: event.round,
        servesRound: nextRoundFor(teamRounds, event.teamId, event.round),
        yellowCount: count,
      });
    }
  }

  return suspensions;
}

/** Running totals per player, for a discipline table. */
export function tallyCards(
  events: readonly DisciplineEvent[],
  options: DisciplineOptions,
): PlayerCards[] {
  const threshold = options.yellowsForSuspension;
  const byPerson = new Map<string, PlayerCards>();

  for (const event of events) {
    const existing = byPerson.get(event.personId) ?? {
      personId: event.personId,
      personName: event.personName,
      teamId: event.teamId,
      yellows: 0,
      reds: 0,
      yellowsToNextBan: null,
    };

    if (event.kind === "yellow") existing.yellows += 1;
    else existing.reds += 1;

    byPerson.set(event.personId, existing);
  }

  for (const player of byPerson.values()) {
    player.yellowsToNextBan = threshold > 0 ? threshold - (player.yellows % threshold) : null;
  }

  return [...byPerson.values()].sort(
    (a, b) => b.reds - a.reds || b.yellows - a.yellows || a.personName.localeCompare(b.personName),
  );
}

/** Suspensions that still have a match to be served in. */
export function upcomingSuspensions(suspensions: readonly Suspension[]): Suspension[] {
  return suspensions.filter((s) => s.servesRound !== null);
}
