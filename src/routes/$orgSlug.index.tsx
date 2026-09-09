import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getPublicOrganization } from "@/features/public/public.functions";
import { branding } from "@/lib/branding";
import { Card, EmptyState } from "@/components/ui/controls";

export const Route = createFileRoute("/$orgSlug/")({
  component: PublicLeague,
});

/**
 * A league's public front page. No account needed — this is the link that gets
 * shared, so it has to work for someone who has never heard of the product.
 */
function PublicLeague() {
  const { t } = useTranslation();
  const { orgSlug } = Route.useParams();

  const league = useQuery({
    queryKey: ["public-org", orgSlug],
    queryFn: () => getPublicOrganization({ data: { slug: orgSlug } }),
  });

  if (league.isPending) {
    return <Shell title={t("common.loading")}>{null}</Shell>;
  }

  if (!league.data) {
    return (
      <Shell title={t("errors.notFoundTitle")}>
        <p className="text-muted-foreground text-sm">{t("publicSite.notFound")}</p>
      </Shell>
    );
  }

  const { organization, competitions } = league.data;

  return (
    <Shell title={organization.name}>
      <h2 className="mb-4 text-sm font-semibold">{t("publicSite.competitionsTitle")}</h2>

      {competitions.length > 0 ? (
        <ul className="space-y-3">
          {competitions.map((competition) => (
            <li key={competition.id}>
              <Link
                to="/$orgSlug/c/$competitionId"
                params={{ orgSlug, competitionId: competition.id }}
                className="block"
              >
                <Card className="hover:border-foreground/30 transition-colors">
                  <p className="font-medium">{competition.name}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {competition.seasonName} · {competition.divisionName} · {competition.teamCount}{" "}
                    {t("competitions.teams").toLowerCase()}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t("publicSite.noCompetitions")} />
      )}
    </Shell>
  );
}

export function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-border border-b px-5 py-3">
        <Link to="/" className="text-muted-foreground text-xs font-medium">
          {branding.productName}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{title}</h1>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8">{children}</main>
    </div>
  );
}
