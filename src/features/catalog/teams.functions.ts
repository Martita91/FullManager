import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgAccess, requireOrgEditor } from "@/features/organizations/membership";
import { optionalNumber, optionalText, orgSlug, uuid } from "./validation";
import type { EntityStatus, Team, TeamMember, TeamRole } from "./types";

const UNIQUE_VIOLATION = "23505";

interface TeamRow {
  id: string;
  name: string;
  short_name: string | null;
  status: EntityStatus;
  team_memberships: { count: number }[];
}

export const listTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug }).parse(input))
  .handler(async ({ data, context }): Promise<Team[]> => {
    const { orgId } = await requireOrgAccess(context.supabase, context.userId, data.orgSlug);

    // The embedded count is an aggregate, not N+1 — PostgREST resolves it in
    // the same query.
    const { data: rows, error } = await context.supabase
      .from("teams")
      .select("id, name, short_name, status, team_memberships(count)")
      .eq("org_id", orgId)
      .order("name");

    if (error) throw new Error(error.message);

    return ((rows ?? []) as unknown as TeamRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      shortName: r.short_name,
      status: r.status,
      playerCount: r.team_memberships?.[0]?.count ?? 0,
    }));
  });

const teamInput = z.object({
  orgSlug,
  name: z.string().trim().min(2).max(60),
  shortName: optionalText(12),
  status: z.enum(["active", "inactive"]),
});

export const createTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => teamInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { orgId } = await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const { data: row, error } = await context.supabase
      .from("teams")
      .insert({
        org_id: orgId,
        name: data.name,
        short_name: data.shortName,
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

export const updateTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => teamInput.extend({ id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const { error } = await context.supabase
      .from("teams")
      .update({ name: data.name, short_name: data.shortName, status: data.status })
      .eq("id", data.id);

    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new Error("NAME_TAKEN");
      throw new Error(error.message);
    }
    return { id: data.id };
  });

export const deleteTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);
    const { error } = await context.supabase.from("teams").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

interface MemberRow {
  person_id: string;
  role: TeamRole;
  shirt_number: number | null;
  status: EntityStatus;
  people: { first_name: string; last_name: string } | null;
}

export const getTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, teamId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ team: Team; members: TeamMember[] } | null> => {
    await requireOrgAccess(context.supabase, context.userId, data.orgSlug);

    // Both are keyed by the team id. Fetching the roster only after the team
    // came back doubled the wait for a screen that always needs both, in
    // exchange for skipping one query on the rare miss.
    const [team, roster] = await Promise.all([
      context.supabase
        .from("teams")
        .select("id, name, short_name, status")
        .eq("id", data.teamId)
        .maybeSingle(),

      context.supabase
        .from("team_memberships")
        .select("person_id, role, shirt_number, status, people(first_name, last_name)")
        .eq("team_id", data.teamId),
    ]);

    if (team.error) throw new Error(team.error.message);
    if (!team.data) return null;
    if (roster.error) throw new Error(roster.error.message);

    const members = ((roster.data ?? []) as unknown as MemberRow[])
      .map((r) => ({
        personId: r.person_id,
        firstName: r.people?.first_name ?? "",
        lastName: r.people?.last_name ?? "",
        role: r.role,
        shirtNumber: r.shirt_number,
        status: r.status,
      }))
      .sort((a, b) => a.lastName.localeCompare(b.lastName));

    const t = team.data as {
      id: string;
      name: string;
      short_name: string | null;
      status: EntityStatus;
    };
    return {
      team: {
        id: t.id,
        name: t.name,
        shortName: t.short_name,
        status: t.status,
        playerCount: members.filter((m) => m.status === "active").length,
      },
      members,
    };
  });

const memberInput = z.object({
  orgSlug,
  teamId: uuid,
  personId: uuid,
  role: z.enum(["player", "captain", "coach", "manager"]),
  shirtNumber: optionalNumber(0, 999),
  status: z.enum(["active", "inactive"]),
});

export const upsertTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => memberInput.parse(input))
  .handler(async ({ data, context }): Promise<{ personId: string }> => {
    const { orgId } = await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    // org_id is sent for the not-null constraint, but a database trigger
    // overwrites it with the team's own org — so passing another league's id
    // here achieves nothing.
    const { error } = await context.supabase.from("team_memberships").upsert(
      {
        team_id: data.teamId,
        person_id: data.personId,
        org_id: orgId,
        role: data.role,
        shirt_number: data.shirtNumber,
        status: data.status,
      },
      { onConflict: "team_id,person_id" },
    );

    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new Error("SHIRT_TAKEN");
      throw new Error(error.message);
    }
    return { personId: data.personId };
  });

export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orgSlug, teamId: uuid, personId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ personId: string }> => {
    await requireOrgEditor(context.supabase, context.userId, data.orgSlug);

    const { error } = await context.supabase
      .from("team_memberships")
      .delete()
      .eq("team_id", data.teamId)
      .eq("person_id", data.personId);

    if (error) throw new Error(error.message);
    return { personId: data.personId };
  });
