import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";

/**
 * Client half: attaches the signed-in user's access token to every server
 * function call. Registered globally in `src/start.ts`, so no call site has to
 * remember it — a server function that forgets its token is an auth bug that
 * only shows up in production.
 */
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    // During SSR the server function is invoked directly and there is no browser
    // session to read; the request's own headers already carry the token.
    if (typeof window === "undefined") return next();

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    return token ? next({ headers: { Authorization: `Bearer ${token}` } }) : next();
  },
);

export class UnauthorizedError extends Error {
  readonly statusCode = 401;
  constructor(message = "Not signed in") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export interface AuthContext {
  /** Scoped to the caller: RLS applies as this user. Not an admin client. */
  supabase: SupabaseClient;
  userId: string;
  email: string | null;
}

/**
 * Server half: validates the bearer token and hands the handler a Supabase
 * client authenticated *as that user*, so RLS — not application code — decides
 * what the request can see and change.
 */
export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const header = getRequestHeader("authorization") ?? "";
    const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;

    if (!token) throw new UnauthorizedError();

    const url = process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
    const publishableKey =
      process.env.SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!url || !publishableKey) {
      throw new Error("Missing Supabase URL or publishable key in the server environment.");
    }

    const scoped = createClient(url, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verifies the JWT against the auth server rather than trusting its claims.
    const { data, error } = await scoped.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedError();

    const context: AuthContext = {
      supabase: scoped,
      userId: data.user.id,
      email: data.user.email ?? null,
    };

    return next({ context });
  },
);
