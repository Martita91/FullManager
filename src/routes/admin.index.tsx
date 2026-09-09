import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { listMyOrganizations } from "@/features/organizations/organizations.functions";

export const Route = createFileRoute("/admin/")({
  component: AdminHome,
});

/**
 * Sends the user wherever they actually belong: their first organization, or
 * the create screen if they have none.
 */
function AdminHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const memberships = useQuery({
    queryKey: ["my-organizations"],
    queryFn: () => listMyOrganizations(),
  });

  const first = memberships.data?.[0];

  useEffect(() => {
    if (first) {
      void navigate({
        to: "/admin/$orgSlug",
        params: { orgSlug: first.organization.slug },
        replace: true,
      });
    }
  }, [first, navigate]);

  if (memberships.isPending) {
    return <Centered>{t("common.loading")}</Centered>;
  }

  if (memberships.data && memberships.data.length === 0) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center">
        <h1 className="text-xl font-semibold">{t("org.noneTitle")}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("org.noneBody")}</p>
        <Link
          to="/admin/new"
          className="bg-primary text-primary-foreground mt-5 inline-block rounded-lg px-4 py-2 text-sm font-medium"
        >
          {t("org.createTitle")}
        </Link>
      </main>
    );
  }

  return <Centered>{t("common.loading")}</Centered>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[50vh] items-center justify-center">
      <p className="text-muted-foreground text-sm">{children}</p>
    </main>
  );
}
