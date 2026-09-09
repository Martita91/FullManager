/**
 * Roles are ordered from most to least privileged. Only `owner`, `admin` and
 * `staff` are used today — the league staff loads everything. `team_admin` and
 * `viewer` exist in the enum from the start because adding a value to a
 * Postgres enum later is a migration, and because permission checks written
 * against a complete list age better than ones that assume three roles.
 */
export const ORG_ROLES = ["owner", "admin", "staff", "team_admin", "viewer"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Roles allowed to change league data (seasons, teams, fixtures, results). */
export const EDITOR_ROLES: readonly OrgRole[] = ["owner", "admin", "staff"];

/**
 * Slugs that would shadow a real route. `/admin/new` is a static route and
 * TanStack Router resolves static segments before `/admin/$orgSlug`, so an
 * organization that claimed "new" would simply be unreachable. The rest are
 * reserved ahead of the public site in phase 3.
 */
export const RESERVED_SLUGS: readonly string[] = [
  "admin",
  "api",
  "auth",
  "login",
  "logout",
  "new",
  "settings",
  "signup",
  "static",
  "support",
  "www",
];

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug);
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  isPublic: boolean;
}

export interface OrganizationMembership {
  organization: Organization;
  role: OrgRole;
}

export function canEdit(role: OrgRole): boolean {
  return EDITOR_ROLES.includes(role);
}
