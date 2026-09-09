import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useSession } from "@/features/auth/useSession";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

/** How long to wait for the session before calling the link dead. */
const TIMEOUT_MS = 8000;

/**
 * Where the magic link lands. The Supabase client is configured with
 * `detectSessionInUrl`, so it consumes the code on load by itself and all this
 * screen does is wait for the session to appear and then get out of the way.
 */
function AuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (session) void navigate({ to: "/admin", replace: true });
  }, [session, navigate]);

  const failed = timedOut && !loading && !session;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-sm text-center">
        {failed ? (
          <>
            <p className="text-destructive text-sm">{t("auth.callbackError")}</p>
            <Link to="/login" className="mt-3 inline-block text-sm underline">
              {t("auth.backToSignIn")}
            </Link>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">{t("auth.callbackWorking")}</p>
        )}
      </div>
    </main>
  );
}
