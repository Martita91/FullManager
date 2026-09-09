import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgAccess, requireOrgEditor } from "@/features/organizations/membership";
import { orgSlug, uuid } from "./validation";
import type { Division, EntityStatus, Sport } from "./types";

const UNIQUE_VIOLATION = "23505";

/** Global reference data — every league picks from the same list. */
export const listSports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Sport[]> => {
    const { data, error } = await context.supabase
      .from("sports")
      .select("id, key, name")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as Sport[];
  });

interface DivisionRow {
  id: string;
  name: string;
  status: EntityStatus;
  sport_id: string;
  sports: { name: string } | null;
}

const toDivision = (r: DivisionRow): Division => ({
  id: r.id,
  name: r.name,
  status: r.status,
  sportId: r.sport_id,
  sportName: r.sports?.name ?? "",
});

export const listDivisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug }).parse(input))
  .handler(async ({ data, context }): Promise<Division[]> => {
    const { orgId } = await requireOrgAccess(context.supabase, context.userId, data.orgSlug);

    const { data: rows, error } = await context.supabase
      .from("divisions")
      .select("id, name, status, sport_id, sports(name)")
      .eq("org_id", orgId)
      .order("name");

    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as DivisionRow[]).map(toDivision);
  });

const divisionInput = z.object({
  orgSlug,
  sportId: uuid,
  name: z.string().trim().min(2).max(60),
  status: z.enum(["active", "inactive"]),
});

export const createDivision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => divisionInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { orgId } = await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const { data: row, error } = await context.supabase
      .from("divisions")
      .insert({ org_id: orgId, sport_id: data.sportId, name: data.name, status: data.status })
      .select("id")
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new Error("NAME_TAKEN");
      throw new Error(error.message);
    }
    return row as { id: string };
  });

export const updateDivision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => divisionInput.extend({ id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const { error } = await context.supabase
      .from("divisions")
      .update({ sport_id: data.sportId, name: data.name, status: data.status })
      .eq("id", data.id);

    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new Error("NAME_TAKEN");
      throw new Error(error.message);
    }
    return { id: data.id };
  });

export const deleteDivision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);
    const { error } = await context.supabase.from("divisions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });
