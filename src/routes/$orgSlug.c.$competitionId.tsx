import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { getPublicCompetition } from "@/features/public/public.functions";
import { computeStandings } from "@/lib/standings/table";
import { formatKickoff } from "@/lib/time/zoned";
import { branding } from "@/lib/branding";
import { competitionDescription, seoMeta } from "@/lib/seo";
import { Shell } from "./$orgSlug.index";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/controls";

export const Route = createFileRoute("/$orgSlug/c/$competitionId")({
  loader: ({ params }) => getPublicCompetition({ data: { competitionId: params.competitionId } }),
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [{ title: branding.productName }] };

    // The leader is worth naming: it is the one fact that makes someone open a
    // ladder link, and it costs nothing to compute here.
    const table = computeStandings(loaderData.teams, loaderData.matches, loaderData.points);
    const played = loaderData.matches.filter(
      (m) => m.status === "played" || m.status === "forfeit",
    ).length;

    return {
      meta: seoMeta({
        title: `${loaderData.name} — ${loaderData.organization.name}`,
        description: competitionDescription({
          seasonName: loaderData.seasonName,
          divisionName: loaderData.divisionName,
          teamCount: loaderData.teams.length,
          playedCount: played,
          leaderName: played > 0 ? (table[0]?.teamName ?? null) : null,
        }),
        path: `/${params.orgSlug}/c/${params.competitionId}`,
      }),
    };
  },
  component: PublicCompetitionPage,
});

function PublicCompetitionPage() {
  const { t } = useTranslation();
  const { orgSlug } = Route.useParams();
  const data = Route.useLoaderData();

  if (!data) {
    return (
      <Shell title={t("errors.notFoundTitle")}>
        <p className="text-muted-foreground text-sm">{t("errors.notFoundBody")}</p>
      </Shell>
    );
  }

  const timeZone = data.organization.timezone;
  const table = computeStandings(data.teams, data.matches, data.points);

  const results = data.matches.filter((m) => m.status === "played" || m.status === "forfeit");
  const upcoming = data.matches.filter((m) => m.status === "scheduled");

  return (
    <Shell title={data.name}>
      <p className="text-muted-foreground -mt-4 mb-6 text-sm">
        {data.seasonName} · {data.divisionName} ·{" "}
        <Link to="/$orgSlug" params={{ orgSlug }} className="underline">
          {t("publicSite.backToLeague")}
        </Link>
      </p>

      <section className="mb-10">
        <h2 className="label-caps text-muted-foreground mb-3 text-[0.68rem]">
          {t("publicSite.ladderTitle")}
        </h2>
        <TableWrap>
          <thead>
            <tr>
              <Th>{t("ladder.position")}</Th>
              <Th>{t("ladder.team")}</Th>
              <Th>{t("ladder.played")}</Th>
              <Th>{t("ladder.won")}</Th>
              <Th>{t("ladder.drawn")}</Th>
              <Th>{t("ladder.lost")}</Th>
              <Th>{t("ladder.goalDifference")}</Th>
              <Th>{t("ladder.points")}</Th>
            </tr>
          </thead>
          <tbody>
            {table.map((row) => (
              <tr key={row.teamId}>
                <Td className="num text-muted-foreground">{row.position}</Td>
                <Td className="font-medium">{row.teamName}</Td>
                <Td className="num">{row.played}</Td>
                <Td className="num">{row.won}</Td>
                <Td className="num">{row.drawn}</Td>
                <Td className="num">{row.lost}</Td>
                <Td className="num">
                  {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                </Td>
                <Td className="num text-base">{row.points}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </section>

      <section className="mb-10">
        <h2 className="label-caps text-muted-foreground mb-3 text-[0.68rem]">
          {t("publicSite.upcoming")}
        </h2>
        {upcoming.length > 0 ? (
          <ul className="space-y-2">
            {upcoming.map((match) => (
              <li
                key={match.id}
                className="border-border bg-card flex flex-wrap items-baseline justify-between gap-2 rounded-lg border px-4 py-3 text-sm"
              >
                <span className="font-medium">
                  {match.homeTeamName} v {match.awayTeamName}
                </span>
                <span className="text-muted-foreground">
                  {formatKickoff(match.kickoffAt, timeZone) || "—"}
                  {match.venueName ? ` · ${match.venueName}` : ""}
                  {match.pitchName ? ` · ${match.pitchName}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t("publicSite.noUpcoming")} />
        )}
      </section>

      <section>
        <h2 className="label-caps text-muted-foreground mb-3 text-[0.68rem]">
          {t("publicSite.results")}
        </h2>
        {results.length > 0 ? (
          <ul className="space-y-2">
            {results.map((match) => (
              <li
                key={match.id}
                className="border-border bg-card flex flex-wrap items-baseline justify-between gap-2 rounded-lg border px-4 py-3 text-sm"
              >
                <span className="font-medium">
                  {match.homeTeamName} <span className="num">{match.homeScore}</span> –{" "}
                  <span className="num">{match.awayScore}</span> {match.awayTeamName}
                </span>
                <span className="text-muted-foreground">
                  {t("publicSite.round")} {match.round ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t("publicSite.noResults")} />
        )}
      </section>

      <p className="text-muted-foreground mt-8 text-xs">{t("publicSite.timesIn", { timeZone })}</p>
    </Shell>
  );
}
