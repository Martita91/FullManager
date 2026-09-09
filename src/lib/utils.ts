import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Combining marks (accents), left behind by NFD normalization. */
const COMBINING_MARKS = /\p{M}/gu;

/**
 * URL-safe slug from a free-text name. Organization slugs show up in public
 * URLs (`/{slug}/...`), so accents are stripped rather than percent-encoded:
 * "Liga Municipal Nunoa" keeps its shape, and an accented name still resolves.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
