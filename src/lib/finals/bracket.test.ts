import { describe, expect, it } from "vitest";
import {
  BracketError,
  buildBracket,
  championOf,
  loserOfMatch,
  resolveBracket,
  winnerOfMatch,
  type BracketResult,
} from "./bracket";

const eight = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];
const four = eight.slice(0, 4);

const played = (
  key: string,
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
  extra: Partial<BracketResult> = {},
): BracketResult => ({
  key,
  homeTeamId: home,
  awayTeamId: away,
  homeScore,
  awayScore,
  status: "played",
  ...extra,
});

describe("buildBracket", () => {
  it("pairs a four-team bracket 1v4 and 2v3", () => {
    const bracket = buildBracket(four, { size: 4 });
    const semis = bracket.filter((m) => m.stage === "semi_final");

    expect(semis).toHaveLength(2);
    expect(semis[0]!.home).toMatchObject({ teamId: "t1", seed: 1 });
    expect(semis[0]!.away).toMatchObject({ teamId: "t4", seed: 4 });
    expect(semis[1]!.home).toMatchObject({ teamId: "t2", seed: 2 });
    expect(semis[1]!.away).toMatchObject({ teamId: "t3", seed: 3 });
  });

  it("keeps the top two apart until the final", () => {
    const bracket = buildBracket(eight, { size: 8 });

    // Seeds 1 and 2 start in different halves: 1 feeds sf1, 2 feeds sf2.
    const quarters = bracket.filter((m) => m.stage === "quarter_final");
    const seedOf = (key: string) =>
      quarters.find((m) => m.key === key)!.home as Extract<
        (typeof quarters)[number]["home"],
        { kind: "seed" }
      >;

    expect(seedOf("qf1").seed).toBe(1);
    expect(seedOf("qf4").seed).toBe(2);

    const sf1 = bracket.find((m) => m.key === "sf1")!;
    const sf2 = bracket.find((m) => m.key === "sf2")!;
    expect(sf1.home).toEqual({ kind: "winner", from: "qf1" });
    expect(sf2.away).toEqual({ kind: "winner", from: "qf4" });
  });

  it("makes a two-team bracket a single final", () => {
    const bracket = buildBracket(four, { size: 2 });
    expect(bracket).toHaveLength(1);
    expect(bracket[0]!.stage).toBe("final");
    expect(bracket[0]!.home).toMatchObject({ teamId: "t1" });
  });

  it("adds a third-place play-off between the beaten semi-finalists", () => {
    const bracket = buildBracket(four, { size: 4, thirdPlace: true });
    const third = bracket.find((m) => m.stage === "third_place")!;

    expect(third.home).toEqual({ kind: "loser", from: "sf1" });
    expect(third.away).toEqual({ kind: "loser", from: "sf2" });
  });

  it("takes only as many qualifiers as the bracket needs", () => {
    const bracket = buildBracket(eight, { size: 4 });
    const seeds = bracket
      .filter((m) => m.stage === "semi_final")
      .flatMap((m) => [m.home, m.away])
      .map((slot) => (slot.kind === "seed" ? slot.teamId : null));

    expect(new Set(seeds)).toEqual(new Set(["t1", "t2", "t3", "t4"]));
  });

  it("refuses a bracket it cannot build", () => {
    expect(() => buildBracket(four, { size: 8 })).toThrow(BracketError);
    expect(() => buildBracket(four, { size: 3 as unknown as 4 })).toThrow(BracketError);
    expect(() => buildBracket(["a", "a", "b", "c"], { size: 4 })).toThrow(BracketError);
  });
});

describe("winnerOfMatch", () => {
  it("takes the higher score", () => {
    expect(winnerOfMatch(played("sf1", "a", "b", 2, 1))).toBe("a");
    expect(winnerOfMatch(played("sf1", "a", "b", 0, 3))).toBe("b");
    expect(loserOfMatch(played("sf1", "a", "b", 2, 1))).toBe("b");
  });

  it("decides nothing on a draw", () => {
    expect(winnerOfMatch(played("sf1", "a", "b", 1, 1))).toBeNull();
  });

  it("lets an explicit winner settle a draw, as penalties would", () => {
    expect(winnerOfMatch(played("sf1", "a", "b", 1, 1, { winnerTeamId: "b" }))).toBe("b");
    expect(loserOfMatch(played("sf1", "a", "b", 1, 1, { winnerTeamId: "b" }))).toBe("a");
  });

  it("ignores a match that has not been played", () => {
    expect(
      winnerOfMatch({
        key: "sf1",
        homeTeamId: "a",
        awayTeamId: "b",
        homeScore: null,
        awayScore: null,
        status: "scheduled",
      }),
    ).toBeNull();
  });
});

describe("resolveBracket", () => {
  const bracket = buildBracket(four, { size: 4, thirdPlace: true });

  it("fills the first round from the seeds straight away", () => {
    const resolutions = resolveBracket(bracket, []);
    const sf1 = resolutions.find((r) => r.key === "sf1")!;

    expect(sf1.homeTeamId).toBe("t1");
    expect(sf1.awayTeamId).toBe("t4");
    // The final has nobody yet, and says so rather than guessing.
    expect(resolutions.find((r) => r.key === "final")).toBeUndefined();
  });

  it("sends the winners through once both semis are played", () => {
    const results = [played("sf1", "t1", "t4", 2, 0), played("sf2", "t2", "t3", 1, 3)];
    const resolutions = resolveBracket(bracket, results);

    expect(resolutions.find((r) => r.key === "final")).toMatchObject({
      homeTeamId: "t1",
      awayTeamId: "t3",
    });
    // And the beaten semi-finalists meet for third place.
    expect(resolutions.find((r) => r.key === "third")).toMatchObject({
      homeTeamId: "t4",
      awayTeamId: "t2",
    });
  });

  it("waits for both feeders before filling a place", () => {
    const results = [played("sf1", "t1", "t4", 2, 0)];
    const resolution = resolveBracket(bracket, results).find((r) => r.key === "final")!;

    expect(resolution.homeTeamId).toBe("t1");
    expect(resolution.awayTeamId).toBeNull();
  });

  it("never blanks out a match that has already been played", () => {
    // The final was played, and then somebody edits a semi-final result.
    const results = [
      played("sf1", "t1", "t4", 1, 1), // now a draw: decides nothing
      played("sf2", "t2", "t3", 1, 3),
      played("final", "t1", "t3", 2, 1),
    ];
    const resolutions = resolveBracket(bracket, results);

    expect(resolutions.find((r) => r.key === "final")).toBeUndefined();
  });

  it("reports nothing to change when the bracket is already correct", () => {
    const results = [
      played("sf1", "t1", "t4", 2, 0),
      played("sf2", "t2", "t3", 1, 3),
      {
        key: "final",
        homeTeamId: "t1",
        awayTeamId: "t3",
        homeScore: null,
        awayScore: null,
        status: "scheduled",
      },
      {
        key: "third",
        homeTeamId: "t4",
        awayTeamId: "t2",
        homeScore: null,
        awayScore: null,
        status: "scheduled",
      },
    ];

    expect(resolveBracket(bracket, results)).toEqual([]);
  });
});

describe("championOf", () => {
  const bracket = buildBracket(four, { size: 4 });

  it("names the winner of the final", () => {
    const results = [
      played("sf1", "t1", "t4", 2, 0),
      played("sf2", "t2", "t3", 1, 3),
      played("final", "t1", "t3", 0, 1),
    ];
    expect(championOf(bracket, results)).toBe("t3");
  });

  it("has no champion until the final is decided", () => {
    expect(championOf(bracket, [played("sf1", "t1", "t4", 2, 0)])).toBeNull();
    expect(championOf(bracket, [played("final", "t1", "t3", 1, 1)])).toBeNull();
  });
});
