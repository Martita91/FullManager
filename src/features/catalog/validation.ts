import { z } from "zod";

/**
 * HTML date and text inputs hand back "" when the user clears them, which is
 * not the same as an invalid value. These turn "" into null and still reject
 * anything genuinely malformed, so a typo surfaces as an error instead of
 * quietly saving nothing.
 */
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const optionalDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .nullable(),
);

export const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().min(1).max(max).nullable());

export const optionalEmail = z.preprocess(
  emptyToNull,
  z.string().trim().email().max(160).nullable(),
);

export const optionalNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(min).max(max).nullable(),
  );

export const orgSlug = z.string().trim().min(1).max(48);
export const uuid = z.string().uuid();
