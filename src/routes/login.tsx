import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useHydrated } from "@/features/auth/useHydrated";
import { getLoginOptions, signInAsGuest } from "@/features/auth/guest.functions";

export const Route = createFileRoute("/login")({
  loader: () => getLoginOptions(),
  component: Login,
});

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "entering" }
  // `detail` is whatever the auth server actually said. Swallowing it is how a
  // rate limit and an unlisted redirect URL came to look like the same problem.
  | { kind: "error"; detail: string | null }
  | { kind: "guestError" };

function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Answered by the server that holds the credentials, so the button and the
  // account behind it can never disagree.
  const { guestEnabled } = Route.useLoaderData();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Until React takes over, this form is plain HTML and submitting it does a
  // native GET that silently reloads the page without requesting anything.
  const hydrated = useHydrated();

  const busy = status.kind === "sending" || status.kind === "entering";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ kind: "sending" });

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    setStatus(error ? { kind: "error", detail: error.message } : { kind: "sent", email });
  }

  async function onGuest() {
    setStatus({ kind: "entering" });
    try {
      const guest = await signInAsGuest();
      const { error } = await supabase.auth.setSession({
        access_token: guest.accessToken,
        refresh_token: guest.refreshToken,
      });
      if (error) throw error;
      await navigate({ to: "/admin", replace: true });
    } catch {
      setStatus({ kind: "guestError" });
    }
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
            disabled={!hydrated || busy}
            className="bg-primary text-primary-foreground w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {status.kind === "sending" ? t("auth.sending") : t("auth.sendLink")}
          </button>
        </form>

        {guestEnabled && (
          <>
            <div className="my-5 flex items-center gap-3">
              <span className="border-border h-px flex-1 border-t" />
              <span className="text-muted-foreground text-xs">{t("auth.or")}</span>
              <span className="border-border h-px flex-1 border-t" />
            </div>

            <button
              type="button"
              onClick={() => void onGuest()}
              disabled={!hydrated || busy}
              className="border-input hover:bg-muted w-full rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
            >
              {status.kind === "entering" ? t("auth.guestWorking") : t("auth.guestButton")}
            </button>
            <p className="text-muted-foreground mt-2 text-center text-xs">{t("auth.guestHint")}</p>
          </>
        )}

        {status.kind === "sent" && (
          <p className="mt-4 text-sm text-emerald-600">
            {t("auth.linkSent", { email: status.email })}
          </p>
        )}
        {status.kind === "error" && (
          <div className="mt-4">
            <p className="text-destructive text-sm">{t("auth.linkError")}</p>
            {status.detail && <p className="text-muted-foreground mt-1 text-xs">{status.detail}</p>}
          </div>
        )}
        {status.kind === "guestError" && (
          <p className="text-destructive mt-4 text-sm">{t("auth.guestError")}</p>
        )}
      </div>
    </main>
  );
}
