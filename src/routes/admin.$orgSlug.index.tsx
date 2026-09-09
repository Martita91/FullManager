import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getMyOrganization } from "@/features/organizations/organizations.functions";

export const Route = createFileRoute("/admin/$orgSlug/")({
  component: OrganizationDashboard,
});

/**
 * Placeholder dashboard. Phase 1 fills this with seasons, divisions, teams and
 * people; phase 2 adds competitions and the fixture.
 */
function OrganizationDashboard() {
  const { t } = useTranslation();
  const { orgSlug } = Route.useParams();

  const membership = useQuery({
    queryKey: ["organization", orgSlug],
    queryFn: () => getMyOrganization({ data: { slug: orgSlug } }),
  });

  const organization = membership.data?.organization;

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        {organization?.name ?? t("common.loading")}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {t("org.dashboardTitle")} · {organization?.timezone}
      </p>

      <div className="border-border mt-8 rounded-xl border border-dashed p-10 text-center">
        <p className="text-muted-foreground text-sm">{t("org.dashboardEmpty")}</p>
      </div>
    </main>
  );
}
