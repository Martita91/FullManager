import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getOrgOverview } from "@/features/organizations/overview.functions";
import { useOrgMembership } from "@/features/organizations/useOrgMembership";
import { LIVE_STALE_TIME } from "@/lib/query/staleness";
import { formatKickoff } from "@/lib/time/zoned";
import { CatalogPage } from "@/components/CatalogPage";
import { Card, EmptyState } from "@/components/ui/controls";

export const Route = createFileRoute("/admin/$orgSlug/")({
  component: OrganizationDashboard,
});

/**
 * The organiser's first screen. Counts alone are decoration, so the part that
 * earns its place is "needs attention": the played match with no score, the
 * competition with teams and no fixture. Those are the jobs that quietly rot.
 */
function OrganizationDashboard() {
  const { t } = useTranslation();
  const { orgSlug } = Route.useParams();
  const { organization } = useOrgMembership(orgSlug);

  // Counts and warnings drawn from every table in the league. No mutation
  // anywhere invalidates this key, so it has to refetch on each visit — which
  // is also what makes "needs attention" trustworthy after you fix something.
  const overview = useQuery({
    queryKey: ["overview", orgSlug],
    queryFn: () => getOrgOverview({ data: { orgSlug } }),
    staleTime: LIVE_STALE_TIME,
  });

  const data = overview.data;

  const attention = data
    ? [
        data.attention.missingResults > 0 && {
          key: "missingResults",
          text: t("overview.missingResults", { count: data.attention.missingResults }),
          to: "/admin/$orgSlug/competitions" as const,
        },
        data.attention.competitionsWithoutFixture > 0 && {
          key: "withoutFixture",
          text: t("overview.withoutFixture", { count: data.attention.competitionsWithoutFixture }),
          to: "/admin/$orgSlug/competitions" as const,
        },
        data.attention.matchesWithoutKickoff > 0 && {
          key: "withoutKickoff",
          text: t("overview.withoutKickoff", { count: data.attention.matchesWithoutKickoff }),
          to: "/admin/$orgSlug/competitions" as const,
        },
        data.attention.unpublishedWithFixture > 0 && {
          key: "unpublished",
          text: t("overview.unpublished", { count: data.attention.unpublishedWithFixture }),
          to: "/admin/$orgSlug/competitions" as const,
        },
      ].filter((x): x is { key: string; text: string; to: "/admin/$orgSlug/competitions" } =>
        Boolean(x),
      )
    : [];

  const counts: { key: string; label: string; value: number }[] = data
    ? [
        { key: "competitions", label: t("nav.competitions"), value: data.counts.competitions },
        { key: "teams", label: t("nav.teams"), value: data.counts.teams },
        { key: "people", label: t("nav.people"), value: data.counts.people },
        { key: "venues", label: t("nav.venues"), value: data.counts.venues },
        { key: "seasons", label: t("nav.seasons"), value: data.counts.seasons },
        { key: "divisions", label: t("nav.divisions"), value: data.counts.divisions },
      ]
    : [];

  return (
    <CatalogPage
      title={organization?.name ?? t("common.loading")}
      subtitle={`${t("org.dashboardTitle")} · ${organization?.timezone ?? ""}`}
    >
      {overview.isPending || !data ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="label-caps text-muted-foreground mb-3 text-[0.68rem]">
              {t("overview.countsTitle")}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {counts.map((entry) => (
                <div key={entry.key} className="border-border bg-card rounded-xl border px-4 py-3">
                  <p className="num text-2xl">{entry.value}</p>
                  <p className="text-muted-foreground text-xs">{entry.label}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="label-caps text-muted-foreground mb-3 text-[0.68rem]">
              {t("overview.attentionTitle")}
            </h2>
            {attention.length > 0 ? (
              <div className="space-y-2">
                {attention.map((item) => (
                  <Link
                    key={item.key}
                    to={item.to}
                    params={{ orgSlug }}
                    className="border-border bg-card hover:border-primary/40 block rounded-lg border px-4 py-3 text-sm transition-colors"
                  >
                    {item.text}
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title={t("overview.allClear")} />
            )}
          </section>

          <section>
            <h2 className="label-caps text-muted-foreground mb-3 text-[0.68rem]">
              {t("overview.upcomingTitle")}
            </h2>
            {data.upcoming.length > 0 ? (
              <div className="space-y-2">
                {data.upcoming.map((match) => (
                  <Card key={match.matchId} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">
                        {match.homeTeamName} v {match.awayTeamName}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {formatKickoff(match.kickoffAt, data.timeZone)}
                        {match.venueName ? ` · ${match.venueName}` : ""}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">{match.competitionName}</p>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState title={t("overview.noUpcoming")} />
            )}
          </section>
        </div>
      )}
    </CatalogPage>
  );
}
