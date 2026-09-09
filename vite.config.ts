import { defineConfig, type UserConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Every plugin is declared explicitly here on purpose. Plugin ORDER matters:
// Tailwind first, then TanStack Start (which generates the route tree and
// splits client from server), then Nitro at build time, and React last.
// Reordering these silently breaks either HMR or the SSR build.
export default defineConfig(async ({ command }): Promise<UserConfig> => {
  // Nitro is a build-only concern; importing it in dev costs startup time for
  // nothing. `vercel` is the deploy target — see README.
  const buildPlugins =
    command === "build" ? [(await import("nitro/vite")).nitro({ preset: "vercel" })] : [];

  return {
    // Vite uses PostCSS in dev and Lightning CSS only at build, so a transform
    // that breaks the built output would still look fine in the dev preview.
    // Running Lightning CSS in both keeps the preview honest.
    css: { transformer: "lightningcss" },

    resolve: {
      // Native in Vite 8 — reads the `@/*` mapping straight from tsconfig.json,
      // so the alias is defined in exactly one place.
      tsconfigPaths: true,
      // A second copy of React (pulled in by any dependency) breaks hooks at
      // runtime with an error that points nowhere useful.
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },

    // React core only. Including @tanstack/react-start here would drag its
    // node:async_hooks server entry into the client bundle and crash hydration.
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },

    plugins: [
      tailwindcss(),
      tanstackStart({
        // Redirect TanStack Start's bundled server entry to src/server.ts once
        // that wrapper exists; until then the default entry is used.
        // Hard failure instead of a mystery client bundle: anything under a
        // `server/` folder, or importing `server-only`, must never reach the
        // browser. Our own convention is the `*.server.ts` suffix.
        importProtection: {
          behavior: "error",
          client: {
            files: ["**/server/**"],
            specifiers: ["server-only"],
          },
        },
      }),
      ...buildPlugins,
      viteReact(),
    ],
  };
});
