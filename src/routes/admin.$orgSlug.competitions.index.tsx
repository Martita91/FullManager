import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  createCompetition,
  deleteCompetition,
  listCompetitions,
  updateCompetition,
} from "@/features/competitions/competitions.functions";
import { COMPETITION_FORMATS, type CompetitionFormat } from "@/features/competitions/types";
import { listSeasons } from "@/features/catalog/seasons.functions";
import { listDivisions } from "@/features/catalog/divisions.functions";
import { useOrgMembership } from "@/features/organizations/useOrgMembership";
import { CatalogPage } from "@/components/CatalogPage";
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

export const Route = createFileRoute("/admin/$orgSlug/competitions/")({
  component: CompetitionsPage,
});

interface FormState {
  id: string | null;
  seasonId: string;
  divisionId: string;
  name: string;
  format: CompetitionFormat;
  rounds: string;
  pointsWin: string;
  pointsDraw: string;
  pointsLoss: string;
}

const FORMAT_LABEL: Record<CompetitionFormat, string> = {
  league: "competitions.formatLeague",
  cup: "competitions.formatCup",
  league_finals: "competitions.formatLeagueFinals",
};

const STATUS_LABEL = {
  draft: "competitions.statusDraft",
  fixtured: "competitions.statusFixtured",
  in_progress: "competitions.statusInProgress",
  complete: "competitions.statusComplete",
} as const;

function CompetitionsPage() {
  const { t } = useTranslation();
  const { orgSlug } = Route.useParams();
  const queryClient = useQueryClient();
  const { canEdit } = useOrgMembership(orgSlug);

  const [form, setForm] = useState<FormState | null>(null);

  const competitions = useQuery({
    queryKey: ["competitions", orgSlug],
    queryFn: () => listCompetitions({ data: { orgSlug } }),
  });
  const seasons = useQuery({
    queryKey: ["seasons", orgSlug],
    queryFn: () => listSeasons({ data: { orgSlug } }),
  });
  const divisions = useQuery({
    queryKey: ["divisions", orgSlug],
    queryFn: () => listDivisions({ data: { orgSlug } }),
  });

  const canCreate = (seasons.data?.length ?? 0) > 0 && (divisions.data?.length ?? 0) > 0;

  const save = useMutation({
    mutationFn: (state: FormState) => {
      const payload = {
        orgSlug,
        seasonId: state.seasonId,
        divisionId: state.divisionId,
        name: state.name.trim(),
        format: state.format,
        rounds: state.rounds,
        pointsWin: state.pointsWin,
        pointsDraw: state.pointsDraw,
        pointsLoss: state.pointsLoss,
      };
      return state.id
        ? updateCompetition({ data: { ...payload, id: state.id } })
        : createCompetition({ data: payload });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["competitions", orgSlug] });
      setForm(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCompetition({ data: { orgSlug, id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["competitions", orgSlug] }),
  });

  const message = save.error instanceof Error ? save.error.message : null;
  const saveError = message?.includes("NAME_TAKEN")
    ? t("competitions.nameTaken")
    : message
      ? t("common.saveFailed")
      : null;

  const startNew = () => {
    const season = seasons.data?.[0];
    const division = divisions.data?.[0];
    if (!season || !division) return;
    setForm({
      id: null,
      seasonId: season.id,
      divisionId: division.id,
      name: "",
      format: "league",
      rounds: "1",
      pointsWin: "3",
      pointsDraw: "1",
      pointsLoss: "0",
    });
  };

  return (
    <CatalogPage
      title={t("competitions.title")}
      subtitle={t("competitions.subtitle")}
      action={
        canEdit && !form ? (
          <Button onClick={startNew} disabled={!canCreate}>
            {t("competitions.addTitle")}
          </Button>
        ) : null
      }
    >
      {canEdit && !canCreate && !competitions.isPending && (
        <p className="text-muted-foreground mb-4 text-sm">{t("competitions.needsPrerequisites")}</p>
      )}

      {form && (
        <Card className="mb-6">
          <h2 className="mb-4 text-sm font-semibold">
            {form.id ? t("competitions.editTitle") : t("competitions.addTitle")}
          </h2>
          <form
            className="grid gap-4 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
          >
            <Field label={t("common.name")} className="sm:col-span-3">
              <Input
                required
                value={form.name}
                placeholder={t("competitions.namePlaceholder")}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label={t("competitions.season")}>
              <Select
                value={form.seasonId}
                onChange={(e) => setForm({ ...form, seasonId: e.target.value })}
              >
                {(seasons.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("competitions.division")}>
              <Select
                value={form.divisionId}
                onChange={(e) => setForm({ ...form, divisionId: e.target.value })}
              >
                {(divisions.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("competitions.format")}>
              <Select
                value={form.format}
                onChange={(e) => setForm({ ...form, format: e.target.value as CompetitionFormat })}
              >
                {COMPETITION_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {t(FORMAT_LABEL[f])}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("competitions.legs")} hint={t("competitions.legsHelp")}>
              <Input
                type="number"
                min={1}
                max={4}
                value={form.rounds}
                onChange={(e) => setForm({ ...form, rounds: e.target.value })}
              />
            </Field>
            <Field label={t("competitions.pointsWin")}>
              <Input
                type="number"
                min={0}
                max={10}
                value={form.pointsWin}
                onChange={(e) => setForm({ ...form, pointsWin: e.target.value })}
              />
            </Field>
            <Field label={t("competitions.pointsDraw")}>
              <Input
                type="number"
                min={0}
                max={10}
                value={form.pointsDraw}
                onChange={(e) => setForm({ ...form, pointsDraw: e.target.value })}
              />
            </Field>
            <div className="flex items-end gap-2 sm:col-span-3">
              <Button type="submit" disabled={save.isPending}>
                {t("common.save")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                {t("common.cancel")}
              </Button>
            </div>
            {saveError && (
              <div className="sm:col-span-3">
                <ErrorNote>{saveError}</ErrorNote>
              </div>
            )}
          </form>
        </Card>
      )}

      {competitions.isPending ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : competitions.data && competitions.data.length > 0 ? (
        <TableWrap>
          <thead>
            <tr>
              <Th>{t("common.name")}</Th>
              <Th>{t("competitions.season")}</Th>
              <Th>{t("competitions.division")}</Th>
              <Th>{t("competitions.teams")}</Th>
              <Th>{t("competitions.matches")}</Th>
              <Th>{t("common.status")}</Th>
              <Th className="text-right">{t("common.actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {competitions.data.map((competition) => (
              <tr key={competition.id}>
                <Td className="font-medium">{competition.name}</Td>
                <Td>{competition.seasonName}</Td>
                <Td>{competition.divisionName}</Td>
                <Td>{competition.teamCount}</Td>
                <Td>{competition.matchCount}</Td>
                <Td>
                  {t(STATUS_LABEL[competition.status])}
                  {competition.isPublished ? ` · ${t("competitions.published")}` : ""}
                </Td>
                <Td className="text-right whitespace-nowrap">
                  <Link
                    to="/admin/$orgSlug/competitions/$competitionId"
                    params={{ orgSlug, competitionId: competition.id }}
                    className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium hover:underline"
                  >
                    {t("competitions.open")}
                  </Link>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      className="text-destructive"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (confirm(t("common.confirmDelete"))) remove.mutate(competition.id);
                      }}
                    >
                      {t("common.remove")}
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : (
        <EmptyState title={t("competitions.emptyTitle")} body={t("competitions.emptyBody")} />
      )}
    </CatalogPage>
  );
}
