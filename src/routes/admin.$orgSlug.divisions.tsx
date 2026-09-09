import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  createDivision,
  deleteDivision,
  listDivisions,
  listSports,
  updateDivision,
} from "@/features/catalog/divisions.functions";
import { ENTITY_STATUSES, type EntityStatus } from "@/features/catalog/types";
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

export const Route = createFileRoute("/admin/$orgSlug/divisions")({
  component: DivisionsPage,
});

interface FormState {
  id: string | null;
  sportId: string;
  name: string;
  status: EntityStatus;
}

function DivisionsPage() {
  const { t } = useTranslation();
  const { orgSlug } = Route.useParams();
  const queryClient = useQueryClient();
  const { canEdit } = useOrgMembership(orgSlug);

  const [form, setForm] = useState<FormState | null>(null);

  const sports = useQuery({ queryKey: ["sports"], queryFn: () => listSports() });
  const divisions = useQuery({
    queryKey: ["divisions", orgSlug],
    queryFn: () => listDivisions({ data: { orgSlug } }),
  });

  const save = useMutation({
    mutationFn: (state: FormState) => {
      const payload = {
        orgSlug,
        sportId: state.sportId,
        name: state.name.trim(),
        status: state.status,
      };
      return state.id
        ? updateDivision({ data: { ...payload, id: state.id } })
        : createDivision({ data: payload });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["divisions", orgSlug] });
      setForm(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteDivision({ data: { orgSlug, id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["divisions", orgSlug] }),
  });

  const message = save.error instanceof Error ? save.error.message : null;
  const saveError = message?.includes("NAME_TAKEN")
    ? t("divisions.nameTaken")
    : message
      ? t("common.saveFailed")
      : null;

  const startNew = () => {
    const firstSport = sports.data?.[0];
    if (firstSport) setForm({ id: null, sportId: firstSport.id, name: "", status: "active" });
  };

  return (
    <CatalogPage
      title={t("divisions.title")}
      subtitle={t("divisions.subtitle")}
      action={
        canEdit && !form ? (
          <Button onClick={startNew} disabled={!sports.data?.length}>
            {t("divisions.addTitle")}
          </Button>
        ) : null
      }
    >
      {form && (
        <Card className="mb-6">
          <h2 className="mb-4 text-sm font-semibold">
            {form.id ? t("divisions.editTitle") : t("divisions.addTitle")}
          </h2>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
          >
            <Field label={t("common.name")}>
              <Input
                required
                value={form.name}
                placeholder={t("divisions.namePlaceholder")}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label={t("divisions.sport")}>
              <Select
                value={form.sportId}
                onChange={(e) => setForm({ ...form, sportId: e.target.value })}
              >
                {(sports.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("common.status")}>
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as EntityStatus })}
              >
                {ENTITY_STATUSES.map((s) => (
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

      {divisions.isPending ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : divisions.data && divisions.data.length > 0 ? (
        <TableWrap>
          <thead>
            <tr>
              <Th>{t("common.name")}</Th>
              <Th>{t("divisions.sport")}</Th>
              <Th>{t("common.status")}</Th>
              {canEdit && <Th className="text-right">{t("common.actions")}</Th>}
            </tr>
          </thead>
          <tbody>
            {(divisions.data ?? []).map((division) => (
              <tr key={division.id}>
                <Td className="font-medium">{division.name}</Td>
                <Td>{division.sportName}</Td>
                <Td>{t(`status.${division.status}`)}</Td>
                {canEdit && (
                  <Td className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setForm({
                          id: division.id,
                          sportId: division.sportId,
                          name: division.name,
                          status: division.status,
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
                        if (confirm(t("common.confirmDelete"))) remove.mutate(division.id);
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
        <EmptyState title={t("divisions.emptyTitle")} body={t("divisions.emptyBody")} />
      )}
    </CatalogPage>
  );
}
