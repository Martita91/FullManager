import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  applyAllocation,
  createPreference,
  deletePreference,
  listAvailability,
  listPreferences,
  previewAllocation,
  type AllocationPreview,
} from "./scheduling.functions";
import { listRegistrations } from "@/features/competitions/competitions.functions";
import { formatPlainDate } from "@/lib/time/zoned";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Select,
  TableWrap,
  Td,
  Th,
} from "@/components/ui/controls";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const KINDS = ["preferred", "avoid", "unavailable"] as const;

const today = () => new Date().toISOString().slice(0, 10);
const inMonths = (months: number) => {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
};

export function SchedulingTab({
  orgSlug,
  competitionId,
  canEdit,
}: {
  orgSlug: string;
  competitionId: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(() => inMonths(6));
  const [preview, setPreview] = useState<AllocationPreview | null>(null);
  const [applied, setApplied] = useState<{ scheduled: number; skipped: number } | null>(null);

  const availability = useQuery({
    queryKey: ["availability", orgSlug],
    queryFn: () => listAvailability({ data: { orgSlug } }),
  });

  const run = useMutation({
    mutationFn: () => previewAllocation({ data: { orgSlug, competitionId, fromDate, toDate } }),
    onSuccess: (result) => {
      setPreview(result);
      setApplied(null);
    },
  });

  const apply = useMutation({
    mutationFn: () => applyAllocation({ data: { orgSlug, competitionId, fromDate, toDate } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["matches", competitionId] });
      setApplied(result);
      setPreview(null);
    },
  });

  const datesInvalid = toDate < fromDate;
  const hasWindows = (availability.data ?? []).length > 0;

  const errorOf = (e: unknown) => (e instanceof Error ? e.message : null);
  const actionError = errorOf(run.error) ?? errorOf(apply.error);

  return (
    <div className="space-y-6">
      <TeamPreferences orgSlug={orgSlug} competitionId={competitionId} canEdit={canEdit} />

      <Card>
        <h3 className="text-sm font-semibold">{t("scheduling.title")}</h3>
        <p className="text-muted-foreground mt-1 text-sm">{t("scheduling.subtitle")}</p>
        <p className="text-muted-foreground mt-1 text-xs">{t("scheduling.onlyUnscheduled")}</p>

        {!hasWindows && !availability.isPending && (
          <div className="mt-3">
            <ErrorNote>{t("scheduling.noWindows")}</ErrorNote>
          </div>
        )}

        {canEdit && (
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!datesInvalid) run.mutate();
            }}
          >
            <Field label={t("scheduling.fromDate")}>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-44"
              />
            </Field>
            <Field label={t("scheduling.toDate")}>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-44"
              />
            </Field>
            <Button type="submit" disabled={run.isPending || datesInvalid || !hasWindows}>
              {t("scheduling.preview")}
            </Button>
            {preview && preview.assignments.length > 0 && (
              <Button variant="secondary" disabled={apply.isPending} onClick={() => apply.mutate()}>
                {t("scheduling.apply")}
              </Button>
            )}
          </form>
        )}

        {datesInvalid && (
          <div className="mt-3">
            <ErrorNote>{t("scheduling.datesInvalid")}</ErrorNote>
          </div>
        )}
        {actionError && (
          <div className="mt-3">
            <ErrorNote>{t("common.saveFailed")}</ErrorNote>
          </div>
        )}

        {applied && (
          <p className="mt-3 text-sm text-emerald-700">
            {applied.skipped > 0
              ? t("scheduling.appliedWithSkips", {
                  count: applied.scheduled,
                  skipped: applied.skipped,
                })
              : t("scheduling.applied", { count: applied.scheduled })}
          </p>
        )}
      </Card>

      {preview && (
        <div className="space-y-4">
          {preview.assignments.length > 0 ? (
            <>
              <p className="text-muted-foreground text-xs">{t("scheduling.previewNote")}</p>
              <TableWrap>
                <thead>
                  <tr>
                    <Th>{t("fixture.round")}</Th>
                    <Th>{t("ladder.team")}</Th>
                    <Th>{t("fixture.kickoff")}</Th>
                    <Th>{t("fixture.pitch")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.assignments.map((row) => (
                    <tr key={row.matchId}>
                      <Td className="num">{row.round ?? "—"}</Td>
                      <Td className="font-medium">
                        {row.homeTeamName} v {row.awayTeamName}
                      </Td>
                      <Td className="whitespace-nowrap">
                        <span className="num">{formatPlainDate(row.date)}</span>
                        {" · "}
                        <span className="num font-medium">{row.time}</span>
                      </Td>
                      <Td>
                        {row.venueName} · {row.pitchName}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </>
          ) : (
            <EmptyState title={t("scheduling.nothingToSchedule")} />
          )}

          {preview.unassigned.length > 0 && (
            <Card className="border-destructive/40">
              <h4 className="text-sm font-semibold">{t("scheduling.couldNotPlace")}</h4>
              <ul className="mt-2 space-y-1 text-sm">
                {preview.unassigned.map((row) => (
                  <li key={row.matchId} className="text-muted-foreground">
                    <span className="text-foreground font-medium">{row.label}</span> —{" "}
                    {row.reason === "teams_unavailable"
                      ? t("scheduling.reasonUnavailable")
                      : t("scheduling.reasonNoSlots")}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function TeamPreferences({
  orgSlug,
  competitionId,
  canEdit,
}: {
  orgSlug: string;
  competitionId: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [teamId, setTeamId] = useState("");
  const [weekday, setWeekday] = useState("6");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("unavailable");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const preferences = useQuery({
    queryKey: ["preferences", competitionId],
    queryFn: () => listPreferences({ data: { orgSlug, competitionId } }),
  });
  const teams = useQuery({
    queryKey: ["registrations", competitionId],
    queryFn: () => listRegistrations({ data: { orgSlug, competitionId } }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["preferences", competitionId] });

  const add = useMutation({
    mutationFn: () =>
      createPreference({
        data: { orgSlug, competitionId, teamId, weekday, startsAt, endsAt, kind },
      }),
    onSuccess: async () => {
      await invalidate();
      setStartsAt("");
      setEndsAt("");
    },
  });

  const drop = useMutation({
    mutationFn: (id: string) => deletePreference({ data: { orgSlug, id } }),
    onSuccess: invalidate,
  });

  const message = add.error instanceof Error ? add.error.message : null;
  const addError = message?.includes("END_BEFORE_START")
    ? t("availability.endBeforeStart")
    : message
      ? t("common.saveFailed")
      : null;

  return (
    <Card>
      <h3 className="text-sm font-semibold">{t("scheduling.preferencesTitle")}</h3>
      <p className="text-muted-foreground mt-1 text-sm">{t("scheduling.preferencesHelp")}</p>

      {(preferences.data ?? []).length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm">
          {preferences.data!.map((preference) => (
            <li key={preference.id} className="flex items-center justify-between gap-3">
              <span>
                <span className="font-medium">{preference.teamName}</span> ·{" "}
                {t(`weekdays.${preference.weekday}`)} ·{" "}
                {preference.startsAt && preference.endsAt
                  ? `${preference.startsAt}–${preference.endsAt}`
                  : t("scheduling.allDay")}{" "}
                ·{" "}
                {t(
                  `scheduling.kind${preference.kind[0]!.toUpperCase()}${preference.kind.slice(1)}`,
                )}
              </span>
              {canEdit && (
                <Button
                  variant="ghost"
                  className="text-destructive"
                  disabled={drop.isPending}
                  onClick={() => drop.mutate(preference.id)}
                >
                  {t("common.remove")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-3 text-sm">{t("scheduling.noPreferences")}</p>
      )}

      {canEdit && (teams.data ?? []).length > 0 && (
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (teamId) add.mutate();
          }}
        >
          <Select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="w-44"
            aria-label={t("ladder.team")}
          >
            <option value="">{t("ladder.team")}</option>
            {(teams.data ?? []).map((team) => (
              <option key={team.teamId} value={team.teamId}>
                {team.name}
              </option>
            ))}
          </Select>
          <Select
            value={weekday}
            onChange={(e) => setWeekday(e.target.value)}
            className="w-36"
            aria-label={t("availability.weekday")}
          >
            {WEEKDAYS.map((day) => (
              <option key={day} value={day}>
                {t(`weekdays.${day}`)}
              </option>
            ))}
          </Select>
          <Input
            type="time"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="w-32"
            aria-label={t("availability.from")}
          />
          <Input
            type="time"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="w-32"
            aria-label={t("availability.to")}
          />
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
            className="w-36"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`scheduling.kind${k[0]!.toUpperCase()}${k.slice(1)}`)}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" disabled={!teamId || add.isPending}>
            {t("scheduling.addPreference")}
          </Button>
          {addError && (
            <div className="w-full">
              <ErrorNote>{addError}</ErrorNote>
            </div>
          )}
        </form>
      )}
    </Card>
  );
}
