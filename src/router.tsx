import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { initI18n } from "./i18n";
import { CATALOG_STALE_TIME } from "./lib/query/staleness";

export interface RouterContext {
  queryClient: QueryClient;
}

/**
 * The plugin looks for this exact export in `src/router.tsx`. It runs once per
 * request on the server and once on the client, so anything set up here must be
 * safe to construct twice.
 */
export function getRouter() {
  initI18n();

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Anything a league admin changes is still visible on the next screen:
        // every mutation invalidates the key it touched, which is what makes
        // this safe. See `staleness.ts` for the queries that opt out.
        staleTime: CATALOG_STALE_TIME,
        retry: 1,
      },
    },
  });

  return createRouter({
    routeTree,
    context: { queryClient } satisfies RouterContext,
    defaultPreload: "intent",
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
