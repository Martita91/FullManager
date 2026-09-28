import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

/**
 * Sign in as the demo account.
 *
 * The important thing to understand about this: the guest is a *real* Supabase
 * user, not a bypass. It could not be a bypass — every admin screen calls a
 * server function that requires a bearer token, and RLS decides what comes
 * back, so a "guest mode" that merely skipped the login screen would get a 401
 * on every request and render empty pages. The gate is the database, and the
 * only way through a database is with credentials.
 *
 * So the password lives here, in the server environment, and never in the
 * browser bundle. The client gets a session and nothing else. What that session
 * can do is decided the same way it is for everyone: by the role on the guest's
 * `org_members` row.
 *
 * This handler is deliberately unauthenticated — that is the whole point — so
 * it is a login oracle for one fixed account. Supabase rate-limits password
 * sign-ins on its own, and the account is expected to be read-only in a league
 * that exists to be looked at.
 */
export interface GuestSession {
  accessToken: string;
  refreshToken: string;
}

/**
 * Whether to offer the demo at all.
 *
 * This is asked of the server rather than read from a `VITE_` flag on purpose.
 * A build-time flag is a second copy of the truth, and the two can disagree —
 * a flag set for one environment and not another, or a value that never made
 * it into the bundle, gives you a button with no account behind it or, as
 * happened here, an account with no button in front of it. There is only one
 * fact worth asking about: are the credentials configured on this server.
 */
export const getLoginOptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ guestEnabled: boolean }> => ({
    guestEnabled: Boolean(process.env.GUEST_EMAIL && process.env.GUEST_PASSWORD),
  }),
);

export const signInAsGuest = createServerFn({ method: "POST" }).handler(
  async (): Promise<GuestSession> => {
    const email = process.env.GUEST_EMAIL;
    const password = process.env.GUEST_PASSWORD;

    // Absent on purpose in an environment that should not offer a demo.
    if (!email || !password) throw new Error("GUEST_DISABLED");

    const url = process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
    const publishableKey =
      process.env.SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!url || !publishableKey) {
      throw new Error("Missing Supabase URL or publishable key in the server environment.");
    }

    const client = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await client.auth.signInWithPassword({ email, password });

    // Never forwarded verbatim: the reason a fixed account failed to sign in is
    // information about that account, and the visitor can do nothing with it.
    if (error || !data.session) throw new Error("GUEST_UNAVAILABLE");

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  },
);
