import { branding } from "./branding";

/**
 * Meta tags for a page meant to be shared.
 *
 * The public site's whole value is a link somebody pastes into a group chat, so
 * these are not decoration: without them WhatsApp, Slack and search engines see
 * a bare shell. They only work if the page's data is fetched in the route
 * loader — a scraper runs no JavaScript, so anything fetched after hydration
 * does not exist as far as it is concerned.
 */
export interface SeoInput {
  title: string;
  description: string;
  /** Path with a leading slash. Made absolute against the configured origin. */
  path: string;
}

export function seoMeta({ title, description, path }: SeoInput) {
  const url = branding.siteUrl ? `${branding.siteUrl}${path}` : path;

  return [
    { title },
    { name: "description", content: description },

    { property: "og:type", content: "website" },
    { property: "og:site_name", content: branding.productName },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },

    // Without an image, a card falls back to title and description, which is
    // what we want until there is a real one. Naming a file that scrapers can't
    // read would be worse than naming none.
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
}

/** Plain-language summary of where a competition stands. */
export function competitionDescription(input: {
  seasonName: string;
  divisionName: string;
  teamCount: number;
  playedCount: number;
  leaderName: string | null;
}): string {
  const parts = [input.seasonName, input.divisionName].filter(Boolean).join(" · ");
  const teams = `${input.teamCount} teams`;
  const played = input.playedCount > 0 ? `${input.playedCount} matches played` : "no matches yet";
  const leader = input.leaderName ? `. ${input.leaderName} lead the table` : "";

  return `${parts ? `${parts} — ` : ""}${teams}, ${played}${leader}.`;
}
