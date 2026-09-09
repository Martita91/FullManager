import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useHydrated } from "@/features/auth/useHydrated";

export const Route = createFileRoute("/login")({
  component: Login,
});

type Status = { kind: "idle" | "sending" | "sent" | "error"; email?: string };

function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Until React takes over, this form is plain HTML and submitting it does a
  // native GET that silently reloads the page without requesting anything.
  const hydrated = useHydrated();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ kind: "sending" });

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    setStatus(error ? { kind: "error" } : { kind: "sent", email });
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">{t("auth.signInTitle")}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("auth.signInSubtitle")}</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <label className="block">
            <span className="text-sm font-medium">{t("auth.emailLabel")}</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              className="border-input mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </label>

          <button
            type="submit"
            disabled={!hydrated || status.kind === "sending"}
            className="bg-primary text-primary-foreground w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {status.kind === "sending" ? t("auth.sending") : t("auth.sendLink")}
          </button>
        </form>

        {status.kind === "sent" && (
          <p className="mt-4 text-sm text-emerald-600">
            {t("auth.linkSent", { email: status.email })}
          </p>
        )}
        {status.kind === "error" && (
          <p className="text-destructive mt-4 text-sm">{t("auth.linkError")}</p>
        )}
      </div>
    </main>
  );
}
