import { createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { useTranslation } from "react-i18next";
import type { RouterContext } from "@/router";
import { branding } from "@/lib/branding";
import appCss from "@/styles.css?url";

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: branding.productName },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
  errorComponent: RootError,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster richColors position="top-center" />
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
