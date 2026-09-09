import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  addMatchEvent,
  deleteMatchEvent,
  listEventTypes,
  listMatchEvents,
  saveResult,
  scheduleMatch,
} from "./fixture.functions";
import { MATCH_STATUSES, type MatchRow, type MatchStatus } from "./types";
import type { Person } from "@/features/catalog/types";
import type { Venue } from "@/features/catalog/types";
import { formatKickoff, isoToZonedInput, zonedInputToIso } from "@/lib/time/zoned";
import { Button, ErrorNote, Field, Input, Select, Td } from "@/components/ui/controls";

interface Props {
  match: MatchRow;
  orgSlug: string;
  competitionId: string;
  timeZone: string;
  canEdit: boolean;
  venues: Venue[];
  people: Person[];
}

export function MatchCard({
  match,
  orgSlug,
  competitionId,
  timeZone,
  canEdit,
  venues,
  people,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const [status, setStatus] = useState<MatchStatus>(match.status);
  const [homeScore, setHomeScore] = useState(match.homeScore?.toString() ?? "");
  const [awayScore, setAwayScore] = useState(match.awayScore?.toString() ?? "");
  const [kickoff, setKickoff] = useState(isoToZonedInput(match.kickoffAt, timeZone));
  const [pitchId, setPitchId] = useState(match.pitchId ?? "");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["matches", competitionId] });

  const save = useMutation({
    mutationFn: async () => {
      await scheduleMatch({
        data: {
          orgSlug,
          matchId: match.id,
          // The typed digits belong to the league's zone, not the browser's.
          kickoffAt: kickoff ? (zonedInputToIso(kickoff, timeZone) ?? "") : "",
          pitchId,
        },
      });
      await saveResult({
        data: { orgSlug, matchId: match.id, status, homeScore, awayScore, notes: "" },
      });
    },
    onSuccess: async () => {
      await refresh();
      setOpen(false);
    },
  });

  const message = save.error instanceof Error ? save.error.message : null;
  const saveError = message?.includes("SCORE_REQUIRED")
    ? t("fixture.scoreRequired")
    : message
      ? t("common.saveFailed")
      : null;

  const pitches = venues.flatMap((v) => v.pitches.map((p) => ({ ...p, venueName: v.name })));
  const scoreLine =
    match.homeScore !== null && match.awayScore !== null
      ? `${match.homeScore} – ${match.awayScore}`
      : "—";

  return (
    <>
      <tr>
        <Td>{match.round ?? "—"}</Td>
        <Td className="font-medium">{match.homeTeamName ?? "—"}</Td>
        <Td className="font-medium">{match.awayTeamName ?? "—"}</Td>
        <Td className="whitespace-nowrap">{formatKickoff(match.kickoffAt, timeZone) || "—"}</Td>
        <Td>{match.pitchName ?? "—"}</Td>
        <Td className="whitespace-nowrap">{scoreLine}</Td>
        <Td className="text-right">
          {canEdit && (
            <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
              {open ? t("common.done") : t("fixture.enterResult")}
            </Button>
          )}
        </Td>
      </tr>

      {open && canEdit && (
        <tr>
          <td colSpan={7} className="border-border bg-muted/40 border-b px-4 py-4">
            <form
              className="grid gap-4 sm:grid-cols-5"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <Field label={t("fixture.kickoff")} className="sm:col-span-2">
                <Input
                  type="datetime-local"
                  value={kickoff}
                  onChange={(e) => setKickoff(e.target.value)}
                />
              </Field>
              <Field label={t("fixture.pitch")} className="sm:col-span-2">
                <Select value={pitchId} onChange={(e) => setPitchId(e.target.value)}>
                  <option value="">{t("fixture.noPitch")}</option>
                  {pitches.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.venueName} · {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("common.status")}>
                <Select value={status} onChange={(e) => setStatus(e.target.value as MatchStatus)}>
                  {MATCH_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={`${match.homeTeamName ?? ""} ${t("fixture.score")}`}>
                <Input
                  type="number"
                  min={0}
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                />
              </Field>
              <Field label={`${match.awayTeamName ?? ""} ${t("fixture.score")}`}>
                <Input
                  type="number"
                  min={0}
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                />
              </Field>
              <div className="flex items-end gap-2 sm:col-span-3">
                <Button type="submit" disabled={save.isPending}>
                  {t("common.save")}
                </Button>
              </div>
              {saveError && (
                <div className="sm:col-span-5">
                  <ErrorNote>{saveError}</ErrorNote>
                </div>
              )}
            </form>

            <MatchEvents
              matchId={match.id}
              orgSlug={orgSlug}
              match={match}
              people={people}
              onChanged={refresh}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function MatchEvents({
  matchId,
  orgSlug,
  match,
  people,
  onChanged,
}: {
  matchId: string;
  orgSlug: string;
  match: MatchRow;
  people: Person[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [teamId, setTeamId] = useState(match.homeTeamId ?? "");
  const [personId, setPersonId] = useState("");
  const [eventTypeId, setEventTypeId] = useState("");
  const [minute, setMinute] = useState("");

  const eventTypes = useQuery({ queryKey: ["event-types"], queryFn: () => listEventTypes() });
  const events = useQuery({
    queryKey: ["match-events", matchId],
    queryFn: () => listMatchEvents({ data: { orgSlug, matchId } }),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["match-events", matchId] });
    onChanged();
  };

  const add = useMutation({
    mutationFn: () =>
      addMatchEvent({
        data: {
          orgSlug,
          matchId,
          teamId,
          personId,
          eventTypeId: eventTypeId || (eventTypes.data?.[0]?.id ?? ""),
          minute,
        },
      }),
    onSuccess: async () => {
      await invalidate();
      setPersonId("");
      setMinute("");
    },
  });

  const drop = useMutation({
    mutationFn: (id: string) => deleteMatchEvent({ data: { orgSlug, id } }),
    onSuccess: invalidate,
  });

  const teams = [
    { id: match.homeTeamId, name: match.homeTeamName },
    { id: match.awayTeamId, name: match.awayTeamName },
  ].filter((x): x is { id: string; name: string } => x.id !== null);

  return (
    <div className="border-border mt-5 border-t pt-4">
      <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {t("fixture.events")}
      </h4>
      <p className="text-muted-foreground mt-1 text-xs">{t("fixture.eventsHelp")}</p>

      {events.data && events.data.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {events.data.map((event) => (
            <li key={event.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {event.minute !== null ? `${event.minute}' · ` : ""}
                {event.eventName}
                {event.personName ? ` · ${event.personName}` : ""}
              </span>
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={drop.isPending}
                onClick={() => drop.mutate(event.id)}
              >
                {t("common.remove")}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-2 text-sm">{t("fixture.noEvents")}</p>
      )}

      <form
        className="mt-3 grid gap-3 sm:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (teamId) add.mutate();
        }}
      >
        <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </Select>
        <Select
          value={eventTypeId || (eventTypes.data?.[0]?.id ?? "")}
          onChange={(e) => setEventTypeId(e.target.value)}
        >
          {(eventTypes.data ?? []).map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </Select>
        <Select value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">{t("fixture.player")}</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.lastName}, {person.firstName}
            </option>
          ))}
        </Select>
        <Input
          type="number"
          min={0}
          max={200}
          placeholder={t("fixture.minute")}
          value={minute}
          onChange={(e) => setMinute(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={add.isPending || !teamId}>
          {t("fixture.addEvent")}
        </Button>
      </form>
    </div>
  );
}
