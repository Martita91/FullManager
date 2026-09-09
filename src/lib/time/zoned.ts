/**
 * Kick-off times are stored as instants and shown in the organization's time
 * zone — which may not be the one the person editing them is sitting in.
 *
 * A `datetime-local` input has no time zone at all: it hands back the digits a
 * human typed. These helpers read and write those digits as belonging to the
 * league's zone, so a Perth league entering "09:00" gets 09:00 in Perth no
 * matter where the admin is.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Milliseconds that `timeZone` is ahead of UTC at this instant. */
function offsetAt(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");

  // `hour` comes back as 24 at midnight under hour12:false in some engines.
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );

  return asIfUtc - date.getTime();
}

/**
 * "2026-10-03T09:00" read as a wall clock in `timeZone` -> ISO instant.
 *
 * The offset depends on the instant, and the instant is what we're solving for,
 * so this guesses once and corrects — which is what makes it right across a
 * daylight-saving change.
 */
export function zonedInputToIso(input: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(input.trim());
  if (!match) return null;

  const [, y, mo, d, h, mi] = match.map(Number) as unknown as number[];
  const wallClock = Date.UTC(y!, mo! - 1, d!, h!, mi!);

  let instant = wallClock - offsetAt(new Date(wallClock), timeZone);
  instant = wallClock - offsetAt(new Date(instant), timeZone);

  return new Date(instant).toISOString();
}

/** ISO instant -> "YYYY-MM-DDTHH:mm" as read in `timeZone`. */
export function isoToZonedInput(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = pad(Number(get("hour")) % 24);

  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/** Human-readable kick-off, in the league's zone. */
export function formatKickoff(iso: string | null, timeZone: string, locale = "en"): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
