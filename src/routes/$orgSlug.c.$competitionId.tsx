import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getPublicCompetition } from "@/features/public/public.functions";
import { computeStandings } from "@/lib/standings/table";
import { formatKickoff } from "@/lib/time/zoned";
import { Shell } from "./$orgSlug.index";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/controls";

export const Route = createFileRoute("/$orgSlug/c/$competitionId")({
  component: PublicCompetitionPage,
});

function PublicCompetitionPage() {
  const { t } = useTranslation();
  const { orgSlug, competitionId } = Route.useParams();

  const competition = useQuery({
    queryKey: ["public-competition", competitionId],
    queryFn: () => getPublicCompetition({ data: { competitionId } }),
  });

  if (competition.isPending) return <Shell title={t("common.loading")}>{null}</Shell>;

  if (!competition.data) {
    return (
      <Shell title={t("errors.notFoundTitle")}>
        <p className="text-muted-foreground text-sm">{t("errors.notFoundBody")}</p>
      </Shell>
    );
  }

  const data = competition.data;
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
        <h2 className="mb-3 text-sm font-semibold">{t("publicSite.ladderTitle")}</h2>
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
        <h2 className="mb-3 text-sm font-semibold">{t("publicSite.upcoming")}</h2>
        {upcoming.length > 0 ? (
          <ul className="space-y-2">
            {upcoming.map((match) => (
              <li
                key={match.id}
                className="border-border flex flex-wrap items-baseline justify-between gap-2 rounded-lg border px-4 py-3 text-sm"
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
        <h2 className="mb-3 text-sm font-semibold">{t("publicSite.results")}</h2>
        {results.length > 0 ? (
          <ul className="space-y-2">
            {results.map((match) => (
              <li
                key={match.id}
                className="border-border flex flex-wrap items-baseline justify-between gap-2 rounded-lg border px-4 py-3 text-sm"
              >
                <span className="font-medium">
                  {match.homeTeamName} {match.homeScore} – {match.awayScore} {match.awayTeamName}
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
