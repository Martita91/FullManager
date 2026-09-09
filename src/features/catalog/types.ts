export type EntityStatus = "active" | "inactive";
export type SeasonStatus = "draft" | "active" | "archived";
export type TeamRole = "player" | "captain" | "coach" | "manager";

export const ENTITY_STATUSES: readonly EntityStatus[] = ["active", "inactive"];
export const SEASON_STATUSES: readonly SeasonStatus[] = ["draft", "active", "archived"];
export const TEAM_ROLES: readonly TeamRole[] = ["player", "captain", "coach", "manager"];

export interface Sport {
  id: string;
  key: string;
  name: string;
}

export interface Season {
  id: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  status: SeasonStatus;
}

export interface Division {
  id: string;
  sportId: string;
  sportName: string;
  name: string;
  status: EntityStatus;
}

export interface Team {
  id: string;
  name: string;
  shortName: string | null;
  status: EntityStatus;
  /** Active roster size, for the list screen. */
  playerCount: number;
}

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  status: EntityStatus;
  /** True once the person has claimed their profile in the player app. */
  claimed: boolean;
}

export interface TeamMember {
  personId: string;
  firstName: string;
  lastName: string;
  role: TeamRole;
  shirtNumber: number | null;
  status: EntityStatus;
}

export interface Pitch {
  id: string;
  name: string;
  surface: string | null;
  status: EntityStatus;
}

export interface Venue {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  status: EntityStatus;
  pitches: Pitch[];
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}
