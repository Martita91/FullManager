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
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GUEST_EMAIL`,
`GUEST_PASSWORD`.

`VITE_*` is read at **build** time and `process.env` at **request** time, so a
`VITE_` flag describing something the server knows is two copies of one fact,
and they drift. The guest button cost an afternoon proving it: the flag was
baked into a build made before the credentials existed, so the button and the
account it signs into disagreed with nothing on screen to say so. **Never add a
`VITE_` variable that mirrors server state** — add a server function that
reports it, the way `getLoginOptions` does.

Vercel scopes variables per environment and binds them when a deployment is
built. Adding one changes nothing until the deployment that needs it is rebuilt,
and that is the deployment on the branch being tested — not production.

## Database

Postgres via Supabase. Schema changes are timestamped SQL files in
`supabase/migrations/`, applied in order. Never edit a migration that has been
applied to a real project — add another.

## Matches: regular season and knockouts share one table

`matches.stage` is `regular` for the league phase and a knockout round
otherwise, and `round_number` means two different things depending on which:
the league round, or the match's position within that knockout stage.

**Any query about the league phase must filter `stage = 'regular'`.** Forgetting
it showed two semi-finals as rounds 1 and 2 of the fixture, made the clash
detector report teams playing twice in rounds that did not exist, and — the
part nobody noticed — counted finals results as league points on the ladder.

A knockout that finishes level records `winner_team_id`. The score stays what
was played; deriving a winner from a doctored scoreline would corrupt goal
difference for the league phase of the same competition.

## Dates and times

- Kick-offs are `timestamptz`, rendered in the organization's zone. The helpers
  in `src/lib/time/zoned.ts` are the only place that converts, and a
  `datetime-local` input is always read as the league's wall clock, never the
  browser's.
- **Dates are written dd/mm/yyyy everywhere.** `03/10` means two different days
  depending on the reader, and a fixture list is where that sends someone to a
  pitch on the wrong day. Use `formatDate`, `formatPlainDate` and
  `formatKickoff`; do not call `Intl` directly in a component.

## Pure logic lives in src/lib

Fixture generation, slot allocation, standings, brackets and suspensions are all
pure functions with no database and no time zones — plain local dates and times
in, plain data out. That is what makes them testable, and every real bug found
so far has been in one of them and caught by a test:

- a draw that left one team home seven times and away never;
- a scheduler that placed rounds 4-6 a month before a hand-placed round 3;
- a bracket seeded alphabetically because raw snake_case rows were passed to
  `computeStandings` behind an `as unknown as` cast.

That last one is the rule worth remembering: **never cast Supabase rows into a
domain type.** Map the columns explicitly. The cast turns a compile error into a
silent, plausible-looking wrong answer.

## Latency is the performance problem, not throughput

Nothing here is slow to compute. Everything here is slow because it waits. A
server function costs a round trip from the browser to Vercel and then one or
more to Supabase, and those are the only numbers that matter:

- **Never `await` two queries that don't depend on each other.** `Promise.all`.
  This is the whole reason the dashboard was the slowest screen in the app.
- **A layout must not block its children on `isPending`.** An unmounted child
  hasn't sent its query yet, so gating on a membership check turns two parallel
  requests into two sequential ones for every visitor, to catch a case that
  almost never happens. Render the children and show the refusal once the
  answer is actually in.
- `requireSupabaseAuth` and `requireOrgAccess` each cache for 30 seconds per
  instance. Both are about giving a clear answer, not about safety — RLS
  re-checks every statement and never consults either cache.

## Query staleness: catalog or live

`src/lib/query/staleness.ts` has the two values and the reasoning. The rule for
a new `useQuery`: **if no mutation in the app invalidates its key by name, it is
live** and must pass `staleTime: LIVE_STALE_TIME`. Everything else inherits the
catalog default and stays correct because its own mutations invalidate it.

The ones that are live are the ones computed from rows under a _different_ key —
the ladder, the discipline table, the bracket, the overview, the player app.
Saving a score invalidates the match list and tells none of them.

## Testing

Vitest. The suite is deliberately narrow: pure logic where correctness matters
and edge cases are cheap to cover — fixture generation, slot allocation, and
standings. Don't chase coverage on UI.
