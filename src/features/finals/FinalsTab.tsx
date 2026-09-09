import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  generateFinals,
  getFinals,
  clearFinals,
  resolveFinals,
  setMatchWinner,
  type FinalsMatch,
} from "./finals.functions";
import { BRACKET_SIZES, type FinalsStage } from "@/lib/finals/bracket";
import { formatKickoff } from "@/lib/time/zoned";
import { Button, Card, EmptyState, ErrorNote, Field, Select } from "@/components/ui/controls";

const STAGE_ORDER: FinalsStage[] = ["quarter_final", "semi_final", "final", "third_place"];

const STAGE_LABEL: Record<FinalsStage, string> = {
  quarter_final: "finals.stageQuarterFinal",
  semi_final: "finals.stageSemiFinal",
  final: "finals.stageFinal",
  third_place: "finals.stageThirdPlace",
};

export function FinalsTab({
  orgSlug,
  competitionId,
  canEdit,
  timeZone,
}: {
  orgSlug: string;
  competitionId: string;
  canEdit: boolean;
  timeZone: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [size, setSize] = useState("4");
  const [thirdPlace, setThirdPlace] = useState(true);
  const [resolved, setResolved] = useState<number | null>(null);

  const finals = useQuery({
    queryKey: ["finals", competitionId],
    queryFn: () => getFinals({ data: { orgSlug, competitionId } }),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["finals", competitionId] });
    await queryClient.invalidateQueries({ queryKey: ["matches", competitionId] });
  };

  const draw = useMutation({
    mutationFn: () => generateFinals({ data: { orgSlug, competitionId, size, thirdPlace } }),
    onSuccess: async () => {
      await invalidate();
      // A fresh bracket already knows its first round; fill it in immediately
      // rather than making someone press a second button to see any names.
      await advance.mutateAsync();
    },
  });

  const clear = useMutation({
    mutationFn: () => clearFinals({ data: { orgSlug, competitionId } }),
    onSuccess: invalidate,
  });

  const advance = useMutation({
    mutationFn: () => resolveFinals({ data: { orgSlug, competitionId } }),
    onSuccess: async (result) => {
      await invalidate();
      setResolved(result.updated);
    },
  });

  const errorOf = (e: unknown) => (e instanceof Error ? e.message : null);
  const message = errorOf(draw.error) ?? errorOf(advance.error) ?? errorOf(clear.error);
  const actionError = message?.includes("ALREADY_HAS_FINALS")
    ? t("finals.alreadyHas")
    : message?.includes("NOT_ENOUGH_TEAMS")
      ? t("finals.notEnoughTeams")
      : message?.includes("NO_RESULTS")
        ? t("finals.needsResults")
        : message?.includes("HAS_RESULTS")
          ? t("finals.hasResults")
          : message
            ? t("common.saveFailed")
            : null;

  const matches = finals.data?.matches ?? [];
  const hasBracket = matches.length > 0;

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-sm font-semibold">{t("finals.title")}</h3>
        <p className="text-muted-foreground mt-1 text-sm">{t("finals.subtitle")}</p>

        {canEdit && !hasBracket && (
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              draw.mutate();
            }}
          >
            <Field label={t("finals.size")}>
              <Select value={size} onChange={(e) => setSize(e.target.value)} className="w-24">
                {BRACKET_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={thirdPlace}
                onChange={(e) => setThirdPlace(e.target.checked)}
              />
              {t("finals.thirdPlace")}
            </label>
            <Button type="submit" disabled={draw.isPending}>
              {t("finals.generate")}
            </Button>
          </form>
        )}

        {canEdit && hasBracket && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              disabled={advance.isPending}
              onClick={() => advance.mutate()}
            >
              {t("finals.resolve")}
            </Button>
            <Button
              variant="danger"
              disabled={clear.isPending}
              onClick={() => {
                if (confirm(t("finals.clearConfirm"))) clear.mutate();
              }}
            >
              {t("finals.clear")}
            </Button>
            {resolved !== null && (
              <span className="text-muted-foreground text-sm">
                {resolved > 0
                  ? t("finals.resolved", { count: resolved })
                  : t("finals.nothingToResolve")}
              </span>
            )}
          </div>
        )}

        {actionError && (
          <div className="mt-3">
            <ErrorNote>{actionError}</ErrorNote>
          </div>
        )}

        {finals.data?.championTeamName && (
          <p className="mt-4 text-base font-semibold">
            {t("finals.champion", { team: finals.data.championTeamName })}
          </p>
        )}
      </Card>

      {finals.isPending ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : hasBracket ? (
        <div className="space-y-6">
          {STAGE_ORDER.filter((stage) => matches.some((m) => m.stage === stage)).map((stage) => (
            <section key={stage}>
              <h4 className="label-caps text-muted-foreground mb-2 text-[0.68rem]">
                {t(STAGE_LABEL[stage])}
              </h4>
              <div className="space-y-2">
                {matches
                  .filter((m) => m.stage === stage)
                  .sort((a, b) => a.order - b.order)
                  .map((match) => (
                    <BracketCard
                      key={match.id}
                      match={match}
                      orgSlug={orgSlug}
                      timeZone={timeZone}
                      canEdit={canEdit}
                      onChanged={invalidate}
                    />
                  ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState title={t("finals.empty")} body={t("finals.needsResults")} />
      )}
    </div>
  );
}

function BracketCard({
  match,
  orgSlug,
  timeZone,
  canEdit,
  onChanged,
}: {
  match: FinalsMatch;
  orgSlug: string;
  timeZone: string;
  canEdit: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const { t } = useTranslation();

  const setWinner = useMutation({
    mutationFn: (winnerTeamId: string) =>
      setMatchWinner({ data: { orgSlug, matchId: match.id, winnerTeamId } }),
    onSuccess: onChanged,
  });

  const nameFor = (teamName: string | null, sourceKey: string | null, rule: "winner" | "loser") => {
    if (teamName) return teamName;
    if (sourceKey) {
      return rule === "winner"
        ? t("finals.awaiting", { from: sourceKey })
        : t("finals.awaitingLoser", { from: sourceKey });
    }
    return t("finals.tbd");
  };

  const isThirdPlace = match.stage === "third_place";
  const played = match.status === "played" || match.status === "forfeit";
  const level =
    played &&
    match.homeScore !== null &&
    match.awayScore !== null &&
    match.homeScore === match.awayScore;

  return (
    <div className="border-border bg-card rounded-lg border px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">
          {nameFor(match.homeTeamName, match.homeSourceKey, isThirdPlace ? "loser" : "winner")}{" "}
          {played && (
            <>
              <span className="num">{match.homeScore}</span> –{" "}
              <span className="num">{match.awayScore}</span>{" "}
            </>
          )}
          {!played && <span className="text-muted-foreground">v </span>}
          {nameFor(match.awayTeamName, match.awaySourceKey, isThirdPlace ? "loser" : "winner")}
        </span>
        <span className="text-muted-foreground text-xs">
          {formatKickoff(match.kickoffAt, timeZone) || "—"}
        </span>
      </div>

      {match.winnerTeamId && (
        <p className="text-muted-foreground mt-1 text-xs">
          {t("finals.wentThrough")}:{" "}
          {match.winnerTeamId === match.homeTeamId ? match.homeTeamName : match.awayTeamName}
        </p>
      )}

      {level && !match.winnerTeamId && (
        <div className="mt-2">
          <p className="text-destructive text-xs">{t("finals.drawnNeedsWinner")}</p>
          {canEdit && match.homeTeamId && match.awayTeamId && (
            <div className="mt-1 flex gap-2">
              <Button
                variant="secondary"
                className="py-1 text-xs"
                disabled={setWinner.isPending}
                onClick={() => setWinner.mutate(match.homeTeamId!)}
              >
                {match.homeTeamName}
              </Button>
              <Button
                variant="secondary"
                className="py-1 text-xs"
                disabled={setWinner.isPending}
                onClick={() => setWinner.mutate(match.awayTeamId!)}
              >
                {match.awayTeamName}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
