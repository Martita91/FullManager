import { describe, expect, it } from "vitest";
import { FixtureError, generateRoundRobin, roundCount } from "./roundRobin";

const teams = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);

/** Unordered pair key, so t1-v-t2 and t2-v-t1 collide. */
const pairKey = (a: string, b: string) => [a, b].sort().join("|");

describe("generateRoundRobin", () => {
  it("has every team play every other team exactly once in a single leg", () => {
    const ids = teams(6);
    const fixture = generateRoundRobin(ids, { legs: 1 });

    const pairs = fixture.map((m) => pairKey(m.homeTeamId, m.awayTeamId));
    expect(pairs).toHaveLength(15); // 6 choose 2
    expect(new Set(pairs).size).toBe(15);
  });

  it("plays each pair twice across two legs, once at each venue", () => {
    const fixture = generateRoundRobin(teams(4), { legs: 2 });

    const ordered = fixture.map((m) => `${m.homeTeamId}>${m.awayTeamId}`);
    expect(ordered).toHaveLength(12);
    // Every ordered pairing appears exactly once, which is only true if the
    // second leg mirrors the first.
    expect(new Set(ordered).size).toBe(12);
  });

  it("never schedules a team twice in the same round", () => {
    const fixture = generateRoundRobin(teams(10), { legs: 2 });

    const seenPerRound = new Map<number, Set<string>>();
    for (const match of fixture) {
      const seen = seenPerRound.get(match.round) ?? new Set<string>();
      expect(seen.has(match.homeTeamId)).toBe(false);
      expect(seen.has(match.awayTeamId)).toBe(false);
      seen.add(match.homeTeamId);
      seen.add(match.awayTeamId);
      seenPerRound.set(match.round, seen);
    }
  });

  it("gives an odd number of teams a bye instead of a phantom fixture", () => {
    const ids = teams(5);
    const fixture = generateRoundRobin(ids, { legs: 1 });

    expect(fixture).toHaveLength(10); // 5 choose 2
    expect(roundCount(5, 1)).toBe(5);

    // Each round is one match short, because somebody sits out.
    for (let round = 1; round <= 5; round++) {
      expect(fixture.filter((m) => m.round === round)).toHaveLength(2);
    }
    // And no placeholder leaked into the output.
    const everyId = fixture.flatMap((m) => [m.homeTeamId, m.awayTeamId]);
    expect(everyId.every((id) => ids.includes(id))).toBe(true);
  });

  it("balances home and away exactly over two legs", () => {
    const ids = teams(8);
    const fixture = generateRoundRobin(ids, { legs: 2 });

    for (const id of ids) {
      const home = fixture.filter((m) => m.homeTeamId === id).length;
      const away = fixture.filter((m) => m.awayTeamId === id).length;
      expect(home).toBe(away);
    }
  });

  it("keeps home and away within one game of each other in a single leg", () => {
    const ids = teams(8);
    const fixture = generateRoundRobin(ids, { legs: 1 });

    for (const id of ids) {
      const home = fixture.filter((m) => m.homeTeamId === id).length;
      const away = fixture.filter((m) => m.awayTeamId === id).length;
      expect(Math.abs(home - away)).toBeLessThanOrEqual(1);
    }
  });

  it("is reproducible for a given seed and different across seeds", () => {
    const ids = teams(8);
    const a = generateRoundRobin(ids, { legs: 1, seed: 7 });
    const b = generateRoundRobin(ids, { legs: 1, seed: 7 });
    const c = generateRoundRobin(ids, { legs: 1, seed: 8 });

    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    // A different draw is still a complete one.
    expect(new Set(c.map((m) => pairKey(m.homeTeamId, m.awayTeamId))).size).toBe(28);
  });

  it("refuses inputs that can't produce a fixture", () => {
    expect(() => generateRoundRobin(["only"], { legs: 1 })).toThrow(FixtureError);
    expect(() => generateRoundRobin(["a", "a"], { legs: 1 })).toThrow(FixtureError);
    expect(() => generateRoundRobin(["a", "b"], { legs: 0 })).toThrow(FixtureError);
  });

  it("handles the smallest real competition", () => {
    const fixture = generateRoundRobin(["a", "b"], { legs: 2 });
    expect(fixture).toEqual([
      { round: 1, homeTeamId: "a", awayTeamId: "b" },
      { round: 2, homeTeamId: "b", awayTeamId: "a" },
    ]);
  });
});
