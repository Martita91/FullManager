import { useQuery } from "@tanstack/react-query";
import { getMyOrganization } from "./organizations.functions";
import { canEdit } from "./types";

/**
 * The current user's membership in one organization.
 *
 * Every catalog screen needs the role to decide whether to show edit controls,
 * and they all share this query key, so React Query fetches it once per slug
 * and hands the cached answer to the rest.
 */
export function useOrgMembership(orgSlug: string) {
  const query = useQuery({
    queryKey: ["organization", orgSlug],
    queryFn: () => getMyOrganization({ data: { slug: orgSlug } }),
  });

  return {
    ...query,
    organization: query.data?.organization ?? null,
    role: query.data?.role ?? null,
    // Hiding controls is a courtesy, not the protection: RLS refuses the write
    // regardless of what the interface shows.
    canEdit: query.data ? canEdit(query.data.role) : false,
  };
}
