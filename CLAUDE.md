# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Full Manager — a multi-tenant platform for running football leagues. An
organizer ("league") manages seasons, divisions, competitions, teams, people,
venues and fixtures; players and the public get a read-only site and a PWA.

The name is provisional. It lives only in `src/lib/branding.ts`; never hardcode
it anywhere else.

This is a spin-off of Thursday F.C. (`../thursdayfc`), which is a single-club
pickup app. Only UI conventions and a few patterns were carried over — the data
model shares nothing. Don't copy code from there without checking it still fits.

## Commands

Package manager is Bun.

- `bun install` — install deps (blocked on packages published <24h ago; see
  `minimumReleaseAgeExcludes` in `bunfig.toml`, and confirm with the user before
  adding an entry)
- `bun run dev` — dev server, port 5173
- `bun run build` — production build (Nitro, `vercel` preset)
- `bun run typecheck` / `bun run lint` / `bun run format` / `bun run test`

Both this project and `thursdayfc` live under the same parent folder, and the
dev-server configs are in `../.claude/launch.json`. Bun wants
`bun run --cwd <dir> <script>` — `--cwd` before `run` is rejected.

## Build config

`vite.config.ts` declares every plugin explicitly. **Order matters**: Tailwind,
then TanStack Start, then Nitro (build only), then React. Path aliases come from
`resolve.tsconfigPaths: true` (native in Vite 8) reading `tsconfig.json`, so
`@/*` is defined in exactly one place.

## Multi-tenancy — the rule the whole product rests on

Every tenant table carries an `org_id`, has RLS enabled, and gates reads by
membership and writes by role.

- Membership: `org_members (org_id, user_id, role)`. Roles are
  `owner | admin | staff | team_admin | viewer`; today only the first three are
  used, since league staff loads everything.
- Role checks go through the SQL helpers `is_org_member`, `is_org_manager` and
  `current_org_role`. They are `SECURITY DEFINER` on purpose: a policy on
  `org_members` that queries `org_members` recurses and Postgres rejects it.
- **RLS is the enforcement point.** Never implement a permission check in
  application code and treat it as sufficient. Server functions use
  `requireSupabaseAuth`, which validates the JWT and returns a Supabase client
  authenticated as the caller, so policies apply.
- New tenant tables need their policies in the same migration that creates them.

## Supabase clients — three, don't mix them

- `src/integrations/supabase/client.ts` — browser, RLS as the signed-in user.
- `requireSupabaseAuth`'s per-request client — RLS as the calling user. This is
  what server functions should use.
- `src/integrations/supabase/client.server.ts` (`supabaseAdmin()`) — service
  role, **bypasses RLS**. Webhooks and cron only. Route files and
  `*.functions.ts` ship to the client bundle, so import it with
  `await import()` inside a handler; only other `*.server.ts` files may import
  it at the top level.

## Routing

TanStack Start file-based routing in `src/routes/`. `src/routeTree.gen.ts` is
generated — never hand-edit it. `src/router.tsx` must export `getRouter`.

- Public site: `/{orgSlug}/...` (phase 3).
- Dashboard: `/admin`, `/admin/new`, `/admin/{orgSlug}`.
- Static segments beat dynamic ones, so an org slug can't be `new`, `admin`,
  `api`, etc. The list is `RESERVED_SLUGS` in
  `src/features/organizations/types.ts` and is enforced server-side too.
- The root's `notFoundComponent` must not render an `<Outlet />` — it sits
  inside the router's outlet, so doing that recurses until SSR dies.

## Auth

Supabase Auth, email magic link, PKCE. The session lives in the browser, so
`/admin` gates after hydration (`useSession`) rather than in `beforeLoad`:
during SSR there is no session to read, and treating that as "signed out" would
bounce signed-in users on every refresh.

## i18n

English is the source language. **No user-facing string may be written into a
component** — add a key to `src/i18n/locales/en.ts`. `{{productName}}` is
injected automatically from branding. Dates and numbers go through `Intl`, in
the organization's time zone, never the viewer's.

## Environment variables

`VITE_*` is inlined into the browser bundle at build time — nothing secret. Everything
else is server-only via `process.env`: `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## Database

Postgres via Supabase. Schema changes are timestamped SQL files in
`supabase/migrations/`, applied in order. Never edit a migration that has been
applied to a real project — add another.

## Testing

Vitest. The suite is deliberately narrow: pure logic where correctness matters
and edge cases are cheap to cover — fixture generation, slot allocation, and
standings. Don't chase coverage on UI.
