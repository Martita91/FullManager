import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSession } from "@/features/auth/useSession";
import {
  claimProfile,
  getMyMatches,
  getMyProfiles,
  getMyStats,
  type PlayerProfile,
} from "@/features/player/player.functions";
import { listMyOrganizations } from "@/features/organizations/organizations.functions";
import { usePwaInstall } from "@/features/pwa/usePwaInstall";
import { formatKickoff } from "@/lib/time/zoned";
import { branding } from "@/lib/branding";
import { Button, Card, EmptyState, ErrorNote, Select } from "@/components/ui/controls";

export const Route = createFileRoute("/me")({
  component: PlayerArea,
});

/**
 * The player's own view: their matches, their numbers, and the place the
 * installed app opens to.
 */
function PlayerArea() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const { canInstall, installed, install } = usePwaInstall();

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/login", replace: true });
  }, [loading, session, navigate]);

  const profiles = useQuery({
    queryKey: ["my-profiles"],
    queryFn: () => getMyProfiles(),
    enabled: Boolean(session),
  });

  if (loading || !session) {
    return <Frame title={t("player.title")}>{t("common.loading")}</Frame>;
  }

  return (
    <Frame title={t("player.title")}>
      {canInstall && !installed && (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">{t("pwa.installHint", { productName: branding.productName })}</p>
          <Button onClick={() => void install()}>{t("pwa.install")}</Button>
        </Card>
      )}

      {profiles.isPending ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : (profiles.data ?? []).length === 0 ? (
        <ClaimPanel />
      ) : (
        <div className="space-y-8">
          {profiles.data!.map((profile) => (
            <ProfileSection key={profile.personId} profile={profile} />
          ))}
        </div>
      )}
    </Frame>
  );
}

/**
 * Nobody has linked this account to a player yet. The league adds players by
 * email, so the only thing we can offer is to try the match again — and to be
 * clear about why it might not work.
 */
function ClaimPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState("");

  // The leagues this account already administers are the ones we can name. A
  // player with no staff role has to be added by their league first.
  const orgs = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });

  const claim = useMutation({
    mutationFn: () => claimProfile({ data: { orgId } }),
    onSuccess: async (result) => {
      if (result.personId) await queryClient.invalidateQueries({ queryKey: ["my-profiles"] });
    },
  });

  const failed = claim.isSuccess && claim.data?.personId === null;

  return (
    <Card>
      <h2 className="text-sm font-semibold">{t("player.notLinkedTitle")}</h2>
      <p className="text-muted-foreground mt-2 text-sm">{t("player.notLinkedBody")}</p>

      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (orgId) claim.mutate();
        }}
      >
        <Select
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          className="w-64"
          disabled={(orgs.data ?? []).length === 0}
        >
          <option value="">{t("player.chooseLeague")}</option>
          {(orgs.data ?? []).map((m) => (
            <option key={m.organization.id} value={m.organization.id}>
              {m.organization.name}
            </option>
          ))}
        </Select>
        <Button type="submit" disabled={!orgId || claim.isPending}>
          {claim.isPending ? t("player.linking") : t("player.linkProfile")}
        </Button>
      </form>

      {(failed || claim.isError) && (
        <div className="mt-3">
          <ErrorNote>{t("player.linkFailed")}</ErrorNote>
        </div>
      )}
    </Card>
  );
}

function ProfileSection({ profile }: { profile: PlayerProfile }) {
  const { t } = useTranslation();
  const teamIds = profile.teams.map((team) => team.id);

  const matches = useQuery({
    queryKey: ["my-matches", profile.personId, teamIds],
    queryFn: () => getMyMatches({ data: { teamIds } }),
  });
  const stats = useQuery({
    queryKey: ["my-stats", profile.personId],
    queryFn: () => getMyStats({ data: { personId: profile.personId } }),
  });

  const upcoming = (matches.data ?? []).filter((m) => m.status === "scheduled");
  const recent = (matches.data ?? []).filter(
    (m) => m.status === "played" || m.status === "forfeit",
  );

  return (
    <section>
      <header className="mb-3">
        <h2 className="font-semibold">
          {t("player.linkedAs", { name: `${profile.firstName} ${profile.lastName}` })}
        </h2>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {profile.orgName}
          {profile.teams.length > 0
            ? ` · ${profile.teams.map((team) => team.name).join(", ")}`
            : ""}
        </p>
        {profile.orgSlug && (
          <Link
            to="/$orgSlug"
            params={{ orgSlug: profile.orgSlug }}
            className="mt-1 inline-block text-sm underline"
          >
            {t("publicSite.competitionsTitle")}
          </Link>
        )}
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("player.appearances")} value={recent.length} />
        <Stat label={t("player.goals")} value={stats.data?.goals ?? 0} />
        <Stat label={t("player.assists")} value={stats.data?.assists ?? 0} />
        <Stat
          label={t("player.cards")}
          value={(stats.data?.yellowCards ?? 0) + (stats.data?.redCards ?? 0)}
        />
      </div>

      <h3 className="mb-2 text-sm font-semibold">{t("player.nextMatches")}</h3>
      {upcoming.length > 0 ? (
        <ul className="mb-5 space-y-2">
          {upcoming.map((match) => (
            <li
              key={match.id}
              className="border-border flex flex-wrap items-baseline justify-between gap-2 rounded-lg border px-4 py-3 text-sm"
            >
              <span className="font-medium">
                {match.homeTeamName} v {match.awayTeamName}
              </span>
              <span className="text-muted-foreground">
                {formatKickoff(match.kickoffAt, profile.timeZone) || "—"}
                {match.venueName ? ` · ${match.venueName}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mb-5">
          <EmptyState title={t("player.noMatches")} />
        </div>
      )}

      {recent.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-semibold">{t("player.recentMatches")}</h3>
          <ul className="space-y-2">
            {recent.map((match) => (
              <li
                key={match.id}
                className="border-border rounded-lg border px-4 py-3 text-sm font-medium"
              >
                {match.homeTeamName} {match.homeScore} – {match.awayScore} {match.awayTeamName}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border rounded-xl border px-4 py-3">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-border border-b px-5 py-3">
        <Link to="/" className="text-muted-foreground text-xs font-medium">
          {branding.productName}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{title}</h1>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8">{children}</main>
    </div>
  );
}
