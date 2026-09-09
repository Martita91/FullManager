import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatKickoff,
  formatPlainDate,
  formatTime,
  isoToZonedInput,
  zonedInputToIso,
} from "./zoned";

describe("zoned kick-off times", () => {
  it("reads a wall clock as belonging to the league's zone, not the browser's", () => {
    // Perth is UTC+8 with no daylight saving.
    expect(zonedInputToIso("2026-10-03T09:00", "Australia/Perth")).toBe("2026-10-03T01:00:00.000Z");
    // The same digits in Buenos Aires (UTC-3) are a different instant.
    expect(zonedInputToIso("2026-10-03T09:00", "America/Argentina/Buenos_Aires")).toBe(
      "2026-10-03T12:00:00.000Z",
    );
  });

  it("round-trips a time without drifting", () => {
    const zones = ["Australia/Perth", "America/Argentina/Buenos_Aires", "Europe/Madrid", "UTC"];
    for (const zone of zones) {
      const input = "2026-07-15T18:30";
      const iso = zonedInputToIso(input, zone)!;
      expect(isoToZonedInput(iso, zone)).toBe(input);
    }
  });

  it("survives a daylight-saving change", () => {
    // Madrid moves to +02:00 on the last Sunday of March.
    const winter = zonedInputToIso("2026-03-01T12:00", "Europe/Madrid");
    const summer = zonedInputToIso("2026-06-01T12:00", "Europe/Madrid");

    expect(winter).toBe("2026-03-01T11:00:00.000Z"); // UTC+1
    expect(summer).toBe("2026-06-01T10:00:00.000Z"); // UTC+2

    // And both read back as the noon that was typed.
    expect(isoToZonedInput(winter!, "Europe/Madrid")).toBe("2026-03-01T12:00");
    expect(isoToZonedInput(summer!, "Europe/Madrid")).toBe("2026-06-01T12:00");
  });

  it("handles midnight, where hour formatting likes to produce 24", () => {
    const iso = zonedInputToIso("2026-01-05T00:00", "Australia/Perth");
    expect(iso).toBe("2026-01-04T16:00:00.000Z");
    expect(isoToZonedInput(iso!, "Australia/Perth")).toBe("2026-01-05T00:00");
  });

  it("treats an empty or malformed value as no time at all", () => {
    expect(zonedInputToIso("", "UTC")).toBeNull();
    expect(zonedInputToIso("tomorrow", "UTC")).toBeNull();
    expect(isoToZonedInput(null, "UTC")).toBe("");
    expect(isoToZonedInput("not a date", "UTC")).toBe("");
    expect(formatKickoff(null, "UTC")).toBe("");
  });

  it("formats in the league's zone", () => {
    const iso = "2026-10-03T01:00:00.000Z";
    expect(formatKickoff(iso, "Australia/Perth")).toContain("09:00");
    expect(formatKickoff(iso, "UTC")).toContain("01:00");
  });

  it("writes dates dd/mm/yyyy, never the American order", () => {
    // 3 October, which a US format would render as 10/03.
    const iso = "2026-10-03T01:00:00.000Z";
    expect(formatDate(iso, "Australia/Perth")).toBe("03/10/2026");
    expect(formatPlainDate("2026-10-03")).toBe("03/10/2026");
  });

  it("puts the day, date and time in one readable kick-off", () => {
    const iso = "2026-10-03T01:00:00.000Z";
    expect(formatKickoff(iso, "Australia/Perth")).toBe("Sat 03/10/2026 · 09:00");
  });

  it("crosses midnight into the right local day", () => {
    // 22:00 UTC is already the next morning in Perth.
    const iso = "2026-10-03T22:00:00.000Z";
    expect(formatDate(iso, "Australia/Perth")).toBe("04/10/2026");
    expect(formatTime(iso, "Australia/Perth")).toBe("06:00");
  });

  it("leaves a malformed plain date alone rather than mangling it", () => {
    expect(formatPlainDate("")).toBe("");
    expect(formatPlainDate(null)).toBe("");
    expect(formatPlainDate("not a date")).toBe("not a date");
  });
});
