import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgAccess, requireOrgEditor } from "@/features/organizations/membership";
import { optionalDate, optionalEmail, optionalText, orgSlug, uuid } from "./validation";
import type { EntityStatus, Person } from "./types";

const UNIQUE_VIOLATION = "23505";

interface PersonRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  status: EntityStatus;
  user_id: string | null;
}

const toPerson = (r: PersonRow): Person => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  email: r.email,
  phone: r.phone,
  dateOfBirth: r.date_of_birth,
  status: r.status,
  claimed: r.user_id !== null,
});

export const listPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug }).parse(input))
  .handler(async ({ data, context }): Promise<Person[]> => {
    const { orgId } = await requireOrgAccess(context.supabase, context.userId, data.orgSlug);

    const { data: rows, error } = await context.supabase
      .from("people")
      .select("id, first_name, last_name, email, phone, date_of_birth, status, user_id")
      .eq("org_id", orgId)
      .order("last_name")
      .order("first_name");

    if (error) throw new Error(error.message);
    return ((rows ?? []) as PersonRow[]).map(toPerson);
  });

const personInput = z.object({
  orgSlug,
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: optionalEmail,
  phone: optionalText(40),
  dateOfBirth: optionalDate,
  status: z.enum(["active", "inactive"]),
});

export const createPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => personInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { orgId } = await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const { data: row, error } = await context.supabase
      .from("people")
      .insert({
        org_id: orgId,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        phone: data.phone,
        date_of_birth: data.dateOfBirth,
        status: data.status,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new Error("EMAIL_TAKEN");
      throw new Error(error.message);
    }
    return row as { id: string };
  });

export const updatePerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => personInput.extend({ id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const { error } = await context.supabase
      .from("people")
      .update({
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        phone: data.phone,
        date_of_birth: data.dateOfBirth,
        status: data.status,
      })
      .eq("id", data.id);

    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new Error("EMAIL_TAKEN");
      throw new Error(error.message);
    }
    return { id: data.id };
  });

export const deletePerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);
    const { error } = await context.supabase.from("people").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });
