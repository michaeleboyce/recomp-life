"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarSearch, NotebookPen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { EntryEditSheet, type EditableEntry } from "@/components/LogEdit";
import { useActivities, useBodyweightLog, useCompletedWorkouts, useE1RMs, useRuns } from "@/hooks";
import { CalendarStrip } from "./CalendarStrip";
import { LogEntryRow } from "./LogEntryRow";
import {
  LOG_FILTERS,
  buildEntries,
  countByDay,
  dayLabel,
  filterEntries,
  groupByDay,
  monthOf,
  parseDayKey,
  type LogEntry,
  type LogFilter,
} from "./logEntries";
import { sessionPRs } from "./prs";

function editable(entry: LogEntry): EditableEntry | null {
  if (entry.kind === "run") return { table: "runs", row: entry.row };
  if (entry.kind === "activity") return { table: "activities", row: entry.row };
  if (entry.kind === "weighIn") return { table: "bodyweight", row: entry.row };
  return null;
}

/** The whole log, newest first, with a month strip and a type filter. */
export function LogHistory({ now: fixedNow }: { now?: Date }) {
  const [now] = useState(() => fixedNow ?? new Date());
  const workouts = useCompletedWorkouts();
  const runs = useRuns();
  const activities = useActivities();
  const weighIns = useBodyweightLog();
  const e1rms = useE1RMs();

  const [filter, setFilter] = useState<LogFilter>("all");
  const [day, setDay] = useState<string | null>(null);
  const [month, setMonth] = useState(() => monthOf(now));
  const [editing, setEditing] = useState<EditableEntry | null>(null);

  const entries = useMemo(
    () => buildEntries({ workouts, runs, activities, weighIns }),
    [workouts, runs, activities, weighIns]
  );
  const shown = useMemo(() => filterEntries(entries, filter, day), [entries, filter, day]);
  const counts = useMemo(() => countByDay(filterEntries(entries, filter)), [entries, filter]);
  const prSessions = useMemo(() => {
    const ids = new Set<string>();
    for (const w of workouts ?? []) if (sessionPRs(w.id, e1rms ?? []).length > 0) ids.add(w.id);
    return ids;
  }, [workouts, e1rms]);

  if ([workouts, runs, activities, weighIns, e1rms].some((v) => v === undefined)) {
    return <SkeletonCard />;
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<NotebookPen />}
        title="Nothing logged yet"
        body="Finished workouts, runs, activities and weigh-ins show up here, newest first."
        action={
          <Button asChild>
            <Link href="/workout/configure">Start a workout</Link>
          </Button>
        }
      />
    );
  }

  const selectDay = (key: string | null) => {
    setDay(key);
    if (key) setMonth(monthOf(parseDayKey(key)));
  };

  return (
    <div className="flex flex-col gap-4">
      <CalendarStrip
        month={month}
        onMonthChange={setMonth}
        counts={counts}
        selectedDay={day}
        onSelectDay={selectDay}
        today={now}
      />
      <ChipGroup
        ariaLabel="Show"
        size="sm"
        options={LOG_FILTERS}
        value={filter}
        onChange={(v) => setFilter(v as LogFilter)}
      />
      {day && (
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>Showing {dayLabel(parseDayKey(day), now)} only</span>
          <Button variant="ghost" className="min-h-11" onClick={() => setDay(null)}>
            <X className="size-4" aria-hidden="true" />
            Show all days
          </Button>
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={<CalendarSearch />}
          title="Nothing matches"
          body={
            day
              ? "Nothing of this kind was logged that day. Choose another filter or show all days."
              : "Nothing of this kind is logged yet. Choose another filter."
          }
        />
      ) : (
        groupByDay(shown).map((group) => (
          <section key={group.key} aria-label={dayLabel(group.date, now)} className="flex flex-col">
            <SectionHeader title={dayLabel(group.date, now)} className="pb-1" />
            <div>
              {group.entries.map((entry) => (
                <LogEntryRow
                  key={`${entry.kind}:${entry.id}`}
                  entry={entry}
                  hasPR={entry.kind === "workout" && prSessions.has(entry.id)}
                  onOpen={(e) => setEditing(editable(e))}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {editing && (
        <EntryEditSheet
          key={`${editing.table}:${editing.row.id}`}
          entry={editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
    </div>
  );
}
