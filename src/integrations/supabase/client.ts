import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and fill them in.",
  );
}

/**
 * Browser client. Every read and write through this client is subject to RLS as
 * the signed-in user — that is the point, and the reason the publishable key is
 * safe to ship. It is never the right client for anything privileged.
 *
 * This module is also pulled in during SSR (routes import it), so session
 * persistence is switched off when there is no window to persist into.
 */
export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: typeof window !== "undefined",
    autoRefreshToken: typeof window !== "undefined",
    detectSessionInUrl: typeof window !== "undefined",
    flowType: "pkce",
  },
});
