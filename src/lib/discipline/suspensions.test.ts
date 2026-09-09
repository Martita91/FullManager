import { describe, expect, it } from "vitest";
import {
  computeSuspensions,
  tallyCards,
  upcomingSuspensions,
  type DisciplineEvent,
  type TeamRound,
} from "./suspensions";

const card = (
  round: number,
  kind: "yellow" | "red",
  personId = "p1",
  teamId = "teamA",
): DisciplineEvent => ({ personId, personName: personId, teamId, round, kind });

/** teamA plays every round 1-6; teamB plays 1, 3 and 5. */
const teamRounds: TeamRound[] = [
  ...[1, 2, 3, 4, 5, 6].map((round) => ({ teamId: "teamA", round })),
  ...[1, 3, 5].map((round) => ({ teamId: "teamB", round })),
];

const THREE = { yellowsForSuspension: 3 };

describe("computeSuspensions", () => {
  it("suspends nobody before the threshold is reached", () => {
    const suspensions = computeSuspensions(
      [card(1, "yellow"), card(2, "yellow")],
      teamRounds,
      THREE,
    );
    expect(suspensions).toEqual([]);
  });

  it("suspends on the Nth yellow, for the next round", () => {
    const suspensions = computeSuspensions(
      [card(1, "yellow"), card(2, "yellow"), card(3, "yellow")],
      teamRounds,
      THREE,
    );

    expect(suspensions).toHaveLength(1);
    expect(suspensions[0]).toMatchObject({
      reason: "yellow_accumulation",
      triggeredInRound: 3,
      servesRound: 4,
      yellowCount: 3,
    });
  });

  it("suspends again on every further multiple, not only the first", () => {
    const yellows = [1, 2, 3, 4, 5, 6].map((round) => card(round, "yellow"));
    const suspensions = computeSuspensions(yellows, teamRounds, THREE);

    expect(suspensions.map((s) => s.yellowCount)).toEqual([3, 6]);
  });

  it("suspends for a red card on its own", () => {
    const suspensions = computeSuspensions([card(2, "red")], teamRounds, THREE);

    expect(suspensions).toHaveLength(1);
    expect(suspensions[0]).toMatchObject({
      reason: "red_card",
      triggeredInRound: 2,
      servesRound: 3,
      yellowCount: null,
    });
  });

  it("serves the ban in the team's next match, not simply the next round", () => {
    // teamB does not play in round 4, so a round-3 red is served in round 5.
    const suspensions = computeSuspensions([card(3, "red", "p9", "teamB")], teamRounds, THREE);
    expect(suspensions[0]!.servesRound).toBe(5);
  });

  it("says a ban has nowhere to be served when the season is over", () => {
    const suspensions = computeSuspensions([card(6, "red")], teamRounds, THREE);
    expect(suspensions[0]!.servesRound).toBeNull();
    expect(upcomingSuspensions(suspensions)).toEqual([]);
  });

  it("turns accumulation off when the threshold is zero, but keeps reds", () => {
    const events = [card(1, "yellow"), card(2, "yellow"), card(3, "yellow"), card(4, "red")];
    const suspensions = computeSuspensions(events, teamRounds, { yellowsForSuspension: 0 });

    expect(suspensions).toHaveLength(1);
    expect(suspensions[0]!.reason).toBe("red_card");
  });

  it("counts each player separately", () => {
    const events = [
      card(1, "yellow", "p1"),
      card(1, "yellow", "p2"),
      card(2, "yellow", "p1"),
      card(3, "yellow", "p1"),
    ];
    const suspensions = computeSuspensions(events, teamRounds, THREE);

    expect(suspensions).toHaveLength(1);
    expect(suspensions[0]!.personId).toBe("p1");
  });

  it("does not care what order the events arrive in", () => {
    const inOrder = [card(1, "yellow"), card(2, "yellow"), card(3, "yellow")];
    const shuffled = [card(3, "yellow"), card(1, "yellow"), card(2, "yellow")];

    expect(computeSuspensions(shuffled, teamRounds, THREE)).toEqual(
      computeSuspensions(inOrder, teamRounds, THREE),
    );
  });
});

describe("tallyCards", () => {
  it("counts yellows and reds per player", () => {
    const events = [
      card(1, "yellow", "p1"),
      card(2, "red", "p1"),
      card(1, "yellow", "p2"),
      card(2, "yellow", "p2"),
    ];
    const table = tallyCards(events, THREE);

    // A red puts a player at the top of a discipline table.
    expect(table[0]!.personId).toBe("p1");
    expect(table[0]).toMatchObject({ yellows: 1, reds: 1 });
    expect(table[1]).toMatchObject({ personId: "p2", yellows: 2, reds: 0 });
  });

  it("says how many yellows are left before the next ban", () => {
    const table = tallyCards([card(1, "yellow"), card(2, "yellow")], THREE);
    expect(table[0]!.yellowsToNextBan).toBe(1);
  });

  it("resets the countdown after a ban is triggered", () => {
    const three = [card(1, "yellow"), card(2, "yellow"), card(3, "yellow")];
    expect(tallyCards(three, THREE)[0]!.yellowsToNextBan).toBe(3);
  });

  it("has no countdown when accumulation is off", () => {
    const table = tallyCards([card(1, "yellow")], { yellowsForSuspension: 0 });
    expect(table[0]!.yellowsToNextBan).toBeNull();
  });
});
