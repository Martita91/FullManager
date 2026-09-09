import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgAccess, requireOrgEditor } from "@/features/organizations/membership";
import { optionalText, orgSlug, uuid } from "./validation";
import type { EntityStatus, Venue } from "./types";

const UNIQUE_VIOLATION = "23505";

interface VenueRow {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  status: EntityStatus;
  pitches: { id: string; name: string; surface: string | null; status: EntityStatus }[] | null;
}

export const listVenues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug }).parse(input))
  .handler(async ({ data, context }): Promise<Venue[]> => {
    const { orgId } = await requireOrgAccess(context.supabase, context.userId, data.orgSlug);

    const { data: rows, error } = await context.supabase
      .from("venues")
      .select("id, name, address, latitude, longitude, status, pitches(id, name, surface, status)")
      .eq("org_id", orgId)
      .order("name");

    if (error) throw new Error(error.message);

    return ((rows ?? []) as unknown as VenueRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      latitude: r.latitude,
      longitude: r.longitude,
      status: r.status,
      pitches: (r.pitches ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  });

const coordinate = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().min(-max).max(max).nullable(),
  );

const venueInput = z.object({
  orgSlug,
  name: z.string().trim().min(2).max(80),
  address: optionalText(200),
  latitude: coordinate(90),
  longitude: coordinate(180),
  status: z.enum(["active", "inactive"]),
});

export const createVenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => venueInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { orgId } = await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const { data: row, error } = await context.supabase
      .from("venues")
      .insert({
        org_id: orgId,
        name: data.name,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        status: data.status,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new Error("NAME_TAKEN");
      throw new Error(error.message);
    }
    return row as { id: string };
  });

export const updateVenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => venueInput.extend({ id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const { error } = await context.supabase
      .from("venues")
      .update({
        name: data.name,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        status: data.status,
      })
      .eq("id", data.id);

    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new Error("NAME_TAKEN");
      throw new Error(error.message);
    }
    return { id: data.id };
  });

export const deleteVenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);
    const { error } = await context.supabase.from("venues").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

// ---------------------------------------------------------------------------
// Pitches
// ---------------------------------------------------------------------------

const pitchInput = z.object({
  orgSlug,
  venueId: uuid,
  name: z.string().trim().min(1).max(60),
  surface: optionalText(40),
  status: z.enum(["active", "inactive"]),
});

export const createPitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => pitchInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { orgId } = await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    // As with team memberships, a trigger overwrites org_id from the venue.
    const { data: row, error } = await context.supabase
      .from("pitches")
      .insert({
        venue_id: data.venueId,
        org_id: orgId,
        name: data.name,
        surface: data.surface,
        status: data.status,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new Error("NAME_TAKEN");
      throw new Error(error.message);
    }
    return row as { id: string };
  });

export const deletePitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);
    const { error } = await context.supabase.from("pitches").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });
