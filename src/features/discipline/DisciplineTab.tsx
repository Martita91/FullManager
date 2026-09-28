import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getDiscipline } from "./discipline.functions";
import { LIVE_STALE_TIME } from "@/lib/query/staleness";
import { Card, EmptyState, TableWrap, Td, Th } from "@/components/ui/controls";

export function DisciplineTab({
  orgSlug,
  competitionId,
}: {
  orgSlug: string;
  competitionId: string;
}) {
  const { t } = useTranslation();

  // Cards are added from the match card, which invalidates the match list and
  // has no idea this table exists. Computed from those rows, so: always fresh.
  const discipline = useQuery({
    queryKey: ["discipline", competitionId],
    queryFn: () => getDiscipline({ data: { orgSlug, competitionId } }),
    staleTime: LIVE_STALE_TIME,
  });

  if (discipline.isPending) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  const data = discipline.data;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-sm font-semibold">{t("discipline.title")}</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          {data.threshold > 0
            ? t("discipline.thresholdOn", { count: data.threshold })
            : t("discipline.thresholdOff")}
        </p>
      </Card>

      <section>
        <h4 className="label-caps text-muted-foreground mb-2 text-[0.68rem]">
          {t("discipline.suspensionsTitle")}
        </h4>
        {data.suspensions.length > 0 ? (
          <div className="space-y-2">
            {data.suspensions.map((suspension, index) => (
              <div
                key={`${suspension.personId}-${suspension.triggeredInRound}-${index}`}
                className="border-destructive/40 bg-card flex flex-wrap items-baseline justify-between gap-2 rounded-lg border px-4 py-3 text-sm"
              >
                <span>
                  <span className="font-medium">{suspension.personName}</span>
                  <span className="text-muted-foreground"> · {suspension.teamName}</span>
                </span>
                <span className="text-muted-foreground text-xs">
                  {suspension.reason === "red_card"
                    ? t("discipline.reasonRed")
                    : t("discipline.reasonYellows", { count: suspension.yellowCount ?? 0 })}
                  {" · "}
                  {t("discipline.servesRound", { round: suspension.servesRound })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title={t("discipline.noSuspensions")} />
        )}
      </section>

      <section>
        <h4 className="label-caps text-muted-foreground mb-2 text-[0.68rem]">
          {t("discipline.title")}
        </h4>
        {data.cards.length > 0 ? (
          <TableWrap>
            <thead>
              <tr>
                <Th>{t("discipline.player")}</Th>
                <Th>{t("discipline.team")}</Th>
                <Th>{t("discipline.yellows")}</Th>
                <Th>{t("discipline.reds")}</Th>
                <Th>{t("discipline.toNextBan")}</Th>
              </tr>
            </thead>
            <tbody>
              {data.cards.map((row) => (
                <tr key={row.personId}>
                  <Td className="font-medium">{row.personName}</Td>
                  <Td>{row.teamName}</Td>
                  <Td className="num">{row.yellows}</Td>
                  <Td className="num">{row.reds}</Td>
                  <Td className="num text-muted-foreground">{row.yellowsToNextBan ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState title={t("discipline.noCards")} />
        )}
      </section>
    </div>
  );
}
