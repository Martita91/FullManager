import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { initI18n } from "./i18n";

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
        // Anything a league admin changes should be visible on the next screen,
        // not up to five minutes later.
        staleTime: 10_000,
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
