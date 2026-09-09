import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { getPublicOrganization } from "@/features/public/public.functions";
import { branding } from "@/lib/branding";
import { seoMeta } from "@/lib/seo";
import { Card, EmptyState } from "@/components/ui/controls";

export const Route = createFileRoute("/$orgSlug/")({
  // Fetched in the loader, not in the component: this page exists to be shared,
  // and a link preview or a search crawler runs no JavaScript. Anything loaded
  // after hydration is invisible to them.
  loader: ({ params }) => getPublicOrganization({ data: { slug: params.orgSlug } }),
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: branding.productName }] };

    const { organization, competitions } = loaderData;
    const names = competitions
      .slice(0, 3)
      .map((c) => c.name)
      .join(", ");

    return {
      meta: seoMeta({
        title: `${organization.name} — ${branding.productName}`,
        description:
          competitions.length > 0
            ? `Fixtures, results and ladders for ${competitions.length} competition${
                competitions.length === 1 ? "" : "s"
              }: ${names}.`
            : `Fixtures, results and ladders from ${organization.name}.`,
        path: `/${organization.slug}`,
      }),
    };
  },
  component: PublicLeague,
});

/**
 * A league's public front page. No account needed — this is the link that gets
 * shared, so it has to work for someone who has never heard of the product.
 */
function PublicLeague() {
  const { t } = useTranslation();
  const { orgSlug } = Route.useParams();
  const data = Route.useLoaderData();

  if (!data) {
    return (
      <Shell title={t("errors.notFoundTitle")}>
        <p className="text-muted-foreground text-sm">{t("publicSite.notFound")}</p>
      </Shell>
    );
  }

  const { organization, competitions } = data;

  return (
    <Shell title={organization.name}>
      <h2 className="label-caps text-muted-foreground mb-4 text-[0.68rem]">
        {t("publicSite.competitionsTitle")}
      </h2>

      {competitions.length > 0 ? (
        <ul className="space-y-3">
          {competitions.map((competition) => (
            <li key={competition.id}>
              <Link
                to="/$orgSlug/c/$competitionId"
                params={{ orgSlug, competitionId: competition.id }}
                className="block"
              >
                <Card className="bg-card hover:border-primary/40 transition-colors">
                  <p className="font-medium">{competition.name}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {competition.seasonName} · {competition.divisionName} ·{" "}
                    <span className="num">{competition.teamCount}</span>{" "}
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
        <Link to="/" className="label-caps text-muted-foreground text-[0.6rem]">
          {branding.productName}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{title}</h1>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8">{children}</main>
    </div>
  );
}
