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
 * Tokens this instance has already verified, held briefly.
 *
 * `getUser` is an HTTP call to the auth server, and one screen makes four or
 * five server-function calls that were each paying for it separately — a full
 * round trip to Supabase before any of them could start doing its actual work.
 *
 * This does not widen what a stolen or revoked token can do. The token is
 * signed; Postgres verifies that signature and the expiry itself on every
 * query, and Supabase access tokens are not checked against a revocation list
 * there either — signing out invalidates the *refresh* token, while the access
 * token stays valid until it expires regardless of what this cache does. The
 * entry never outlives the token's own `exp`, so nothing here is accepted a
 * moment longer than the database would accept it.
 */
const VERIFIED_TTL_MS = 30_000;
const MAX_CACHED_TOKENS = 500;

interface VerifiedToken {
  supabase: SupabaseClient;
  userId: string;
  email: string | null;
  expiresAt: number;
}

const verifiedTokens = new Map<string, VerifiedToken>();

/**
 * The `exp` claim, read without verifying the signature. Only ever used to
 * expire a cache entry *sooner* — never to decide that a token is valid.
 */
function tokenExpiryMs(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as {
      exp?: number;
    };
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
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

    const now = Date.now();
    const cached = verifiedTokens.get(token);
    if (cached && cached.expiresAt > now) {
      const context: AuthContext = {
        supabase: cached.supabase,
        userId: cached.userId,
        email: cached.email,
      };
      return next({ context });
    }

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
    if (error || !data.user) {
      verifiedTokens.delete(token);
      throw new UnauthorizedError();
    }

    // A long-lived instance would otherwise hold one entry for every token it
    // has ever seen. Dropping all of them costs one extra `getUser` each.
    if (verifiedTokens.size >= MAX_CACHED_TOKENS) verifiedTokens.clear();

    const expiry = tokenExpiryMs(token);
    verifiedTokens.set(token, {
      supabase: scoped,
      userId: data.user.id,
      email: data.user.email ?? null,
      expiresAt: Math.min(now + VERIFIED_TTL_MS, expiry ?? Number.POSITIVE_INFINITY),
    });

    const context: AuthContext = {
      supabase: scoped,
      userId: data.user.id,
      email: data.user.email ?? null,
    };

    return next({ context });
  },
);
