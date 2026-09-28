import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useOrgMembership } from "@/features/organizations/useOrgMembership";

export const Route = createFileRoute("/admin/$orgSlug")({
  component: OrganizationLayout,
});

// Overview matches exactly, or it would stay highlighted on every child route.
const SECTIONS = [
  { to: "/admin/$orgSlug", label: "nav.overview", exact: true },
  { to: "/admin/$orgSlug/competitions", label: "nav.competitions", exact: false },
  { to: "/admin/$orgSlug/seasons", label: "nav.seasons", exact: false },
  { to: "/admin/$orgSlug/divisions", label: "nav.divisions", exact: false },
  { to: "/admin/$orgSlug/teams", label: "nav.teams", exact: false },
  { to: "/admin/$orgSlug/people", label: "nav.people", exact: false },
  { to: "/admin/$orgSlug/venues", label: "nav.venues", exact: false },
] as const;

/**
 * Membership gate plus section nav. RLS already refuses to return an
 * organization the user isn't a member of, so this screen is about saying so
 * clearly rather than about enforcement — the database is what enforces.
 *
 * It renders its children while that check is still in flight, and this is the
 * point: blocking on `isPending` put the whole app in single file. The child
 * screen was not mounted, so its own query had not been sent, so the league's
 * data only started loading once the membership answer came back — two round
 * trips to Perth and back where one would do. Every member passes this check,
 * so waiting for it was paying the cost of the rare case on every visit.
 */
function OrganizationLayout() {
  const { t } = useTranslation();
  const { orgSlug } = Route.useParams();
  const membership = useOrgMembership(orgSlug);

  // Only once the answer is in. While it is pending the nav and the child
  // render, and the child's queries are already on their way.
  if (!membership.isPending && !membership.data) {
    return <Centered title={t("errors.forbiddenTitle")} body={t("errors.forbiddenBody")} />;
  }

  return (
    <div>
      <nav className="border-border flex gap-1 overflow-x-auto border-b px-5">
        {SECTIONS.map((section) => (
          <Link
            key={section.to}
            to={section.to}
            params={{ orgSlug }}
            activeOptions={{ exact: section.exact }}
            activeProps={{ className: "border-foreground text-foreground" }}
            inactiveProps={{ className: "border-transparent text-muted-foreground" }}
            className="hover:text-foreground shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors"
          >
            {t(section.label)}
          </Link>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}

function Centered({ title, body }: { title: string; body?: string }) {
  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center px-5 text-center">
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="text-muted-foreground mt-1 text-sm">{body}</p>}
    </main>
  );
}
