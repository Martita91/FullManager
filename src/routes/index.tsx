import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/")({
  component: Landing,
});

/**
 * Public entry point. Phase 3 turns this into the competition directory —
 * search a league, see its fixtures and ladder without an account.
 */
function Landing() {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">{t("landing.title")}</h1>
        <p className="text-muted-foreground mt-3 text-base">{t("landing.subtitle")}</p>
      </div>
      <Link
        to="/admin"
        className="bg-primary text-primary-foreground rounded-lg px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
      >
        {t("landing.adminCta")}
      </Link>
    </main>
  );
}
