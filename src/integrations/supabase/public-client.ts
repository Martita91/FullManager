import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * A Supabase client that is always anonymous, even when someone is signed in.
 *
 * The public site has to render what a visitor sees. Using the browsing user's
 * own client would quietly show a league member their unpublished competitions
 * on the public page — which looks fine until they share the link and someone
 * else gets a blank one. This client also lets staff preview the public view
 * honestly.
 */
export function publicSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) throw new Error("Missing Supabase URL or publishable key.");

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return cached;
}
