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
  const { data, error } = await supabase
    .from("org_members")
    .select("role, organizations!inner(id, slug)")
    .eq("user_id", userId)
    .eq("organizations.slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new ForbiddenError();

  const row = data as unknown as { role: OrgRole; organizations: { id: string } | null };
  if (!row.organizations) throw new ForbiddenError();

  return { orgId: row.organizations.id, role: row.role };
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
