import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { createTeam, deleteTeam, listTeams, updateTeam } from "@/features/catalog/teams.functions";
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

export const Route = createFileRoute("/admin/$orgSlug/teams/")({
  component: TeamsPage,
});

interface FormState {
  id: string | null;
  name: string;
  shortName: string;
  status: EntityStatus;
}

const blankForm: FormState = { id: null, name: "", shortName: "", status: "active" };

function TeamsPage() {
  const { t } = useTranslation();
  const { orgSlug } = Route.useParams();
  const queryClient = useQueryClient();
  const { canEdit } = useOrgMembership(orgSlug);

  const [form, setForm] = useState<FormState | null>(null);

  const teams = useQuery({
    queryKey: ["teams", orgSlug],
    queryFn: () => listTeams({ data: { orgSlug } }),
  });

  const save = useMutation({
    mutationFn: (state: FormState) => {
      const payload = {
        orgSlug,
        name: state.name.trim(),
        shortName: state.shortName,
        status: state.status,
      };
      return state.id
        ? updateTeam({ data: { ...payload, id: state.id } })
        : createTeam({ data: payload });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["teams", orgSlug] });
      setForm(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteTeam({ data: { orgSlug, id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams", orgSlug] }),
  });

  const message = save.error instanceof Error ? save.error.message : null;
  const saveError = message?.includes("NAME_TAKEN")
    ? t("teams.nameTaken")
    : message
      ? t("common.saveFailed")
      : null;

  return (
    <CatalogPage
      title={t("teams.title")}
      subtitle={t("teams.subtitle")}
      action={
        canEdit && !form ? (
          <Button onClick={() => setForm({ ...blankForm })}>{t("teams.addTitle")}</Button>
        ) : null
      }
    >
      {form && (
        <Card className="mb-6">
          <h2 className="mb-4 text-sm font-semibold">
            {form.id ? t("teams.editTitle") : t("teams.addTitle")}
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
                placeholder={t("teams.namePlaceholder")}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label={t("teams.shortName")} hint={t("teams.shortNameHelp")}>
              <Input
                maxLength={12}
                value={form.shortName}
                onChange={(e) => setForm({ ...form, shortName: e.target.value })}
              />
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

      {teams.isPending ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : teams.data && teams.data.length > 0 ? (
        <TableWrap>
          <thead>
            <tr>
              <Th>{t("common.name")}</Th>
              <Th>{t("teams.shortName")}</Th>
              <Th>{t("teams.players")}</Th>
              <Th>{t("common.status")}</Th>
              <Th className="text-right">{t("common.actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {teams.data.map((team) => (
              <tr key={team.id}>
                <Td className="font-medium">{team.name}</Td>
                <Td>{team.shortName ?? "—"}</Td>
                <Td>{team.playerCount}</Td>
                <Td>{t(`status.${team.status}`)}</Td>
                <Td className="text-right whitespace-nowrap">
                  <Link
                    to="/admin/$orgSlug/teams/$teamId"
                    params={{ orgSlug, teamId: team.id }}
                    className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium hover:underline"
                  >
                    {t("teams.manageRoster")}
                  </Link>
                  {canEdit && (
                    <>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setForm({
                            id: team.id,
                            name: team.name,
                            shortName: team.shortName ?? "",
                            status: team.status,
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
                          if (confirm(t("common.confirmDelete"))) remove.mutate(team.id);
                        }}
                      >
                        {t("common.remove")}
                      </Button>
                    </>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : (
        <EmptyState title={t("teams.emptyTitle")} body={t("teams.emptyBody")} />
      )}
    </CatalogPage>
  );
}
