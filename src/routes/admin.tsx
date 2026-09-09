import { useEffect } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSession } from "@/features/auth/useSession";
import { listMyOrganizations } from "@/features/organizations/organizations.functions";
import { supabase } from "@/integrations/supabase/client";
import { branding } from "@/lib/branding";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

/**
 * Auth gate for everything under /admin. The session lives in the browser, so
 * the check happens after hydration rather than in `beforeLoad` — during SSR
 * there is no session to read, and treating that as "signed out" would bounce
 * every signed-in user on a hard refresh.
 */
function AdminLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, loading } = useSession();

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/login", replace: true });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </main>
    );
  }

  return <AdminShell />;
}

function AdminShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Not every /admin route has an orgSlug (the create screen doesn't), so this
  // read has to be non-strict.
  const params = useParams({ strict: false }) as { orgSlug?: string };

  const memberships = useQuery({
    queryKey: ["my-organizations"],
    queryFn: () => listMyOrganizations(),
  });

  async function signOut() {
    await supabase.auth.signOut();
    void navigate({ to: "/login", replace: true });
  }

  return (
    <div className="min-h-dvh">
      <header className="border-border flex items-center justify-between gap-4 border-b px-5 py-3">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="text-sm font-semibold">
            {branding.productName}
          </Link>

          {memberships.data && memberships.data.length > 0 && (
            <select
              aria-label={t("org.switcherLabel")}
              value={params.orgSlug ?? ""}
              onChange={(e) =>
                void navigate({ to: "/admin/$orgSlug", params: { orgSlug: e.target.value } })
              }
              className="border-input rounded-md border bg-transparent px-2 py-1 text-sm"
            >
              <option value="" disabled>
                {t("org.switcherLabel")}
              </option>
              {memberships.data.map((m) => (
                <option key={m.organization.id} value={m.organization.slug}>
                  {m.organization.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <button onClick={signOut} className="text-muted-foreground text-sm hover:underline">
          {t("common.signOut")}
        </button>
      </header>

      <Outlet />
    </div>
  );
}
