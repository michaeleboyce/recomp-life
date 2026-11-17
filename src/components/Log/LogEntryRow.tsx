"use client";

import { Activity, Dumbbell, Footprints, History, House, Scale, Trophy } from "lucide-react";
import { ListRow } from "@/components/ui/list-row";
import { FavoriteStarFor } from "@/components/Favorites/FavoriteStar";
import { ImportedTag } from "@/components/ImportedHistory/ImportedTag";
import {
  importedSessionSummary,
  importedSummaryLine,
  isImportedRow,
  type ImportedSessionSummary,
} from "@/components/ImportedHistory/importedView";
import { formatDuration, formatLbs } from "@/components/LogEdit/format";
import { workoutTitle } from "@/components/LogEdit";
import { describeActivity } from "@/lib/activities";
import type { FavoriteWorkout, RecordSource, RunCategory, RunType } from "@/types";
import { workoutResultLine, type LogEntry } from "./logEntries";
import { workoutDetailHref } from "@/lib/routes";

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

interface CardioRow {
  distanceMiles: number | null;
  durationMinutes: number;
  perceivedEffort: number | null;
  source?: RecordSource;
  sourceName?: string;
  importBatchId?: string;
}

/** "3.1 mi · 30 min · easy effort", led by the app for a row an import added ("Gravl · …"). */
function cardioSubtitle(row: CardioRow): string {
  return [
    isImportedRow(row) ? row.sourceName ?? null : null,
    row.distanceMiles != null ? `${formatLbs(row.distanceMiles)} mi` : null,
    minutes(row.durationMinutes),
    row.perceivedEffort != null ? EFFORT[row.perceivedEffort] ?? null : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * One log entry as a row. A workout links to its detail page; every other entry calls
 * `onOpen` so the screen can show its edit sheet, or an imported session's detail.
 * Rows from another app's export carry the "Imported" label.
 */
export function LogEntryRow({
  entry,
  hasPR = false,
  favorites,
  importedSummary,
  onOpen,
}: {
  entry: LogEntry;
  /** The live favourites, looked up once by the list. No star is shown without them. */
  favorites?: FavoriteWorkout[];
  /** The workout set a new best estimated 1RM against earlier sessions. */
  hasPR?: boolean;
  /** An imported session's summary, worked out once by the list (with the remembered name choices). */
  importedSummary?: ImportedSessionSummary;
  onOpen: (entry: LogEntry) => void;
}) {
  switch (entry.kind) {
    case "workout": {
      const w = entry.row;
      const LocationIcon = w.location === "home" ? House : Dumbbell;
      // The star is a sibling of the link, not inside it: a button in an anchor is invalid.
      return (
        <div className="flex items-center border-b border-border last:border-b-0">
          <ListRow
            href={workoutDetailHref(w.id)}
            className="min-w-0 flex-1 border-b-0"
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
          <FavoriteStarFor session={w} favorites={favorites} />
        </div>
      );
    }
    case "run": {
      const r = entry.row;
      return (
        <ListRow
          onClick={() => onOpen(entry)}
          leading={<Footprints className={iconClass} aria-hidden="true" />}
          title={`${RUN_TYPE[r.type] ?? "Run"} run, ${RUN_CATEGORY[r.category] ?? r.category}`}
          subtitle={cardioSubtitle(r)}
          trailing={isImportedRow(r) ? <ImportedTag /> : undefined}
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
          subtitle={cardioSubtitle(a)}
          trailing={isImportedRow(a) ? <ImportedTag /> : undefined}
        />
      );
    }
    case "imported": {
      const summary = importedSummary ?? importedSessionSummary(entry.row);
      return (
        <ListRow
          onClick={() => onOpen(entry)}
          leading={<History className={iconClass} aria-hidden="true" />}
          title={summary.title}
          subtitle={importedSummaryLine(summary)}
          trailing={<ImportedTag />}
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
