import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  createAvailability,
  deleteAvailability,
  type AvailabilityRow,
} from "./scheduling.functions";
import { Button, ErrorNote, Input, Select } from "@/components/ui/controls";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * The weekly windows one pitch is free. Shown inside the venue it belongs to,
 * because "when is this pitch free" is only ever asked about a specific pitch.
 */
export function PitchAvailability({
  orgSlug,
  pitchId,
  windows,
  canEdit,
}: {
  orgSlug: string;
  pitchId: string;
  windows: AvailabilityRow[];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const [weekday, setWeekday] = useState("6");
  const [startsAt, setStartsAt] = useState("09:00");
  const [endsAt, setEndsAt] = useState("15:00");
  const [slotMinutes, setSlotMinutes] = useState("60");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["availability", orgSlug] });

  const add = useMutation({
    mutationFn: () =>
      createAvailability({ data: { orgSlug, pitchId, weekday, startsAt, endsAt, slotMinutes } }),
    onSuccess: async () => {
      await invalidate();
      setOpen(false);
    },
  });

  const drop = useMutation({
    mutationFn: (id: string) => deleteAvailability({ data: { orgSlug, id } }),
    onSuccess: invalidate,
  });

  const message = add.error instanceof Error ? add.error.message : null;
  const addError = message?.includes("END_BEFORE_START")
    ? t("availability.endBeforeStart")
    : message
      ? t("common.saveFailed")
      : null;

  return (
    <div className="mt-2 ml-4">
      {windows.length > 0 ? (
        <ul className="space-y-1">
          {windows.map((window) => (
            <li
              key={window.id}
              className="text-muted-foreground flex items-center justify-between gap-3 text-xs"
            >
              <span>
                {t("availability.summary", {
                  weekday: t(`weekdays.${window.weekday}`),
                  from: window.startsAt,
                  to: window.endsAt,
                  minutes: window.slotMinutes,
                })}
              </span>
              {canEdit && (
                <Button
                  variant="ghost"
                  className="text-destructive px-2 py-1"
                  disabled={drop.isPending}
                  onClick={() => drop.mutate(window.id)}
                >
                  {t("common.remove")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">{t("availability.none")}</p>
      )}

      {canEdit && !open && (
        <Button variant="ghost" className="mt-1 px-2 py-1 text-xs" onClick={() => setOpen(true)}>
          {t("availability.add")}
        </Button>
      )}

      {canEdit && open && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Select
            value={weekday}
            onChange={(e) => setWeekday(e.target.value)}
            className="w-32 py-1 text-xs"
            aria-label={t("availability.weekday")}
          >
            {WEEKDAYS.map((day) => (
              <option key={day} value={day}>
                {t(`weekdays.${day}`)}
              </option>
            ))}
          </Select>
          <Input
            type="time"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="w-28 py-1 text-xs"
            aria-label={t("availability.from")}
          />
          <Input
            type="time"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="w-28 py-1 text-xs"
            aria-label={t("availability.to")}
          />
          <Input
            type="number"
            min={10}
            max={480}
            step={5}
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(e.target.value)}
            className="w-20 py-1 text-xs"
            aria-label={t("availability.slotMinutes")}
          />
          <Button
            type="submit"
            variant="secondary"
            className="py-1 text-xs"
            disabled={add.isPending}
          >
            {t("common.add")}
          </Button>
          <Button variant="ghost" className="py-1 text-xs" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          {addError && (
            <div className="w-full">
              <ErrorNote>{addError}</ErrorNote>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
