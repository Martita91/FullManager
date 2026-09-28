import type { SupabaseClient } from "@supabase/supabase-js";
import { canEdit, type OrgRole } from "./types";

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  constructor(message = "Not a member of this organization") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export interface OrgAccess {
  orgId: string;
  role: OrgRole;
}

/**
 * Recently resolved memberships, per server instance.
 *
 * Every server function begins by asking the same question — "does this user
 * belong to this league, and what is its id?" — and a single screen fires four
 * or five of them. That was a round trip to Supabase each time, for an answer
 * that changes about once a season.
 *
 * Safe to cache because, as below, this lookup is not what protects anything.
 * A role that has just been downgraded may leave an edit button on screen for
 * up to half a minute; the write behind it still fails, because RLS re-reads
 * `org_members` on every statement and does not consult this map.
 */
const ACCESS_TTL_MS = 30_000;
const MAX_CACHED_ACCESS = 500;

const accessCache = new Map<string, { access: OrgAccess; expiresAt: number }>();

/**
 * Resolve an organization slug to its id, and confirm the caller belongs to it.
 *
 * Note this is *not* what keeps other leagues' data safe — RLS does that, and
 * would return nothing regardless. This exists so a caller who isn't a member
 * gets a clear 403 instead of a confusing empty page, and so handlers have the
 * org id without repeating the lookup.
 */
export async function requireOrgAccess(
  supabase: SupabaseClient,
  userId: string,
  slug: string,
): Promise<OrgAccess> {
  const key = `${userId}:${slug}`;
  const now = Date.now();

  const cached = accessCache.get(key);
  if (cached && cached.expiresAt > now) return cached.access;

  const { data, error } = await supabase
    .from("org_members")
    .select("role, organizations!inner(id, slug)")
    .eq("user_id", userId)
    .eq("organizations.slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  // A refusal is never cached: a user who has just been added to a league
  // should not have to wait out a TTL to get in.
  if (!data) throw new ForbiddenError();

  const row = data as unknown as { role: OrgRole; organizations: { id: string } | null };
  if (!row.organizations) throw new ForbiddenError();

  const access: OrgAccess = { orgId: row.organizations.id, role: row.role };

  if (accessCache.size >= MAX_CACHED_ACCESS) accessCache.clear();
  accessCache.set(key, { access, expiresAt: now + ACCESS_TTL_MS });

  return access;
}

/** Same, but also refuses roles that may only read. */
export async function requireOrgEditor(
  supabase: SupabaseClient,
  userId: string,
  slug: string,
): Promise<OrgAccess> {
  const access = await requireOrgAccess(supabase, userId, slug);
  if (!canEdit(access.role)) {
    throw new ForbiddenError("Your role can't change league data");
  }
  return access;
}
