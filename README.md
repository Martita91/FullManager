# Full Manager

A platform for running football leagues: an organizer dashboard for seasons,
divisions, competitions, teams and fixtures, and a public site plus player PWA
for everyone else.

The name is provisional. It lives in `src/lib/branding.ts` and nowhere else, so
renaming the product is a one-file change.

## Status

**Phase 0 — scaffolding and tenancy.** What works today: sign in by email link,
create an organization, switch between organizations, and a placeholder
dashboard. Seasons, teams, competitions and fixtures come next.

## Stack

- **TanStack Start** (file-based routing, server functions) on **Vite 8**
- **React 19**, **Tailwind CSS v4**, shadcn/ui conventions
- **Supabase** — Postgres, Auth, and Row Level Security
- **Nitro** with the `vercel` preset
- **i18next**, English as the source language
- **Bun** as package manager and runner

Every Vite plugin is declared explicitly in `vite.config.ts`. Plugin order there
matters — the comment in the file explains why.

## Getting started

```bash
bun install
cp .env.example .env   # then fill it in, see below
bun run dev
```

### Supabase setup

The app needs a Supabase project. This part is manual and only has to happen
once:

1. Create a project at [supabase.com](https://supabase.com).
2. Copy the project URL, the publishable (anon) key and the service role key
   from **Project Settings → API** into `.env`.
3. Apply `supabase/migrations/*.sql` in order, through the SQL editor or the
   Supabase CLI. `20260909000001_organizations.sql` creates the tenancy tables
   and every RLS policy — the app will not work without it.
4. Under **Authentication → URL Configuration**, add
   `http://localhost:5173/auth/callback` as a redirect URL, plus the deployed
   equivalent once there is one.

Until `.env` holds real values, the app renders but nothing that talks to
Supabase will succeed.

## Scripts

| Command             | What it does                     |
| ------------------- | -------------------------------- |
| `bun run dev`       | Dev server on port 5173          |
| `bun run build`     | Production build (Nitro, Vercel) |
| `bun run preview`   | Serve a production build         |
| `bun run typecheck` | `tsc --noEmit`                   |
| `bun run lint`      | ESLint                           |
| `bun run format`    | Prettier, writes in place        |
| `bun run test`      | Vitest                           |

## Deploying

The Nitro preset is `vercel`, so `bun run build` produces a Vercel-ready output.
The same environment variables as `.env` have to be set in the Vercel project —
`VITE_*` ones are inlined into the browser bundle at build time, so they must be
present at build, not just at runtime.

## Architecture notes

**Multi-tenant, one database.** Every tenant table carries an `org_id` and has
RLS enabled. Membership lives in `org_members`, and role checks go through the
`is_org_member` / `is_org_manager` SQL helpers. Those are `SECURITY DEFINER`
because a policy on `org_members` that queries `org_members` recurses.

**RLS is the enforcement point, not application code.** Server functions run
through `requireSupabaseAuth`, which validates the caller's JWT and hands the
handler a Supabase client authenticated _as that user_. The service-role client
in `client.server.ts` bypasses RLS and is limited to webhooks and cron.

**Server-only modules end in `*.server.ts`.** ESLint bans importing the Next.js
`server-only` package, which TanStack Start doesn't use. Route files and
`*.functions.ts` modules are compiled into the client bundle, so they must
`await import()` anything server-only inside a handler.

**No literal user-facing text in components.** Everything comes from
`src/i18n/locales/en.ts`. English is the source language; adding another is
adding a file, not editing screens.
