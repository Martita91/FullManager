import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify } from "@/lib/utils";
import { isReservedSlug, type OrganizationMembership, type OrgRole } from "./types";

/**
 * Shape Supabase returns for the embedded organization. The generated types
 * aren't wired up yet (no project to generate from), so this is hand-written
 * and should be replaced by `supabase gen types` output once the project exists.
 */
interface MembershipRow {
  role: OrgRole;
  organizations: {
    id: string;
    slug: string;
    name: string;
    timezone: string;
    is_public: boolean;
  } | null;
}

function toMembership(row: MembershipRow): OrganizationMembership | null {
  if (!row.organizations) return null;
  return {
    role: row.role,
    organization: {
      id: row.organizations.id,
      slug: row.organizations.slug,
      name: row.organizations.name,
      timezone: row.organizations.timezone,
      isPublic: row.organizations.is_public,
    },
  };
}

/** Every organization the signed-in user belongs to, with their role in each. */
export const listMyOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrganizationMembership[]> => {
    const { data, error } = await context.supabase
      .from("org_members")
      .select("role, organizations!inner(id, slug, name, timezone, is_public)")
      // RLS lets a member see every row of an org they belong to, so this
      // filter is what makes it "mine" rather than "everyone's".
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);

    return ((data ?? []) as unknown as MembershipRow[])
      .map(toMembership)
      .filter((m): m is OrganizationMembership => m !== null)
      .sort((a, b) => a.organization.name.localeCompare(b.organization.name));
  });

const createOrganizationInput = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers and dashes."),
  timezone: z.string().trim().min(1).max(64),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationInput>;

/** Postgres unique-violation. The slug is the only unique column here. */
const UNIQUE_VIOLATION = "23505";

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createOrganizationInput.parse(input))
  .handler(async ({ data, context }): Promise<{ slug: string }> => {
    // Re-slugified server-side: the client's version is a convenience, not a
    // guarantee, and this value ends up in a public URL.
    const slug = slugify(data.slug);
    if (!slug) throw new Error("That name doesn't produce a usable URL.");
    if (isReservedSlug(slug)) throw new Error("SLUG_TAKEN");

    // The creator is added as `owner` by a trigger on this insert, not here:
    // doing it in two round trips would leave an org with no members if the
    // second one failed, and no policy could then repair it.
    const { data: created, error } = await context.supabase
      .from("organizations")
      .insert({
        name: data.name,
        slug,
        timezone: data.timezone,
        created_by: context.userId,
      })
      .select("slug")
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new Error("SLUG_TAKEN");
      throw new Error(error.message);
    }

    return { slug: created.slug };
  });

const getOrganizationInput = z.object({ slug: z.string().trim().min(1) });

/** One organization the user belongs to, or null if they don't belong to it. */
export const getMyOrganization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => getOrganizationInput.parse(input))
  .handler(async ({ data, context }): Promise<OrganizationMembership | null> => {
    const { data: row, error } = await context.supabase
      .from("org_members")
      .select("role, organizations!inner(id, slug, name, timezone, is_public)")
      .eq("user_id", context.userId)
      .eq("organizations.slug", data.slug)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) return null;

    return toMembership(row as unknown as MembershipRow);
  });
