import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  createSeason,
  deleteSeason,
  listSeasons,
  updateSeason,
} from "@/features/catalog/seasons.functions";
import type { Season, SeasonStatus } from "@/features/catalog/types";
import { SEASON_STATUSES } from "@/features/catalog/types";
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

export const Route = createFileRoute("/admin/$orgSlug/seasons")({
  component: SeasonsPage,
});

interface FormState {
  id: string | null;
  name: string;
  startsOn: string;
  endsOn: string;
  status: SeasonStatus;
}

const blankForm: FormState = { id: null, name: "", startsOn: "", endsOn: "", status: "draft" };

function SeasonsPage() {
  const { t } = useTranslation();
  const { orgSlug } = Route.useParams();
  const queryClient = useQueryClient();
  const { canEdit } = useOrgMembership(orgSlug);

  const [form, setForm] = useState<FormState | null>(null);

  const seasons = useQuery({
    queryKey: ["seasons", orgSlug],
    queryFn: () => listSeasons({ data: { orgSlug } }),
  });

  const save = useMutation({
    mutationFn: (state: FormState) => {
      const payload = {
        orgSlug,
        name: state.name.trim(),
        startsOn: state.startsOn,
        endsOn: state.endsOn,
        status: state.status,
      };
      return state.id
        ? updateSeason({ data: { ...payload, id: state.id } })
        : createSeason({ data: payload });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["seasons", orgSlug] });
      setForm(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSeason({ data: { orgSlug, id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["seasons", orgSlug] }),
  });

  const message = save.error instanceof Error ? save.error.message : null;
  const saveError = message?.includes("NAME_TAKEN")
    ? t("seasons.nameTaken")
    : message?.includes("END_BEFORE_START")
      ? t("seasons.endBeforeStart")
      : message
        ? t("common.saveFailed")
        : null;

  return (
    <CatalogPage
      title={t("seasons.title")}
      subtitle={t("seasons.subtitle")}
      action={
        canEdit && !form ? (
          <Button onClick={() => setForm({ ...blankForm })}>{t("seasons.addTitle")}</Button>
        ) : null
      }
    >
      {form && (
        <Card className="mb-6">
          <h2 className="mb-4 text-sm font-semibold">
            {form.id ? t("seasons.editTitle") : t("seasons.addTitle")}
          </h2>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
          >
            <Field label={t("common.name")} className="sm:col-span-2">
              <Input
                required
                value={form.name}
                placeholder={t("seasons.namePlaceholder")}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label={t("seasons.startsOn")}>
              <Input
                type="date"
                value={form.startsOn}
                onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
              />
            </Field>
            <Field label={t("seasons.endsOn")}>
              <Input
                type="date"
                value={form.endsOn}
                onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
              />
            </Field>
            <Field label={t("common.status")}>
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as SeasonStatus })}
              >
                {SEASON_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button type="submit" disabled={save.isPending}>
                {t("common.save")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                {t("common.cancel")}
              </Button>
            </div>
            {saveError && (
              <div className="sm:col-span-2">
                <ErrorNote>{saveError}</ErrorNote>
              </div>
            )}
          </form>
        </Card>
      )}

      {seasons.isPending ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : seasons.data && seasons.data.length > 0 ? (
        <TableWrap>
          <thead>
            <tr>
              <Th>{t("common.name")}</Th>
              <Th>{t("seasons.startsOn")}</Th>
              <Th>{t("seasons.endsOn")}</Th>
              <Th>{t("common.status")}</Th>
              {canEdit && <Th className="text-right">{t("common.actions")}</Th>}
            </tr>
          </thead>
          <tbody>
            {seasons.data.map((season: Season) => (
              <tr key={season.id}>
                <Td className="font-medium">{season.name}</Td>
                <Td>{season.startsOn ?? "—"}</Td>
                <Td>{season.endsOn ?? "—"}</Td>
                <Td>{t(`status.${season.status}`)}</Td>
                {canEdit && (
                  <Td className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setForm({
                          id: season.id,
                          name: season.name,
                          startsOn: season.startsOn ?? "",
                          endsOn: season.endsOn ?? "",
                          status: season.status,
                        })
                      }
                    >
                      {t("common.edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-destructive"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (confirm(t("common.confirmDelete"))) remove.mutate(season.id);
                      }}
                    >
                      {t("common.remove")}
                    </Button>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : (
        <EmptyState title={t("seasons.emptyTitle")} body={t("seasons.emptyBody")} />
      )}
    </CatalogPage>
  );
}
