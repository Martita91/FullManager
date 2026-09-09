import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  createPitch,
  createVenue,
  deletePitch,
  deleteVenue,
  listVenues,
  updateVenue,
} from "@/features/catalog/venues.functions";
import { ENTITY_STATUSES, type EntityStatus, type Venue } from "@/features/catalog/types";
import { useOrgMembership } from "@/features/organizations/useOrgMembership";
import { CatalogPage } from "@/components/CatalogPage";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Select,
} from "@/components/ui/controls";

export const Route = createFileRoute("/admin/$orgSlug/venues")({
  component: VenuesPage,
});

interface FormState {
  id: string | null;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  status: EntityStatus;
}

const blankForm: FormState = {
  id: null,
  name: "",
  address: "",
  latitude: "",
  longitude: "",
  status: "active",
};

function VenuesPage() {
  const { t } = useTranslation();
  const { orgSlug } = Route.useParams();
  const queryClient = useQueryClient();
  const { canEdit } = useOrgMembership(orgSlug);

  const [form, setForm] = useState<FormState | null>(null);

  const venues = useQuery({
    queryKey: ["venues", orgSlug],
    queryFn: () => listVenues({ data: { orgSlug } }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["venues", orgSlug] });

  const save = useMutation({
    mutationFn: (state: FormState) => {
      const payload = {
        orgSlug,
        name: state.name.trim(),
        address: state.address,
        latitude: state.latitude,
        longitude: state.longitude,
        status: state.status,
      };
      return state.id
        ? updateVenue({ data: { ...payload, id: state.id } })
        : createVenue({ data: payload });
    },
    onSuccess: async () => {
      await invalidate();
      setForm(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteVenue({ data: { orgSlug, id } }),
    onSuccess: invalidate,
  });

  const message = save.error instanceof Error ? save.error.message : null;
  const saveError = message?.includes("NAME_TAKEN")
    ? t("venues.nameTaken")
    : message
      ? t("common.saveFailed")
      : null;

  return (
    <CatalogPage
      title={t("venues.title")}
      subtitle={t("venues.subtitle")}
      action={
        canEdit && !form ? (
          <Button onClick={() => setForm({ ...blankForm })}>{t("venues.addTitle")}</Button>
        ) : null
      }
    >
      {form && (
        <Card className="mb-6">
          <h2 className="mb-4 text-sm font-semibold">
            {form.id ? t("venues.editTitle") : t("venues.addTitle")}
          </h2>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
          >
            <Field label={t("common.name")}>
              <Input
                required
                value={form.name}
                placeholder={t("venues.namePlaceholder")}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label={t("venues.address")}>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>
            <Field label={t("venues.latitude")} hint={t("venues.coordsHelp")}>
              <Input
                type="number"
                step="any"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
              />
            </Field>
            <Field label={t("venues.longitude")}>
              <Input
                type="number"
                step="any"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
              />
            </Field>
            <Field label={t("common.status")}>
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as EntityStatus })}
              >
                {ENTITY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button type="submit" disabled={save.isPending}>
                {t("common.save")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                {t("common.cancel")}
              </Button>
            </div>
            {saveError && (
              <div className="sm:col-span-2">
                <ErrorNote>{saveError}</ErrorNote>
              </div>
            )}
          </form>
        </Card>
      )}

      {venues.isPending ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : venues.data && venues.data.length > 0 ? (
        <div className="space-y-4">
          {venues.data.map((venue) => (
            <VenueCard
              key={venue.id}
              venue={venue}
              orgSlug={orgSlug}
              canEdit={canEdit}
              onEdit={() =>
                setForm({
                  id: venue.id,
                  name: venue.name,
                  address: venue.address ?? "",
                  latitude: venue.latitude?.toString() ?? "",
                  longitude: venue.longitude?.toString() ?? "",
                  status: venue.status,
                })
              }
              onRemove={() => {
                if (confirm(t("common.confirmDelete"))) remove.mutate(venue.id);
              }}
              onChanged={invalidate}
            />
          ))}
        </div>
      ) : (
        <EmptyState title={t("venues.emptyTitle")} body={t("venues.emptyBody")} />
      )}
    </CatalogPage>
  );
}

function VenueCard({
  venue,
  orgSlug,
  canEdit,
  onEdit,
  onRemove,
  onChanged,
}: {
  venue: Venue;
  orgSlug: string;
  canEdit: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [pitchName, setPitchName] = useState("");
  const [surface, setSurface] = useState("");

  const addPitch = useMutation({
    mutationFn: () =>
      createPitch({
        data: { orgSlug, venueId: venue.id, name: pitchName.trim(), surface, status: "active" },
      }),
    onSuccess: async () => {
      await onChanged();
      setPitchName("");
      setSurface("");
    },
  });

  const dropPitch = useMutation({
    mutationFn: (id: string) => deletePitch({ data: { orgSlug, id } }),
    onSuccess: onChanged,
  });

  const message = addPitch.error instanceof Error ? addPitch.error.message : null;
  const pitchError = message?.includes("NAME_TAKEN")
    ? t("venues.pitchNameTaken")
    : message
      ? t("common.saveFailed")
      : null;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{venue.name}</h3>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {venue.address ?? "—"} · {t(`status.${venue.status}`)}
          </p>
        </div>
        {canEdit && (
          <div className="whitespace-nowrap">
            <Button variant="ghost" onClick={onEdit}>
              {t("common.edit")}
            </Button>
            <Button variant="ghost" className="text-destructive" onClick={onRemove}>
              {t("common.remove")}
            </Button>
          </div>
        )}
      </div>

      <div className="border-border mt-4 border-t pt-4">
        <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {t("venues.pitches")}
        </h4>

        {venue.pitches.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {venue.pitches.map((pitch) => (
              <li key={pitch.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {pitch.name}
                  {pitch.surface ? ` · ${pitch.surface}` : ""}
                </span>
                {canEdit && (
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    disabled={dropPitch.isPending}
                    onClick={() => {
                      if (confirm(t("common.confirmDelete"))) dropPitch.mutate(pitch.id);
                    }}
                  >
                    {t("common.remove")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">{t("venues.noPitches")}</p>
        )}

        {canEdit && (
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (pitchName.trim()) addPitch.mutate();
            }}
          >
            <Input
              required
              value={pitchName}
              placeholder={t("venues.pitchNamePlaceholder")}
              onChange={(e) => setPitchName(e.target.value)}
              className="w-40"
            />
            <Input
              value={surface}
              placeholder={t("venues.surfacePlaceholder")}
              onChange={(e) => setSurface(e.target.value)}
              className="w-40"
            />
            <Button type="submit" variant="secondary" disabled={addPitch.isPending}>
              {t("venues.addPitch")}
            </Button>
            {pitchError && (
              <div className="w-full">
                <ErrorNote>{pitchError}</ErrorNote>
              </div>
            )}
          </form>
        )}
      </div>
    </Card>
  );
}
