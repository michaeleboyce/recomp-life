"use client";

import { Activity, Dumbbell, Footprints, House, Scale, Trophy } from "lucide-react";
import { ListRow } from "@/components/ui/list-row";
import { formatDuration, formatLbs } from "@/components/LogEdit/format";
import { workoutTitle } from "@/components/LogEdit";
import { describeActivity } from "@/lib/activities";
import type { RunCategory, RunType } from "@/types";
import { workoutResultLine, type LogEntry } from "./logEntries";

const TIME_OF_DAY = { morning: "Morning", evening: "Evening", other: "Other time" } as const;
// Same words as the effort picker the entry was logged with.
const EFFORT = ["", "easy effort", "light effort", "moderate effort", "hard effort", "all-out effort"];
const RUN_TYPE: Record<RunType, string> = { outdoor: "Outdoor", treadmill: "Treadmill", trail: "Trail" };
const RUN_CATEGORY: Record<RunCategory, string> = {
  easy: "easy",
  tempo: "tempo",
  intervals: "intervals",
  long: "long",
  other: "other",
};

const iconClass = "size-5 text-muted-foreground";

function minutes(value: number): string {
  return formatDuration(value * 60);
}

function cardioSubtitle(distanceMiles: number | null, durationMinutes: number, effort: number): string {
  return [
    distanceMiles != null ? `${formatLbs(distanceMiles)} mi` : null,
    minutes(durationMinutes),
    EFFORT[effort] ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * One log entry as a row. A workout links to its detail page; every other entry calls
 * `onOpen` so the screen can show its edit sheet.
 */
export function LogEntryRow({
  entry,
  hasPR = false,
  onOpen,
}: {
  entry: LogEntry;
  /** The workout set a new best estimated 1RM against earlier sessions. */
  hasPR?: boolean;
  onOpen: (entry: LogEntry) => void;
}) {
  switch (entry.kind) {
    case "workout": {
      const w = entry.row;
      const LocationIcon = w.location === "home" ? House : Dumbbell;
      return (
        <ListRow
          href={`/log/workout/${encodeURIComponent(w.id)}`}
          leading={<LocationIcon className={iconClass} aria-hidden="true" />}
          title={workoutTitle(w)}
          subtitle={`${w.location === "home" ? "Home" : "Gym"} · ${workoutResultLine(w)}`}
          trailing={
            hasPR ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                <Trophy className="size-3.5" aria-hidden="true" />
                PR
              </span>
            ) : undefined
          }
        />
      );
    }
    case "run": {
      const r = entry.row;
      return (
        <ListRow
          onClick={() => onOpen(entry)}
          leading={<Footprints className={iconClass} aria-hidden="true" />}
          title={`${RUN_TYPE[r.type] ?? "Run"} run, ${RUN_CATEGORY[r.category] ?? r.category}`}
          subtitle={cardioSubtitle(r.distanceMiles, r.durationMinutes, r.perceivedEffort)}
        />
      );
    }
    case "activity": {
      const a = entry.row;
      return (
        <ListRow
          onClick={() => onOpen(entry)}
          leading={<Activity className={iconClass} aria-hidden="true" />}
          title={describeActivity(a)}
          subtitle={cardioSubtitle(a.distanceMiles, a.durationMinutes, a.perceivedEffort)}
        />
      );
    }
    case "weighIn": {
      const b = entry.row;
      return (
        <ListRow
          onClick={() => onOpen(entry)}
          leading={<Scale className={iconClass} aria-hidden="true" />}
          title="Weigh-in"
          subtitle={TIME_OF_DAY[b.timeOfDay] ?? undefined}
          value={`${formatLbs(b.weight)} lbs`}
        />
      );
    }
  }
}
