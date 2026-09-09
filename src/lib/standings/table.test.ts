import { describe, expect, it } from "vitest";
import { computeStandings, type StandingsMatch } from "./table";

const POINTS = { win: 3, draw: 1, loss: 0 };

const teams = [
  { id: "a", name: "Ants" },
  { id: "b", name: "Bees" },
  { id: "c", name: "Cats" },
];

const played = (
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
  status = "played",
): StandingsMatch => ({ homeTeamId: home, awayTeamId: away, homeScore, awayScore, status });

describe("computeStandings", () => {
  it("lists every team even before a ball is kicked", () => {
    const table = computeStandings(teams, [], POINTS);
    expect(table).toHaveLength(3);
    expect(table.every((r) => r.played === 0 && r.points === 0)).toBe(true);
  });

  it("awards points and tallies goals from both sides of a result", () => {
    const table = computeStandings(teams, [played("a", "b", 3, 1)], POINTS);
    const ants = table.find((r) => r.teamId === "a")!;
    const bees = table.find((r) => r.teamId === "b")!;

    expect(ants).toMatchObject({
      played: 1,
      won: 1,
      lost: 0,
      goalsFor: 3,
      goalsAgainst: 1,
      points: 3,
    });
    expect(bees).toMatchObject({
      played: 1,
      won: 0,
      lost: 1,
      goalsFor: 1,
      goalsAgainst: 3,
      points: 0,
    });
    expect(ants.goalDifference).toBe(2);
    expect(bees.goalDifference).toBe(-2);
  });

  it("gives both teams a point for a draw", () => {
    const table = computeStandings(teams, [played("a", "b", 2, 2)], POINTS);
    expect(table.find((r) => r.teamId === "a")!.points).toBe(1);
    expect(table.find((r) => r.teamId === "b")!.points).toBe(1);
    expect(table.find((r) => r.teamId === "a")!.drawn).toBe(1);
  });

  it("ignores fixtures that haven't been played", () => {
    const matches: StandingsMatch[] = [
      { homeTeamId: "a", awayTeamId: "b", homeScore: null, awayScore: null, status: "scheduled" },
      { homeTeamId: "a", awayTeamId: "c", homeScore: 9, awayScore: 0, status: "postponed" },
      { homeTeamId: "b", awayTeamId: "c", homeScore: 1, awayScore: 0, status: "cancelled" },
    ];
    const table = computeStandings(teams, matches, POINTS);
    expect(table.every((r) => r.played === 0)).toBe(true);
  });

  it("counts a forfeit, because it is a result", () => {
    const table = computeStandings(teams, [played("a", "b", 3, 0, "forfeit")], POINTS);
    expect(table.find((r) => r.teamId === "a")!.points).toBe(3);
    expect(table.find((r) => r.teamId === "b")!.played).toBe(1);
  });

  it("breaks a tie on goal difference, then on goals scored", () => {
    // Ants and Bees both finish on 3 points.
    const matches = [played("a", "c", 5, 0), played("b", "c", 1, 0)];
    const table = computeStandings(teams, matches, POINTS);

    expect(table[0]!.teamId).toBe("a"); // +5 beats +1
    expect(table[1]!.teamId).toBe("b");
  });

  it("puts goals scored ahead when goal difference is level", () => {
    const four = [...teams, { id: "d", name: "Dogs" }];
    const matches = [
      played("a", "c", 4, 2), // Ants +2, 4 scored
      played("b", "d", 3, 1), // Bees +2, 3 scored
    ];
    const table = computeStandings(four, matches, POINTS);

    expect(table[0]!.teamId).toBe("a");
    expect(table[1]!.teamId).toBe("b");
  });

  it("lets teams share a position when nothing separates them", () => {
    const four = [...teams, { id: "d", name: "Dogs" }];
    // Ants and Bees are identical: 3 points, +1, 2 scored.
    const matches = [played("a", "c", 2, 1), played("b", "d", 2, 1)];
    const table = computeStandings(four, matches, POINTS);

    expect(table[0]!.position).toBe(1);
    expect(table[1]!.position).toBe(1);
    expect(table[2]!.position).toBe(3);
  });

  it("respects a competition that scores wins differently", () => {
    const table = computeStandings(teams, [played("a", "b", 1, 0)], { win: 2, draw: 1, loss: 0 });
    expect(table.find((r) => r.teamId === "a")!.points).toBe(2);
  });

  it("skips results involving a team that isn't on this ladder", () => {
    const table = computeStandings(teams, [played("a", "stranger", 3, 0)], POINTS);
    expect(table.every((r) => r.played === 0)).toBe(true);
  });
});
