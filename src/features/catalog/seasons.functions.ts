import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgAccess, requireOrgEditor } from "@/features/organizations/membership";
import { optionalDate, orgSlug, uuid } from "./validation";
import type { Season, SeasonStatus } from "./types";

const UNIQUE_VIOLATION = "23505";

interface SeasonRow {
  id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  status: SeasonStatus;
}

const toSeason = (r: SeasonRow): Season => ({
  id: r.id,
  name: r.name,
  startsOn: r.starts_on,
  endsOn: r.ends_on,
  status: r.status,
});

export const listSeasons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug }).parse(input))
  .handler(async ({ data, context }): Promise<Season[]> => {
    const { orgId } = await requireOrgAccess(context.supabase, context.userId, data.orgSlug);

    const { data: rows, error } = await context.supabase
      .from("seasons")
      .select("id, name, starts_on, ends_on, status")
      .eq("org_id", orgId)
      .order("starts_on", { ascending: false, nullsFirst: false })
      .order("name");

    if (error) throw new Error(error.message);
    return ((rows ?? []) as SeasonRow[]).map(toSeason);
  });

const seasonInput = z.object({
  orgSlug,
  name: z.string().trim().min(2).max(60),
  startsOn: optionalDate,
  endsOn: optionalDate,
  status: z.enum(["draft", "active", "archived"]),
});

function assertDateOrder(startsOn: string | null, endsOn: string | null) {
  if (startsOn && endsOn && endsOn < startsOn) throw new Error("END_BEFORE_START");
}

export const createSeason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => seasonInput.parse(input))
  .handler(async ({ data, context }): Promise<Season> => {
    const { orgId } = await requireOrgEditor(context.supabase, context.userId, data.orgSlug);
    assertDateOrder(data.startsOn, data.endsOn);

    const { data: row, error } = await context.supabase
      .from("seasons")
      .insert({
        org_id: orgId,
        name: data.name,
        starts_on: data.startsOn,
        ends_on: data.endsOn,
        status: data.status,
      })
      .select("id, name, starts_on, ends_on, status")
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new Error("NAME_TAKEN");
      throw new Error(error.message);
    }
    return toSeason(row as SeasonRow);
  });

export const updateSeason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => seasonInput.extend({ id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<Season> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);
    assertDateOrder(data.startsOn, data.endsOn);

    const { data: row, error } = await context.supabase
      .from("seasons")
      .update({
        name: data.name,
        starts_on: data.startsOn,
        ends_on: data.endsOn,
        status: data.status,
      })
      .eq("id", data.id)
      .select("id, name, starts_on, ends_on, status")
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new Error("NAME_TAKEN");
      throw new Error(error.message);
    }
    return toSeason(row as SeasonRow);
  });

export const deleteSeason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const { error } = await context.supabase.from("seasons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });
