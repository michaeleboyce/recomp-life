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
import { ImportedSessionSheet } from "@/components/ImportedHistory/ImportedSessionSheet";
import { importedSessionSummary, type ImportedSessionSummary } from "@/components/ImportedHistory/importedView";
import {
  useActivities,
  useBodyweightLog,
  useCompletedWorkouts,
  useE1RMs,
  useFavoriteWorkouts,
  useImportedSessions,
  useRuns,
} from "@/hooks";
import { useMappingOverrides } from "@/hooks/useMappingOverrides";
import type { ImportedSessionRecord } from "@/types";
import { CalendarStrip } from "./CalendarStrip";
import { LogEntryRow } from "./LogEntryRow";
import {
  LOG_FILTERS,
  LOG_PAGE_SIZE,
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

/**
 * The whole log, newest first, with a month strip and a type filter. Imported sessions
 * from other apps sit among the entries, labelled. The list renders LOG_PAGE_SIZE
 * entries at a time ("Show more"), so years of imported history stay quick to open.
 */
export function LogHistory({ now: fixedNow }: { now?: Date }) {
  const [now] = useState(() => fixedNow ?? new Date());
  const workouts = useCompletedWorkouts();
  const favorites = useFavoriteWorkouts();
  const runs = useRuns();
  const activities = useActivities();
  const weighIns = useBodyweightLog();
  const imported = useImportedSessions();
  const overrides = useMappingOverrides();
  const e1rms = useE1RMs();

  const [filter, setFilter] = useState<LogFilter>("all");
  const [day, setDay] = useState<string | null>(null);
  const [month, setMonth] = useState(() => monthOf(now));
  const [limit, setLimit] = useState(LOG_PAGE_SIZE);
  const [editing, setEditing] = useState<EditableEntry | null>(null);
  const [viewing, setViewing] = useState<ImportedSessionRecord | null>(null);

  const entries = useMemo(
    () => buildEntries({ workouts, runs, activities, weighIns, imported }),
    [workouts, runs, activities, weighIns, imported]
  );
  const shown = useMemo(() => filterEntries(entries, filter, day), [entries, filter, day]);
  const visible = useMemo(() => shown.slice(0, limit), [shown, limit]);
  const groups = useMemo(() => groupByDay(visible), [visible]);
  // Worked out for the rendered page only, with the name choices remembered now.
  const importedSummaries = useMemo(() => {
    const byId = new Map<string, ImportedSessionSummary>();
    for (const e of visible) if (e.kind === "imported") byId.set(e.id, importedSessionSummary(e.row, overrides));
    return byId;
  }, [visible, overrides]);
  const counts = useMemo(() => countByDay(filterEntries(entries, filter)), [entries, filter]);
  const prSessions = useMemo(() => {
    const ids = new Set<string>();
    for (const w of workouts ?? []) if (sessionPRs(w.id, e1rms ?? []).length > 0) ids.add(w.id);
    return ids;
  }, [workouts, e1rms]);

  if ([workouts, runs, activities, weighIns, imported, e1rms].some((v) => v === undefined)) {
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
    setLimit(LOG_PAGE_SIZE);
    if (key) setMonth(monthOf(parseDayKey(key)));
  };
  const openEntry = (entry: LogEntry) => {
    if (entry.kind === "imported") setViewing(entry.row);
    else setEditing(editable(entry));
  };
  const older = shown.length - visible.length;

  return (
    <div className="flex flex-col gap-5">
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
        onChange={(v) => {
          setFilter(v as LogFilter);
          setLimit(LOG_PAGE_SIZE);
        }}
      />
      {day && (
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>Showing {dayLabel(parseDayKey(day), now)} only</span>
          <Button variant="ghost" className="min-h-11" onClick={() => selectDay(null)}>
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
        groups.map((group) => (
          <section key={group.key} aria-label={dayLabel(group.date, now)} className="flex flex-col">
            <SectionHeader title={dayLabel(group.date, now)} className="pb-1.5" />
            <div>
              {group.entries.map((entry) => (
                <LogEntryRow
                  key={`${entry.kind}:${entry.id}`}
                  entry={entry}
                  hasPR={entry.kind === "workout" && prSessions.has(entry.id)}
                  favorites={favorites}
                  importedSummary={importedSummaries.get(entry.id)}
                  onOpen={openEntry}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {older > 0 && (
        <Button variant="outline" className="min-h-11 w-full" onClick={() => setLimit((n) => n + LOG_PAGE_SIZE)}>
          Show more
          <span className="text-muted-foreground">({older} older)</span>
        </Button>
      )}

      {viewing && (
        <ImportedSessionSheet
          key={viewing.id}
          session={viewing}
          open
          onOpenChange={(isOpen) => !isOpen && setViewing(null)}
        />
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
