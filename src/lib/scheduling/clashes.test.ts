import { describe, expect, it } from "vitest";
import { findClashes, type ScheduledMatch } from "./clashes";

const KICKOFF = "2026-10-03T09:00:00.000Z";
const LATER = "2026-10-03T11:00:00.000Z";

const match = (over: Partial<ScheduledMatch> & { id: string }): ScheduledMatch => ({
  round: 1,
  homeTeamId: "a",
  awayTeamId: "b",
  kickoffAt: KICKOFF,
  pitchId: "p1",
  ...over,
});

describe("findClashes", () => {
  it("says nothing about a clean fixture", () => {
    const clashes = findClashes([
      match({ id: "m1" }),
      match({ id: "m2", homeTeamId: "c", awayTeamId: "d", pitchId: "p2" }),
    ]);
    expect(clashes).toEqual([]);
  });

  it("catches two matches booked on one pitch at one time", () => {
    const clashes = findClashes([
      match({ id: "m1" }),
      match({ id: "m2", homeTeamId: "c", awayTeamId: "d", round: 2 }),
    ]);
    const pitch = clashes.find((c) => c.kind === "pitch");
    expect(pitch).toBeDefined();
    expect(pitch!.matchIds.sort()).toEqual(["m1", "m2"]);
  });

  it("catches a team asked to play twice at once", () => {
    const clashes = findClashes([
      match({ id: "m1" }),
      match({ id: "m2", homeTeamId: "a", awayTeamId: "c", pitchId: "p2", round: 2 }),
    ]);
    const team = clashes.find((c) => c.kind === "team");
    expect(team?.kind).toBe("team");
    expect(team?.kind === "team" ? team.teamId : null).toBe("a");
  });

  it("catches a team drawn twice in the same round", () => {
    const clashes = findClashes([
      match({ id: "m1", kickoffAt: KICKOFF }),
      match({ id: "m2", homeTeamId: "a", awayTeamId: "c", kickoffAt: LATER, pitchId: "p2" }),
    ]);
    const round = clashes.find((c) => c.kind === "round");
    expect(round?.kind).toBe("round");
    expect(round?.kind === "round" ? round.round : null).toBe(1);
  });

  it("leaves unscheduled matches alone", () => {
    const clashes = findClashes([
      match({ id: "m1", kickoffAt: null, pitchId: null, round: null }),
      match({ id: "m2", kickoffAt: null, pitchId: null, round: null }),
    ]);
    expect(clashes).toEqual([]);
  });

  it("does not flag the same pitch at different times", () => {
    const clashes = findClashes([
      match({ id: "m1" }),
      match({ id: "m2", homeTeamId: "c", awayTeamId: "d", kickoffAt: LATER, round: 2 }),
    ]);
    expect(clashes).toEqual([]);
  });

  it("handles a knockout fixture whose teams aren't known yet", () => {
    const clashes = findClashes([
      match({ id: "m1", homeTeamId: null, awayTeamId: null }),
      match({ id: "m2", homeTeamId: null, awayTeamId: null, pitchId: "p2" }),
    ]);
    expect(clashes).toEqual([]);
  });
});
