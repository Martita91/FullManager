/**
 * Putting a drawn fixture onto a calendar: which match plays on which pitch, at
 * which time.
 *
 * The draw (roundRobin.ts) decides who plays whom. This decides when. Keeping
 * them apart is what makes either one comprehensible — and it means this can be
 * tested with plain data, no database and no time zones: every date here is a
 * local "YYYY-MM-DD" as the league reads it, and every time a local "HH:MM".
 * Converting those to instants happens once, at the edge, when they are saved.
 */

export type PreferenceKind = "preferred" | "avoid" | "unavailable";

export interface AvailabilityWindow {
  pitchId: string;
  /** 0 = Sunday, matching Date#getUTCDay. */
  weekday: number;
  startsAt: string;
  endsAt: string;
  slotMinutes: number;
}

export interface TimePreference {
  teamId: string;
  weekday: number;
  /** Null means the whole day. */
  startsAt: string | null;
  endsAt: string | null;
  kind: PreferenceKind;
}

export interface UnscheduledMatch {
  id: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
}

export interface Slot {
  pitchId: string;
  date: string;
  time: string;
  weekday: number;
  /** Minutes from midnight — the form every comparison here works in. */
  minutes: number;
}

export interface Assignment {
  matchId: string;
  pitchId: string;
  date: string;
  time: string;
}

export type UnassignedReason = "no_slots_left" | "teams_unavailable";

export interface AllocationResult {
  assignments: Assignment[];
  unassigned: { matchId: string; reason: UnassignedReason }[];
}

const MINUTES_PER_DAY = 24 * 60;

export function timeToMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Date maths on plain YYYY-MM-DD, via UTC so no zone can shift a day. */
function toUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * 86_400_000);
}

function weekdayOf(date: string): number {
  return new Date(toUtc(date)).getUTCDay();
}

/**
 * Turn recurring weekly windows into the concrete slots available between two
 * dates, inclusive.
 *
 * A window that doesn't divide evenly simply yields fewer slots — a 9:00-10:30
 * window with 60-minute games gives one slot at 9:00, not one and a half.
 */
export function expandSlots(
  windows: readonly AvailabilityWindow[],
  fromDate: string,
  toDate: string,
): Slot[] {
  const slots: Slot[] = [];
  if (toUtc(toDate) < toUtc(fromDate)) return slots;

  for (let date = fromDate; toUtc(date) <= toUtc(toDate); date = addDays(date, 1)) {
    const weekday = weekdayOf(date);

    for (const window of windows) {
      if (window.weekday !== weekday) continue;

      const start = timeToMinutes(window.startsAt);
      const end = timeToMinutes(window.endsAt);
      const step = window.slotMinutes;
      if (!Number.isFinite(start) || !Number.isFinite(end) || step <= 0) continue;

      for (let minutes = start; minutes + step <= Math.min(end, MINUTES_PER_DAY); minutes += step) {
        slots.push({
          pitchId: window.pitchId,
          date,
          time: minutesToTime(minutes),
          weekday,
          minutes,
        });
      }
    }
  }

  slots.sort(
    (a, b) =>
      toUtc(a.date) - toUtc(b.date) || a.minutes - b.minutes || a.pitchId.localeCompare(b.pitchId),
  );

  return slots;
}

/** Does a preference apply to this slot? A null window covers the whole day. */
function covers(preference: TimePreference, slot: Slot): boolean {
  if (preference.weekday !== slot.weekday) return false;
  if (preference.startsAt === null || preference.endsAt === null) return true;

  const from = timeToMinutes(preference.startsAt);
  const to = timeToMinutes(preference.endsAt);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return true;

  return slot.minutes >= from && slot.minutes < to;
}

const SCORE = { preferred: 3, avoid: -4 } as const;

/**
 * How well a slot suits a match: positive is better. `null` means one of the
 * teams has declared itself unavailable, which is a rule and not a preference.
 */
function scoreSlot(
  slot: Slot,
  match: UnscheduledMatch,
  preferencesByTeam: Map<string, TimePreference[]>,
): number | null {
  let score = 0;

  for (const teamId of [match.homeTeamId, match.awayTeamId]) {
    for (const preference of preferencesByTeam.get(teamId) ?? []) {
      if (!covers(preference, slot)) continue;
      if (preference.kind === "unavailable") return null;
      score += SCORE[preference.kind];
    }
  }

  return score;
}

export interface AllocateOptions {
  /** First date the season may use, inclusive. */
  fromDate: string;
  /** Last date the season may use, inclusive. */
  toDate: string;
  windows: readonly AvailabilityWindow[];
  preferences: readonly TimePreference[];
}

/**
 * Assign every match a pitch and a time.
 *
 * Rounds are placed in order and never share a date: round 2 starts the day
 * after round 1 finishes. That is what a league means by a round, and it also
 * keeps the result readable — a fixture where rounds interleave is technically
 * valid and impossible to explain to anyone.
 *
 * Within a round, matches are placed one at a time onto the best-scoring free
 * slot. No team plays twice on the same day.
 */
export function allocateFixture(
  matches: readonly UnscheduledMatch[],
  options: AllocateOptions,
): AllocationResult {
  const slots = expandSlots(options.windows, options.fromDate, options.toDate);

  const preferencesByTeam = new Map<string, TimePreference[]>();
  for (const preference of options.preferences) {
    const list = preferencesByTeam.get(preference.teamId);
    if (list) list.push(preference);
    else preferencesByTeam.set(preference.teamId, [preference]);
  }

  const slotsByDate = new Map<string, Slot[]>();
  for (const slot of slots) {
    const list = slotsByDate.get(slot.date);
    if (list) list.push(slot);
    else slotsByDate.set(slot.date, [slot]);
  }
  const dates = [...slotsByDate.keys()].sort((a, b) => toUtc(a) - toUtc(b));

  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);

  const assignments: Assignment[] = [];
  const unassigned: AllocationResult["unassigned"] = [];
  const takenSlots = new Set<string>();

  // Index into `dates` where the current round may start.
  let dateCursor = 0;

  for (const round of rounds) {
    const remaining = matches.filter((m) => m.round === round);
    // Teams already playing on a given date, for this round's placement.
    const playingOn = new Map<string, Set<string>>();
    let lastDateIndex = dateCursor - 1;

    for (let index = dateCursor; index < dates.length && remaining.length > 0; index++) {
      const date = dates[index]!;
      const daySlots = slotsByDate.get(date)!;

      let placedSomething = true;
      while (placedSomething && remaining.length > 0) {
        placedSomething = false;

        let best: { matchIndex: number; slot: Slot; score: number } | null = null;

        for (let m = 0; m < remaining.length; m++) {
          const match = remaining[m]!;
          const busy = playingOn.get(date);
          if (busy?.has(match.homeTeamId) || busy?.has(match.awayTeamId)) continue;

          for (const slot of daySlots) {
            const key = `${slot.pitchId}@${slot.date}T${slot.time}`;
            if (takenSlots.has(key)) continue;

            const score = scoreSlot(slot, match, preferencesByTeam);
            if (score === null) continue;

            if (!best || score > best.score) best = { matchIndex: m, slot, score };
          }
        }

        if (best) {
          const match = remaining[best.matchIndex]!;
          takenSlots.add(`${best.slot.pitchId}@${best.slot.date}T${best.slot.time}`);
          assignments.push({
            matchId: match.id,
            pitchId: best.slot.pitchId,
            date: best.slot.date,
            time: best.slot.time,
          });

          const busy = playingOn.get(date) ?? new Set<string>();
          busy.add(match.homeTeamId);
          busy.add(match.awayTeamId);
          playingOn.set(date, busy);

          remaining.splice(best.matchIndex, 1);
          lastDateIndex = index;
          placedSomething = true;
        }
      }
    }

    // Anything still unplaced could not fit anywhere in the remaining calendar.
    for (const match of remaining) {
      // `every` on an empty list is true, so an empty calendar would otherwise
      // be reported as "the teams are unavailable" — sending the organiser to
      // check preferences when what they actually forgot was the pitches.
      const blockedEverywhere =
        slots.length > 0 &&
        slots.every((slot) => scoreSlot(slot, match, preferencesByTeam) === null);
      unassigned.push({
        matchId: match.id,
        reason: blockedEverywhere ? "teams_unavailable" : "no_slots_left",
      });
    }

    // The next round starts after this one finishes.
    dateCursor = Math.max(dateCursor, lastDateIndex + 1);
  }

  return { assignments, unassigned };
}
