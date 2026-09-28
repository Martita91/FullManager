/**
 * How long a cached answer counts as current.
 *
 * Two values, because this app has two kinds of read.
 *
 * Catalog lists — teams, people, venues, seasons, divisions — only ever change
 * from this interface, and every mutation invalidates the key it touched. A
 * cached copy is therefore correct until something explicitly says otherwise,
 * so refetching it on every navigation bought nothing and made each screen wait
 * on the network a second time.
 *
 * Aggregates of match results are the exception. Entering a score invalidates
 * the match list, and nothing tells the ladder, the discipline table or the
 * knockout bracket that they are now wrong — they are computed from rows that
 * live under a different query key. Those ask for `LIVE_STALE_TIME` at their
 * own call site so they refetch whenever they mount.
 *
 * The rule for a new query: if no mutation in the app invalidates it by name,
 * it is live.
 */
export const CATALOG_STALE_TIME = 5 * 60_000;

export const LIVE_STALE_TIME = 0;
