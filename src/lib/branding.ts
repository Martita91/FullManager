/**
 * Every product-identity string lives here and nowhere else.
 *
 * The name is provisional, so renaming has to stay a one-file change: no
 * component, route, email or page title may hardcode "Full Manager". If you
 * need the name in user-facing copy, interpolate it into a translation string
 * (`{{productName}}`) rather than writing it into the English text.
 */
export const branding = {
  /** Product name, as shown to users. */
  productName: "Full Manager",
  /** Used where a compact mark is needed (nav, favicon text, small screens). */
  shortName: "FM",
  /**
   * Public origin, with no trailing slash. Link previews and canonical URLs
   * have to be absolute — a scraper has no page to resolve a relative one
   * against — so this needs updating if the domain changes.
   */
  siteUrl: "https://full-manager-nine.vercel.app",
  /** Where support mail goes. Empty until a mailbox exists. */
  supportEmail: "",
} as const;

export type Branding = typeof branding;
