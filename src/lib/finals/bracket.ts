/**
 * Knockout brackets: who meets whom once the league phase is over, and who
 * advances as results come in.
 *
 * Two separate jobs, both pure. `buildBracket` lays out the empty structure
 * from a seeded list; `resolveBracket` works out which of the still-empty
 * places can now be filled. Neither knows what a database is.
 */

export type FinalsStage = "quarter_final" | "semi_final" | "final" | "third_place";

/** Where a place in a bracket match comes from. */
export type BracketSlot =
  | { kind: "seed"; teamId: string; seed: number }
  | { kind: "winner"; from: string }
  | { kind: "loser"; from: string };

export interface BracketMatch {
  /** Stable identifier inside the bracket: "qf1", "sf2", "final". */
  key: string;
  stage: FinalsStage;
  /** Position within the stage, 1-based, for display order. */
  order: number;
  home: BracketSlot;
  away: BracketSlot;
}

export class BracketError extends Error {
  constructor(readonly code: "BAD_SIZE" | "NOT_ENOUGH_TEAMS" | "DUPLICATE_TEAM") {
    super(code);
    this.name = "BracketError";
  }
}

export const BRACKET_SIZES = [2, 4, 8] as const;
export type BracketSize = (typeof BRACKET_SIZES)[number];

const seedSlot = (teamId: string, seed: number): BracketSlot => ({ kind: "seed", teamId, seed });
const winnerOf = (from: string): BracketSlot => ({ kind: "winner", from });
const loserOf = (from: string): BracketSlot => ({ kind: "loser", from });

/**
 * Standard knockout seeding: 1 plays the lowest qualifier, and the top two can
 * only meet in the final. Anything else makes finishing top of the table worth
 * less than it should be.
 */
const FIRST_ROUND_PAIRS: Record<BracketSize, [number, number][]> = {
  2: [[1, 2]],
  4: [
    [1, 4],
    [2, 3],
  ],
  8: [
    [1, 8],
    [4, 5],
    [3, 6],
    [2, 7],
  ],
};

export interface BuildBracketOptions {
  size: BracketSize;
  /** Play off for third place between the beaten semi-finalists. */
  thirdPlace?: boolean;
}

/**
 * `qualifiers` is the ladder order: index 0 is the team that finished first.
 */
export function buildBracket(
  qualifiers: readonly string[],
  options: BuildBracketOptions,
): BracketMatch[] {
  const { size, thirdPlace = false } = options;

  if (!BRACKET_SIZES.includes(size)) throw new BracketError("BAD_SIZE");
  if (qualifiers.length < size) throw new BracketError("NOT_ENOUGH_TEAMS");

  const teams = qualifiers.slice(0, size);
  if (new Set(teams).size !== teams.length) throw new BracketError("DUPLICATE_TEAM");

  const teamForSeed = (seed: number) => teams[seed - 1]!;
  const matches: BracketMatch[] = [];

  if (size === 2) {
    matches.push({
      key: "final",
      stage: "final",
      order: 1,
      home: seedSlot(teamForSeed(1), 1),
      away: seedSlot(teamForSeed(2), 2),
    });
    return matches;
  }

  const firstStage: FinalsStage = size === 8 ? "quarter_final" : "semi_final";
  const firstPrefix = size === 8 ? "qf" : "sf";

  FIRST_ROUND_PAIRS[size].forEach(([high, low], index) => {
    matches.push({
      key: `${firstPrefix}${index + 1}`,
      stage: firstStage,
      order: index + 1,
      home: seedSlot(teamForSeed(high), high),
      away: seedSlot(teamForSeed(low), low),
    });
  });

  if (size === 8) {
    matches.push(
      {
        key: "sf1",
        stage: "semi_final",
        order: 1,
        home: winnerOf("qf1"),
        away: winnerOf("qf2"),
      },
      {
        key: "sf2",
        stage: "semi_final",
        order: 2,
        home: winnerOf("qf3"),
        away: winnerOf("qf4"),
      },
    );
  }

  matches.push({
    key: "final",
    stage: "final",
    order: 1,
    home: winnerOf("sf1"),
    away: winnerOf("sf2"),
  });

  if (thirdPlace) {
    matches.push({
      key: "third",
      stage: "third_place",
      order: 1,
      home: loserOf("sf1"),
      away: loserOf("sf2"),
    });
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Resolving
// ---------------------------------------------------------------------------

export interface BracketResult {
  key: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  /**
   * Set when the scoreline alone doesn't decide it — a knockout settled on
   * penalties, or awarded. Takes precedence over the score.
   */
  winnerTeamId?: string | null;
}

export interface Resolution {
  key: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
}

/** Who went through, or null while it is still undecided. */
export function winnerOfMatch(result: BracketResult | undefined): string | null {
  if (!result) return null;
  if (result.winnerTeamId) return result.winnerTeamId;
  if (result.status !== "played" && result.status !== "forfeit") return null;
  if (result.homeScore === null || result.awayScore === null) return null;
  if (result.homeTeamId === null || result.awayTeamId === null) return null;

  if (result.homeScore > result.awayScore) return result.homeTeamId;
  if (result.awayScore > result.homeScore) return result.awayTeamId;
  // A drawn knockout decides nothing on its own. The league records who went
  // through; inventing a rule here would quietly pick a finalist.
  return null;
}

export function loserOfMatch(result: BracketResult | undefined): string | null {
  const winner = winnerOfMatch(result);
  if (!winner || !result) return null;
  return winner === result.homeTeamId ? result.awayTeamId : result.homeTeamId;
}

function teamForSlot(slot: BracketSlot, byKey: Map<string, BracketResult>): string | null {
  if (slot.kind === "seed") return slot.teamId;
  const feeder = byKey.get(slot.from);
  return slot.kind === "winner" ? winnerOfMatch(feeder) : loserOfMatch(feeder);
}

/**
 * Which bracket places can be filled in now.
 *
 * Only returns matches whose participants have changed, so a caller can write
 * exactly those rows rather than rewriting the whole bracket on every result.
 */
export function resolveBracket(
  bracket: readonly BracketMatch[],
  results: readonly BracketResult[],
): Resolution[] {
  const byKey = new Map(results.map((r) => [r.key, r]));
  const resolutions: Resolution[] = [];

  for (const match of bracket) {
    const current = byKey.get(match.key);
    const home = teamForSlot(match.home, byKey);
    const away = teamForSlot(match.away, byKey);

    const changed =
      (home ?? null) !== (current?.homeTeamId ?? null) ||
      (away ?? null) !== (current?.awayTeamId ?? null);

    // Never unset a place that is already filled: once a match has been played,
    // editing an earlier result must not blank out who took the field.
    const settled = current?.status === "played" || current?.status === "forfeit";

    if (changed && !settled) {
      resolutions.push({ key: match.key, homeTeamId: home, awayTeamId: away });
    }
  }

  return resolutions;
}

/** The champion, once the final is decided. */
export function championOf(
  bracket: readonly BracketMatch[],
  results: readonly BracketResult[],
): string | null {
  const final = bracket.find((m) => m.stage === "final");
  if (!final) return null;
  return winnerOfMatch(results.find((r) => r.key === final.key));
}
