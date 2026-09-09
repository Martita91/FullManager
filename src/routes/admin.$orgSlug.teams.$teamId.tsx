import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getTeam, removeTeamMember, upsertTeamMember } from "@/features/catalog/teams.functions";
import { listPeople } from "@/features/catalog/people.functions";
import { TEAM_ROLES, type TeamRole } from "@/features/catalog/types";
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

export const Route = createFileRoute("/admin/$orgSlug/teams/$teamId")({
  component: TeamRosterPage,
});

function TeamRosterPage() {
  const { t } = useTranslation();
  const { orgSlug, teamId } = Route.useParams();
  const queryClient = useQueryClient();
  const { canEdit } = useOrgMembership(orgSlug);

  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState<TeamRole>("player");
  const [shirtNumber, setShirtNumber] = useState("");

  const team = useQuery({
    queryKey: ["team", orgSlug, teamId],
    queryFn: () => getTeam({ data: { orgSlug, teamId } }),
  });

  const people = useQuery({
    queryKey: ["people", orgSlug],
    queryFn: () => listPeople({ data: { orgSlug } }),
  });

  const memberIds = new Set((team.data?.members ?? []).map((m) => m.personId));
  const available = (people.data ?? []).filter((p) => !memberIds.has(p.id));

  const add = useMutation({
    mutationFn: () =>
      upsertTeamMember({
        data: { orgSlug, teamId, personId, role, shirtNumber, status: "active" },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team", orgSlug, teamId] });
      await queryClient.invalidateQueries({ queryKey: ["teams", orgSlug] });
      setPersonId("");
      setShirtNumber("");
      setRole("player");
    },
  });

  const drop = useMutation({
    mutationFn: (id: string) => removeTeamMember({ data: { orgSlug, teamId, personId: id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team", orgSlug, teamId] });
      await queryClient.invalidateQueries({ queryKey: ["teams", orgSlug] });
    },
  });

  const message = add.error instanceof Error ? add.error.message : null;
  const addError = message?.includes("SHIRT_TAKEN")
    ? t("teams.shirtTaken")
    : message
      ? t("common.saveFailed")
      : null;

  if (team.isPending) {
    return (
      <CatalogPage title={t("common.loading")}>
        <span />
      </CatalogPage>
    );
  }

  if (!team.data) {
    return (
      <CatalogPage title={t("errors.notFoundTitle")} subtitle={t("errors.notFoundBody")}>
        <Link to="/admin/$orgSlug/teams" params={{ orgSlug }} className="text-sm underline">
          {t("teams.backToTeams")}
        </Link>
      </CatalogPage>
    );
  }

  const members = team.data.members;

  return (
    <CatalogPage
      title={team.data.team.name}
      subtitle={t("teams.rosterTitle")}
      action={
        <Link
          to="/admin/$orgSlug/teams"
          params={{ orgSlug }}
          className="text-muted-foreground text-sm hover:underline"
        >
          {t("teams.backToTeams")}
        </Link>
      }
    >
      {canEdit && (
        <Card className="mb-6">
          <h2 className="mb-4 text-sm font-semibold">{t("teams.addMember")}</h2>

          {people.isPending ? (
            <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
          ) : (people.data ?? []).length === 0 ? (
            <EmptyState title={t("teams.noPeopleTitle")} body={t("teams.noPeopleBody")} />
          ) : available.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("teams.alreadyOnTeam")}</p>
          ) : (
            <form
              className="grid gap-4 sm:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (personId) add.mutate();
              }}
            >
              <Field label={t("teams.person")} className="sm:col-span-2">
                <Select required value={personId} onChange={(e) => setPersonId(e.target.value)}>
                  <option value="" disabled>
                    {t("teams.person")}
                  </option>
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.lastName}, {p.firstName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("teams.role")}>
                <Select value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
                  {TEAM_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`roles.${r}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("teams.shirt")}>
                <Input
                  type="number"
                  min={0}
                  max={999}
                  value={shirtNumber}
                  onChange={(e) => setShirtNumber(e.target.value)}
                />
              </Field>
              <div className="sm:col-span-4">
                <Button type="submit" disabled={add.isPending || !personId}>
                  {t("common.add")}
                </Button>
              </div>
              {addError && (
                <div className="sm:col-span-4">
                  <ErrorNote>{addError}</ErrorNote>
                </div>
              )}
            </form>
          )}
        </Card>
      )}

      {members.length > 0 ? (
        <TableWrap>
          <thead>
            <tr>
              <Th>{t("common.name")}</Th>
              <Th>{t("teams.role")}</Th>
              <Th>{t("teams.shirt")}</Th>
              <Th>{t("common.status")}</Th>
              {canEdit && <Th className="text-right">{t("common.actions")}</Th>}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.personId}>
                <Td className="font-medium">
                  {member.lastName}, {member.firstName}
                </Td>
                <Td>{t(`roles.${member.role}`)}</Td>
                <Td>{member.shirtNumber ?? "—"}</Td>
                <Td>{t(`status.${member.status}`)}</Td>
                {canEdit && (
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      className="text-destructive"
                      disabled={drop.isPending}
                      onClick={() => {
                        if (confirm(t("common.confirmDelete"))) drop.mutate(member.personId);
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
        <EmptyState title={t("teams.rosterEmptyTitle")} body={t("teams.rosterEmptyBody")} />
      )}
    </CatalogPage>
  );
}
