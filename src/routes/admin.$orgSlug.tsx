import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getMyOrganization } from "@/features/organizations/organizations.functions";

export const Route = createFileRoute("/admin/$orgSlug")({
  component: OrganizationLayout,
});

/**
 * Membership gate. RLS already refuses to return an organization the user isn't
 * a member of, so this screen is about saying so clearly rather than about
 * enforcement — the database is what enforces.
 */
function OrganizationLayout() {
  const { t } = useTranslation();
  const { orgSlug } = Route.useParams();

  const membership = useQuery({
    queryKey: ["organization", orgSlug],
    queryFn: () => getMyOrganization({ data: { slug: orgSlug } }),
  });

  if (membership.isPending) {
    return <Centered title={t("common.loading")} />;
  }

  if (!membership.data) {
    return <Centered title={t("errors.forbiddenTitle")} body={t("errors.forbiddenBody")} />;
  }

  return <Outlet />;
}

function Centered({ title, body }: { title: string; body?: string }) {
  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center px-5 text-center">
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="text-muted-foreground mt-1 text-sm">{body}</p>}
    </main>
  );
}
