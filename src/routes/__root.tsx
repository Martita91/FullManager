import { createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useTranslation } from "react-i18next";
import { ServiceWorker } from "@/features/pwa/ServiceWorker";
import type { RouterContext } from "@/router";
import { branding } from "@/lib/branding";
import appCss from "@/styles.css?url";

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        // viewport-fit=cover so an installed app can paint under the notch.
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { name: "theme-color", content: "#111827" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: branding.productName },
      { title: branding.productName },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/icon.svg" },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
  errorComponent: RootError,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  // The router's context and React Query's context are separate things: putting
  // the QueryClient in the router context makes it reachable from loaders, but
  // useQuery reads React's own provider and nothing else. Without this wrapper
  // every component that calls useQuery throws "No QueryClient set".
  const { queryClient } = Route.useRouteContext();

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          {children}
          <ServiceWorker />
          <Toaster richColors position="top-center" />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}

// No <Outlet /> here: the not-found component sits *inside* the router's own
// outlet, so rendering another one makes the tree render itself forever and SSR
// dies with "Maximum call stack size exceeded".
function NotFound() {
  const { t } = useTranslation();
  return <Centered title={t("errors.notFoundTitle")} body={t("errors.notFoundBody")} />;
}

function RootError() {
  const { t } = useTranslation();
  return <Centered title={t("errors.genericTitle")} body={t("errors.genericBody")} />;
}

function Centered({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{body}</p>
      </div>
    </main>
  );
}
