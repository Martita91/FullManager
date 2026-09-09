import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  getCompetition,
  listRegistrations,
  registerTeam,
  unregisterTeam,
} from "@/features/competitions/competitions.functions";
import {
  clearFixture,
  commitFixture,
  listMatches,
  previewFixture,
} from "@/features/competitions/fixture.functions";
import { MatchCard } from "@/features/competitions/MatchCard";
import type { FixturePreview } from "@/features/competitions/types";
import { listTeams } from "@/features/catalog/teams.functions";
import { listPeople } from "@/features/catalog/people.functions";
import { listVenues } from "@/features/catalog/venues.functions";
import { useOrgMembership } from "@/features/organizations/useOrgMembership";
import { computeStandings } from "@/lib/standings/table";
import { findClashes } from "@/lib/scheduling/clashes";
import { CatalogPage } from "@/components/CatalogPage";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Select,
  TableWrap,
  Td,
  Th,
} from "@/components/ui/controls";

export const Route = createFileRoute("/admin/$orgSlug/competitions/$competitionId")({
  component: CompetitionDetail,
});

type Tab = "teams" | "fixture" | "ladder";

function CompetitionDetail() {
  const { t } = useTranslation();
  const { orgSlug, competitionId } = Route.useParams();
  const { canEdit, organization } = useOrgMembership(orgSlug);
  const [tab, setTab] = useState<Tab>("teams");

  const competition = useQuery({
    queryKey: ["competition", competitionId],
    queryFn: () => getCompetition({ data: { orgSlug, id: competitionId } }),
  });

  if (competition.isPending) {
    return <CatalogPage title={t("common.loading")}>{null}</CatalogPage>;
  }

  if (!competition.data) {
    return (
      <CatalogPage title={t("errors.notFoundTitle")} subtitle={t("errors.notFoundBody")}>
        <Link to="/admin/$orgSlug/competitions" params={{ orgSlug }} className="text-sm underline">
          {t("competitions.backToCompetitions")}
        </Link>
      </CatalogPage>
    );
  }

  const timeZone = organization?.timezone ?? "UTC";

  const TABS: { key: Tab; label: string }[] = [
    { key: "teams", label: t("competitions.tabTeams") },
    { key: "fixture", label: t("competitions.tabFixture") },
    { key: "ladder", label: t("competitions.tabLadder") },
  ];

  return (
    <CatalogPage
      title={competition.data.name}
      subtitle={`${competition.data.seasonName} · ${competition.data.divisionName}`}
      action={
        <Link
          to="/admin/$orgSlug/competitions"
          params={{ orgSlug }}
          className="text-muted-foreground text-sm hover:underline"
        >
          {t("competitions.backToCompetitions")}
        </Link>
      }
    >
      <div className="border-border mb-6 flex gap-1 border-b">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === entry.key
                ? "border-foreground text-foreground"
                : "text-muted-foreground border-transparent"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "teams" && (
        <TeamsTab orgSlug={orgSlug} competitionId={competitionId} canEdit={canEdit} />
      )}
      {tab === "fixture" && (
        <FixtureTab
          orgSlug={orgSlug}
          competitionId={competitionId}
          canEdit={canEdit}
          timeZone={timeZone}
        />
      )}
      {tab === "ladder" && (
        <LadderTab
          orgSlug={orgSlug}
          competitionId={competitionId}
          points={{
            win: competition.data.pointsWin,
            draw: competition.data.pointsDraw,
            loss: competition.data.pointsLoss,
          }}
        />
      )}
    </CatalogPage>
  );
}

function TeamsTab({
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

  const registrations = useQuery({
    queryKey: ["registrations", competitionId],
    queryFn: () => listRegistrations({ data: { orgSlug, competitionId } }),
  });
  const teams = useQuery({
    queryKey: ["teams", orgSlug],
    queryFn: () => listTeams({ data: { orgSlug } }),
  });

  const registered = new Set((registrations.data ?? []).map((r) => r.teamId));
  const available = (teams.data ?? []).filter((team) => !registered.has(team.id));

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["registrations", competitionId] });
    await queryClient.invalidateQueries({ queryKey: ["competition", competitionId] });
  };

  const add = useMutation({
    mutationFn: () => registerTeam({ data: { orgSlug, competitionId, teamId } }),
    onSuccess: async () => {
      await invalidate();
      setTeamId("");
    },
  });

  const drop = useMutation({
    mutationFn: (id: string) => unregisterTeam({ data: { orgSlug, competitionId, teamId: id } }),
    onSuccess: invalidate,
  });

  const dropMessage = drop.error instanceof Error ? drop.error.message : null;
  const dropError = dropMessage?.includes("HAS_MATCHES")
    ? t("registrations.hasMatches")
    : dropMessage
      ? t("common.saveFailed")
      : null;

  return (
    <div className="space-y-4">
      {canEdit && (
        <Card>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (teamId) add.mutate();
            }}
          >
            <Select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-64"
              disabled={available.length === 0}
            >
              <option value="">{t("registrations.addTeam")}</option>
              {available.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
            <Button type="submit" disabled={!teamId || add.isPending}>
              {t("common.add")}
            </Button>
            {available.length === 0 && (teams.data?.length ?? 0) > 0 && (
              <span className="text-muted-foreground text-sm">
                {t("registrations.noneAvailable")}
              </span>
            )}
          </form>
          {dropError && (
            <div className="mt-3">
              <ErrorNote>{dropError}</ErrorNote>
            </div>
          )}
        </Card>
      )}

      {registrations.data && registrations.data.length > 0 ? (
        <TableWrap>
          <thead>
            <tr>
              <Th>{t("ladder.team")}</Th>
              {canEdit && <Th className="text-right">{t("common.actions")}</Th>}
            </tr>
          </thead>
          <tbody>
            {registrations.data.map((team) => (
              <tr key={team.teamId}>
                <Td className="font-medium">{team.name}</Td>
                {canEdit && (
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      className="text-destructive"
                      disabled={drop.isPending}
                      onClick={() => drop.mutate(team.teamId)}
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
        <EmptyState title={t("registrations.emptyTitle")} body={t("registrations.emptyBody")} />
      )}
    </div>
  );
}

function FixtureTab({
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
  const [preview, setPreview] = useState<FixturePreview | null>(null);
  const [seed, setSeed] = useState<number | undefined>(undefined);

  const matches = useQuery({
    queryKey: ["matches", competitionId],
    queryFn: () => listMatches({ data: { orgSlug, competitionId } }),
  });
  const registrations = useQuery({
    queryKey: ["registrations", competitionId],
    queryFn: () => listRegistrations({ data: { orgSlug, competitionId } }),
  });
  const venues = useQuery({
    queryKey: ["venues", orgSlug],
    queryFn: () => listVenues({ data: { orgSlug } }),
  });
  const people = useQuery({
    queryKey: ["people", orgSlug],
    queryFn: () => listPeople({ data: { orgSlug } }),
  });

  const teamName = new Map((registrations.data ?? []).map((r) => [r.teamId, r.name]));

  const draw = useMutation({
    mutationFn: (nextSeed: number | undefined) =>
      previewFixture({ data: { orgSlug, competitionId, seed: nextSeed } }),
    onSuccess: (result) => setPreview(result),
  });

  const commit = useMutation({
    mutationFn: () => commitFixture({ data: { orgSlug, competitionId, seed } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["matches", competitionId] });
      await queryClient.invalidateQueries({ queryKey: ["competition", competitionId] });
      setPreview(null);
    },
  });

  const clear = useMutation({
    mutationFn: () => clearFixture({ data: { orgSlug, competitionId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["matches", competitionId] });
      await queryClient.invalidateQueries({ queryKey: ["competition", competitionId] });
    },
  });

  const errorOf = (e: unknown) => (e instanceof Error ? e.message : null);
  const message = errorOf(draw.error) ?? errorOf(commit.error) ?? errorOf(clear.error);
  const actionError = message?.includes("TOO_FEW_TEAMS")
    ? t("fixture.tooFewTeams")
    : message?.includes("ALREADY_FIXTURED")
      ? t("fixture.alreadyFixtured")
      : message?.includes("HAS_RESULTS")
        ? t("fixture.hasResults")
        : message
          ? t("common.saveFailed")
          : null;

  const clashes = findClashes(
    (matches.data ?? []).map((m) => ({
      id: m.id,
      round: m.round,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      kickoffAt: m.kickoffAt,
      pitchId: m.pitchId,
    })),
  );

  const hasFixture = (matches.data?.length ?? 0) > 0;

  const reshuffle = () => {
    const next = Math.floor(Math.random() * 1_000_000);
    setSeed(next);
    draw.mutate(next);
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            {!hasFixture && (
              <>
                <Button onClick={() => draw.mutate(seed)} disabled={draw.isPending}>
                  {t("fixture.generate")}
                </Button>
                {preview && (
                  <>
                    <Button variant="secondary" onClick={reshuffle} disabled={draw.isPending}>
                      {t("fixture.reshuffle")}
                    </Button>
                    <Button onClick={() => commit.mutate()} disabled={commit.isPending}>
                      {t("fixture.commit")}
                    </Button>
                  </>
                )}
              </>
            )}
            {hasFixture && (
              <Button
                variant="danger"
                disabled={clear.isPending}
                onClick={() => {
                  if (confirm(t("fixture.clearConfirm"))) clear.mutate();
                }}
              >
                {t("fixture.clear")}
              </Button>
            )}
          </div>
          {actionError && (
            <div className="mt-3">
              <ErrorNote>{actionError}</ErrorNote>
            </div>
          )}
        </Card>
      )}

      {preview && !hasFixture && (
        <Card>
          <h3 className="text-sm font-semibold">{t("fixture.preview")}</h3>
          <p className="text-muted-foreground mt-1 text-xs">{t("fixture.previewNote")}</p>
          <ol className="mt-3 space-y-1 text-sm">
            {preview.matches.map((m, index) => (
              <li key={`${m.round}-${index}`}>
                {t("fixture.round")} {m.round}: {teamName.get(m.homeTeamId) ?? m.homeTeamId} vs{" "}
                {teamName.get(m.awayTeamId) ?? m.awayTeamId}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {clashes.length > 0 && (
        <Card className="border-destructive/40">
          <h3 className="text-sm font-semibold">{t("fixture.clashesTitle")}</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {clashes.map((clash, index) => (
              <li key={index} className="text-muted-foreground">
                {clash.kind === "pitch"
                  ? t("fixture.clashPitch")
                  : clash.kind === "team"
                    ? t("fixture.clashTeam")
                    : t("fixture.clashRound")}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {matches.isPending ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : hasFixture ? (
        <TableWrap>
          <thead>
            <tr>
              <Th>{t("fixture.round")}</Th>
              <Th>{t("fixture.home")}</Th>
              <Th>{t("fixture.away")}</Th>
              <Th>{t("fixture.kickoff")}</Th>
              <Th>{t("fixture.pitch")}</Th>
              <Th>{t("fixture.score")}</Th>
              <Th className="text-right">{t("common.actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {(matches.data ?? []).map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                orgSlug={orgSlug}
                competitionId={competitionId}
                timeZone={timeZone}
                canEdit={canEdit}
                venues={venues.data ?? []}
                people={people.data ?? []}
              />
            ))}
          </tbody>
        </TableWrap>
      ) : (
        <EmptyState title={t("fixture.emptyTitle")} body={t("fixture.emptyBody")} />
      )}
    </div>
  );
}

function LadderTab({
  orgSlug,
  competitionId,
  points,
}: {
  orgSlug: string;
  competitionId: string;
  points: { win: number; draw: number; loss: number };
}) {
  const { t } = useTranslation();

  const matches = useQuery({
    queryKey: ["matches", competitionId],
    queryFn: () => listMatches({ data: { orgSlug, competitionId } }),
  });
  const registrations = useQuery({
    queryKey: ["registrations", competitionId],
    queryFn: () => listRegistrations({ data: { orgSlug, competitionId } }),
  });

  if (matches.isPending || registrations.isPending) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  const teams = (registrations.data ?? []).map((r) => ({ id: r.teamId, name: r.name }));
  if (teams.length === 0) {
    return <EmptyState title={t("ladder.emptyTitle")} body={t("ladder.emptyBody")} />;
  }

  const table = computeStandings(teams, matches.data ?? [], points);

  return (
    <TableWrap>
      <thead>
        <tr>
          <Th>{t("ladder.position")}</Th>
          <Th>{t("ladder.team")}</Th>
          <Th>{t("ladder.played")}</Th>
          <Th>{t("ladder.won")}</Th>
          <Th>{t("ladder.drawn")}</Th>
          <Th>{t("ladder.lost")}</Th>
          <Th>{t("ladder.goalsFor")}</Th>
          <Th>{t("ladder.goalsAgainst")}</Th>
          <Th>{t("ladder.goalDifference")}</Th>
          <Th>{t("ladder.points")}</Th>
        </tr>
      </thead>
      <tbody>
        {table.map((row) => (
          <tr key={row.teamId}>
            <Td>{row.position}</Td>
            <Td className="font-medium">{row.teamName}</Td>
            <Td>{row.played}</Td>
            <Td>{row.won}</Td>
            <Td>{row.drawn}</Td>
            <Td>{row.lost}</Td>
            <Td>{row.goalsFor}</Td>
            <Td>{row.goalsAgainst}</Td>
            <Td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</Td>
            <Td className="font-medium">{row.points}</Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
