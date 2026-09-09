import { describe, expect, it } from "vitest";
import {
  allocateFixture,
  expandSlots,
  minutesToTime,
  timeToMinutes,
  type AvailabilityWindow,
  type TimePreference,
  type UnscheduledMatch,
} from "./allocate";

// 2026-10-03 is a Saturday.
const SATURDAY = "2026-10-03";

const saturdayWindow = (pitchId: string, over: Partial<AvailabilityWindow> = {}) => ({
  pitchId,
  weekday: 6,
  startsAt: "09:00",
  endsAt: "12:00",
  slotMinutes: 60,
  ...over,
});

const match = (id: string, round: number, home: string, away: string): UnscheduledMatch => ({
  id,
  round,
  homeTeamId: home,
  awayTeamId: away,
});

describe("time helpers", () => {
  it("round-trips a time", () => {
    expect(minutesToTime(timeToMinutes("09:30"))).toBe("09:30");
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("23:45")).toBe(1425);
  });
});

describe("expandSlots", () => {
  it("only produces slots on the weekday the window is for", () => {
    const slots = expandSlots([saturdayWindow("p1")], "2026-10-01", "2026-10-10");
    expect(new Set(slots.map((s) => s.date))).toEqual(new Set(["2026-10-03", "2026-10-10"]));
  });

  it("divides a window into whole slots and drops the remainder", () => {
    // 09:00-12:00 in 90-minute games is two slots, not two and a bit.
    const slots = expandSlots(
      [saturdayWindow("p1", { endsAt: "12:00", slotMinutes: 90 })],
      SATURDAY,
      SATURDAY,
    );
    expect(slots.map((s) => s.time)).toEqual(["09:00", "10:30"]);
  });

  it("keeps slots from several pitches, ordered by date then time", () => {
    const slots = expandSlots([saturdayWindow("p2"), saturdayWindow("p1")], SATURDAY, SATURDAY);
    expect(slots).toHaveLength(6);
    expect(slots.slice(0, 2).map((s) => s.pitchId)).toEqual(["p1", "p2"]);
    expect(slots[0]!.time).toBe("09:00");
  });

  it("returns nothing when the range is backwards", () => {
    expect(expandSlots([saturdayWindow("p1")], "2026-10-10", "2026-10-01")).toEqual([]);
  });
});

describe("allocateFixture", () => {
  const base = {
    fromDate: "2026-10-01",
    toDate: "2026-12-31",
    windows: [saturdayWindow("p1")],
    preferences: [] as TimePreference[],
  };

  it("places every match when there is room", () => {
    const result = allocateFixture([match("m1", 1, "a", "b"), match("m2", 1, "c", "d")], base);

    expect(result.unassigned).toEqual([]);
    expect(result.assignments).toHaveLength(2);
    expect(new Set(result.assignments.map((a) => a.date))).toEqual(new Set([SATURDAY]));
    // Two matches, two different times on the one pitch.
    expect(new Set(result.assignments.map((a) => a.time)).size).toBe(2);
  });

  it("never books one pitch twice at the same time", () => {
    const matches = Array.from({ length: 6 }, (_, i) => match(`m${i}`, 1, `home${i}`, `away${i}`));
    const result = allocateFixture(matches, base);

    const keys = result.assignments.map((a) => `${a.pitchId}@${a.date}T${a.time}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never asks a team to play twice on one day", () => {
    // "a" is in both matches of the round, so they cannot share a date.
    const result = allocateFixture([match("m1", 1, "a", "b"), match("m2", 1, "a", "c")], base);

    expect(result.unassigned).toEqual([]);
    const dates = result.assignments.map((a) => a.date);
    expect(new Set(dates).size).toBe(2);
  });

  it("plays rounds in order and never on the same day", () => {
    const result = allocateFixture(
      [match("m1", 1, "a", "b"), match("m2", 2, "a", "b"), match("m3", 3, "a", "b")],
      base,
    );

    expect(result.unassigned).toEqual([]);
    const byMatch = new Map(result.assignments.map((a) => [a.matchId, a.date]));
    expect(byMatch.get("m1")! < byMatch.get("m2")!).toBe(true);
    expect(byMatch.get("m2")! < byMatch.get("m3")!).toBe(true);
  });

  it("refuses to schedule a team into a window it declared unavailable", () => {
    const preferences: TimePreference[] = [
      { teamId: "a", weekday: 6, startsAt: null, endsAt: null, kind: "unavailable" },
    ];
    const result = allocateFixture([match("m1", 1, "a", "b")], { ...base, preferences });

    expect(result.assignments).toEqual([]);
    expect(result.unassigned).toEqual([{ matchId: "m1", reason: "teams_unavailable" }]);
  });

  it("honours a partial unavailable window but uses the rest of the day", () => {
    const preferences: TimePreference[] = [
      { teamId: "a", weekday: 6, startsAt: "09:00", endsAt: "10:00", kind: "unavailable" },
    ];
    const result = allocateFixture([match("m1", 1, "a", "b")], { ...base, preferences });

    expect(result.unassigned).toEqual([]);
    expect(result.assignments[0]!.time).not.toBe("09:00");
  });

  it("prefers a team's preferred window over a neutral one", () => {
    const preferences: TimePreference[] = [
      { teamId: "a", weekday: 6, startsAt: "11:00", endsAt: "12:00", kind: "preferred" },
    ];
    const result = allocateFixture([match("m1", 1, "a", "b")], { ...base, preferences });

    expect(result.assignments[0]!.time).toBe("11:00");
  });

  it("avoids a window a team would rather not play in", () => {
    const preferences: TimePreference[] = [
      { teamId: "a", weekday: 6, startsAt: "09:00", endsAt: "10:00", kind: "avoid" },
    ];
    const result = allocateFixture([match("m1", 1, "a", "b")], { ...base, preferences });

    expect(result.assignments[0]!.time).not.toBe("09:00");
  });

  it("reports what it could not fit rather than dropping it silently", () => {
    // One Saturday, one slot, three matches that all need their own day.
    const result = allocateFixture(
      [match("m1", 1, "a", "b"), match("m2", 1, "a", "c"), match("m3", 1, "a", "d")],
      {
        ...base,
        fromDate: SATURDAY,
        toDate: SATURDAY,
        windows: [saturdayWindow("p1", { endsAt: "10:00" })],
      },
    );

    expect(result.assignments).toHaveLength(1);
    expect(result.unassigned).toHaveLength(2);
    expect(result.unassigned.every((u) => u.reason === "no_slots_left")).toBe(true);
  });

  it("spreads a round across days when one day cannot hold it", () => {
    // Four matches, two slots per Saturday.
    const matches = [
      match("m1", 1, "a", "b"),
      match("m2", 1, "c", "d"),
      match("m3", 1, "e", "f"),
      match("m4", 1, "g", "h"),
    ];
    const result = allocateFixture(matches, {
      ...base,
      windows: [saturdayWindow("p1", { endsAt: "11:00" })],
    });

    expect(result.unassigned).toEqual([]);
    expect(new Set(result.assignments.map((a) => a.date)).size).toBe(2);
  });

  it("uses every pitch a league has before spilling to the next week", () => {
    const matches = [match("m1", 1, "a", "b"), match("m2", 1, "c", "d")];
    const result = allocateFixture(matches, {
      ...base,
      windows: [
        saturdayWindow("p1", { endsAt: "10:00" }),
        saturdayWindow("p2", { endsAt: "10:00" }),
      ],
    });

    expect(result.assignments.map((a) => a.date)).toEqual([SATURDAY, SATURDAY]);
    expect(new Set(result.assignments.map((a) => a.pitchId))).toEqual(new Set(["p1", "p2"]));
  });

  it("never places a round before an earlier one already on the calendar", () => {
    // Round 3 was put on the calendar by hand, a month out. Rounds 4 and 5 must
    // land after it, not in the gap before it.
    const result = allocateFixture([match("m4", 4, "a", "b"), match("m5", 5, "a", "b")], {
      ...base,
      fromDate: "2026-09-01",
      alreadyScheduled: [{ round: 3, date: "2026-10-10" }],
    });

    expect(result.unassigned).toEqual([]);
    for (const assignment of result.assignments) {
      expect(assignment.date > "2026-10-10").toBe(true);
    }
  });

  it("ignores a later round that is already placed", () => {
    // A hand-placed final shouldn't push the whole season past it.
    const result = allocateFixture([match("m1", 1, "a", "b")], {
      ...base,
      fromDate: "2026-09-01",
      alreadyScheduled: [{ round: 9, date: "2026-12-19" }],
    });

    expect(result.assignments[0]!.date).toBe("2026-09-05");
  });

  it("copes with no availability at all", () => {
    const result = allocateFixture([match("m1", 1, "a", "b")], { ...base, windows: [] });
    expect(result.assignments).toEqual([]);
    expect(result.unassigned).toEqual([{ matchId: "m1", reason: "no_slots_left" }]);
  });
});
