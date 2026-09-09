import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { createOrganization } from "@/features/organizations/organizations.functions";
import { slugify } from "@/lib/utils";

export const Route = createFileRoute("/admin/new")({
  component: CreateOrganization,
});

/** The browser's own guess, which is right far more often than a blank select. */
function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function CreateOrganization() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  // Kept separate so that once the user edits the URL by hand, typing more of
  // the name doesn't overwrite their choice.
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState("");
  const [timezone, setTimezone] = useState(detectTimezone);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  const mutation = useMutation({
    mutationFn: () =>
      createOrganization({ data: { name: name.trim(), slug: effectiveSlug, timezone } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["my-organizations"] });
      void navigate({ to: "/admin/$orgSlug", params: { orgSlug: result.slug }, replace: true });
    },
  });

  const error = mutation.error;
  const errorMessage =
    error instanceof Error && error.message.includes("SLUG_TAKEN")
      ? t("org.slugTaken")
      : error
        ? t("org.createError")
        : null;

  return (
    <main className="mx-auto max-w-md px-5 py-12">
      <h1 className="text-xl font-semibold">{t("org.createTitle")}</h1>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <label className="block">
          <span className="text-sm font-medium">{t("org.nameLabel")}</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("org.namePlaceholder")}
            className="border-input mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">{t("org.slugLabel")}</span>
          <input
            required
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            className="border-input mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          <span className="text-muted-foreground mt-1 block text-xs">
            {t("org.slugHelp")} /{effectiveSlug || "…"}
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium">{t("org.timezoneLabel")}</span>
          <input
            required
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="border-input mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          <span className="text-muted-foreground mt-1 block text-xs">{t("org.timezoneHelp")}</span>
        </label>

        <button
          type="submit"
          disabled={mutation.isPending || !effectiveSlug}
          className="bg-primary text-primary-foreground w-full rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-60"
        >
          {mutation.isPending ? t("common.loading") : t("common.create")}
        </button>

        {errorMessage && <p className="text-destructive text-sm">{errorMessage}</p>}
      </form>
    </main>
  );
}
