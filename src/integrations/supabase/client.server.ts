import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. **Bypasses RLS entirely.**
 *
 * Only two things may use it: webhook handlers (no signed-in user to act as)
 * and cron jobs. Anything serving a request on behalf of a user must go through
 * `requireSupabaseAuth`, which hands back a client scoped to that user so RLS
 * stays in force.
 *
 * Route files and `*.functions.ts` modules are compiled into the client bundle,
 * so they must `await import()` this module inside a handler — never import it
 * at the top level. Only other `*.server.ts` files can do that safely.
 */
let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the server environment.");
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}
