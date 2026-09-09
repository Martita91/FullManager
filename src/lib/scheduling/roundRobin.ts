/**
 * Fixture generation: who plays whom, in which round.
 *
 * This deliberately says nothing about dates, times or pitches. Deciding the
 * pairings and deciding when they are played are separate problems, and keeping
 * them apart is what makes the second one (phase 4) tractable — and this one
 * testable without a database.
 */

export interface FixtureMatch {
  /** 1-based. Continues across legs: a two-leg season of 4 teams has rounds 1-6. */
  round: number;
  homeTeamId: string;
  awayTeamId: string;
}

export interface RoundRobinOptions {
  /** 1 = single round robin, 2 = home and away. */
  legs: number;
  /**
   * Seeds the shuffle so the same input can produce a different but reproducible
   * draw. Omit for the natural order of the input.
   */
  seed?: number;
}

export class FixtureError extends Error {
  constructor(readonly code: "TOO_FEW_TEAMS" | "DUPLICATE_TEAM" | "BAD_LEGS") {
    super(code);
    this.name = "FixtureError";
  }
}

/** Small deterministic PRNG — same seed, same draw, every time. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const random = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** Stand-in for the odd team out; never appears in the result. */
const BYE = "__bye__";

/**
 * Every team plays every other team once per leg, using the circle method.
 *
 * With an odd number of teams one team sits out each round — that round simply
 * has one fewer match rather than a placeholder fixture.
 */
export function generateRoundRobin(
  teamIds: readonly string[],
  options: RoundRobinOptions,
): FixtureMatch[] {
  const { legs, seed } = options;

  if (!Number.isInteger(legs) || legs < 1 || legs > 4) throw new FixtureError("BAD_LEGS");
  if (teamIds.length < 2) throw new FixtureError("TOO_FEW_TEAMS");
  if (new Set(teamIds).size !== teamIds.length) throw new FixtureError("DUPLICATE_TEAM");

  const ordered = seed === undefined ? [...teamIds] : shuffled(teamIds, seed);
  const entrants = ordered.length % 2 === 1 ? [...ordered, BYE] : ordered;

  const size = entrants.length;
  const roundsPerLeg = size - 1;
  const half = size / 2;

  const matches: FixtureMatch[] = [];

  for (let leg = 0; leg < legs; leg++) {
    // The first entrant stays put while the rest rotate around it.
    let rotating = entrants.slice(1);

    for (let round = 0; round < roundsPerLeg; round++) {
      const lineup = [entrants[0]!, ...rotating];

      for (let i = 0; i < half; i++) {
        const a = lineup[i]!;
        const b = lineup[size - 1 - i]!;
        if (a === BYE || b === BYE) continue;

        // Home/away has to be decided by POSITION, not by round + position: a
        // rotating team's index advances by one every round, so `round + i`
        // keeps the same parity for that team all season and it ends up always
        // home or always away. Position alone varies as the team rotates.
        //
        // The pivot at index 0 never rotates, so it is the one case that has to
        // alternate by round instead. Flipping on odd legs mirrors the whole
        // draw, which is what makes two legs exactly balanced.
        const aIsHome = i === 0 ? round % 2 === 0 : i % 2 === 0;
        const homeSide = leg % 2 === 1 ? !aIsHome : aIsHome;

        matches.push({
          round: leg * roundsPerLeg + round + 1,
          homeTeamId: homeSide ? a : b,
          awayTeamId: homeSide ? b : a,
        });
      }

      rotating = [rotating[rotating.length - 1]!, ...rotating.slice(0, -1)];
    }
  }

  return matches;
}

/** How many rounds a draw with these settings will produce. */
export function roundCount(teamCount: number, legs: number): number {
  const size = teamCount % 2 === 1 ? teamCount + 1 : teamCount;
  return Math.max(0, (size - 1) * legs);
}
