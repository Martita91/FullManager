import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  createPerson,
  deletePerson,
  listPeople,
  updatePerson,
} from "@/features/catalog/people.functions";
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

export const Route = createFileRoute("/admin/$orgSlug/people")({
  component: PeoplePage,
});

interface FormState {
  id: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  status: EntityStatus;
}

const blankForm: FormState = {
  id: null,
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  status: "active",
};

function PeoplePage() {
  const { t } = useTranslation();
  const { orgSlug } = Route.useParams();
  const queryClient = useQueryClient();
  const { canEdit } = useOrgMembership(orgSlug);

  const [form, setForm] = useState<FormState | null>(null);

  const people = useQuery({
    queryKey: ["people", orgSlug],
    queryFn: () => listPeople({ data: { orgSlug } }),
  });

  const save = useMutation({
    mutationFn: (state: FormState) => {
      const payload = {
        orgSlug,
        firstName: state.firstName.trim(),
        lastName: state.lastName.trim(),
        email: state.email,
        phone: state.phone,
        dateOfBirth: state.dateOfBirth,
        status: state.status,
      };
      return state.id
        ? updatePerson({ data: { ...payload, id: state.id } })
        : createPerson({ data: payload });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["people", orgSlug] });
      setForm(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deletePerson({ data: { orgSlug, id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["people", orgSlug] }),
  });

  const message = save.error instanceof Error ? save.error.message : null;
  const saveError = message?.includes("EMAIL_TAKEN")
    ? t("people.emailTaken")
    : message
      ? t("common.saveFailed")
      : null;

  return (
    <CatalogPage
      title={t("people.title")}
      subtitle={t("people.subtitle")}
      action={
        canEdit && !form ? (
          <Button onClick={() => setForm({ ...blankForm })}>{t("people.addTitle")}</Button>
        ) : null
      }
    >
      {form && (
        <Card className="mb-6">
          <h2 className="mb-4 text-sm font-semibold">
            {form.id ? t("people.editTitle") : t("people.addTitle")}
          </h2>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
          >
            <Field label={t("people.firstName")}>
              <Input
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </Field>
            <Field label={t("people.lastName")}>
              <Input
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </Field>
            <Field label={t("people.email")}>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label={t("people.phone")}>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label={t("people.dateOfBirth")}>
              <Input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
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

      <p className="text-muted-foreground mb-4 text-xs">{t("people.privacyNote")}</p>

      {people.isPending ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : people.data && people.data.length > 0 ? (
        <TableWrap>
          <thead>
            <tr>
              <Th>{t("common.name")}</Th>
              <Th>{t("people.email")}</Th>
              <Th>{t("people.phone")}</Th>
              <Th>{t("people.claimed")}</Th>
              <Th>{t("common.status")}</Th>
              {canEdit && <Th className="text-right">{t("common.actions")}</Th>}
            </tr>
          </thead>
          <tbody>
            {people.data.map((person) => (
              <tr key={person.id}>
                <Td className="font-medium">
                  {person.lastName}, {person.firstName}
                </Td>
                <Td>{person.email ?? "—"}</Td>
                <Td>{person.phone ?? "—"}</Td>
                <Td>{person.claimed ? t("people.claimedYes") : t("people.claimedNo")}</Td>
                <Td>{t(`status.${person.status}`)}</Td>
                {canEdit && (
                  <Td className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setForm({
                          id: person.id,
                          firstName: person.firstName,
                          lastName: person.lastName,
                          email: person.email ?? "",
                          phone: person.phone ?? "",
                          dateOfBirth: person.dateOfBirth ?? "",
                          status: person.status,
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
                        if (confirm(t("common.confirmDelete"))) remove.mutate(person.id);
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
        <EmptyState title={t("people.emptyTitle")} body={t("people.emptyBody")} />
      )}
    </CatalogPage>
  );
}
