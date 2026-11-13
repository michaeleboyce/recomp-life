// Pure helpers for the Log screen: one list of entries from every log table, the
// filter, grouping by day and the month calendar. No React, no database.
import { liftName } from "@/components/LogEdit/format";
import { workingSetsFor } from "@/lib/workout/setSelectors";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { ActivityLog, BodyweightLog, RunLog, WorkoutSession } from "@/types";

export type LogEntry =
  | { kind: "workout"; id: string; date: Date; row: WorkoutSession }
  | { kind: "run"; id: string; date: Date; row: RunLog }
  | { kind: "activity"; id: string; date: Date; row: ActivityLog }
  | { kind: "weighIn"; id: string; date: Date; row: BodyweightLog };

export type LogFilter = "all" | "workouts" | "cardio" | "weighIns";

export const LOG_FILTERS: { value: LogFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "workouts", label: "Workouts" },
  { value: "cardio", label: "Cardio & activity" },
  { value: "weighIns", label: "Weigh-ins" },
];

export interface LogSources {
  workouts?: WorkoutSession[];
  runs?: RunLog[];
  activities?: ActivityLog[];
  weighIns?: BodyweightLog[];
}

function validDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Every entry with a readable date, newest first. Workouts are dated when they started. */
export function buildEntries(sources: LogSources): LogEntry[] {
  const entries: LogEntry[] = [];
  const add = (entry: Omit<LogEntry, "date"> & { date: Date | string | null }) => {
    const date = validDate(entry.date);
    if (date) entries.push({ ...entry, date } as LogEntry);
  };
  for (const row of sources.workouts ?? []) add({ kind: "workout", id: row.id, date: row.startedAt, row });
  for (const row of sources.runs ?? []) add({ kind: "run", id: row.id, date: row.date, row });
  for (const row of sources.activities ?? []) add({ kind: "activity", id: row.id, date: row.date, row });
  for (const row of sources.weighIns ?? []) add({ kind: "weighIn", id: row.id, date: row.date, row });
  return entries.sort(
    (a, b) => b.date.getTime() - a.date.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

const KINDS_BY_FILTER: Record<LogFilter, LogEntry["kind"][]> = {
  all: ["workout", "run", "activity", "weighIn"],
  workouts: ["workout"],
  cardio: ["run", "activity"],
  weighIns: ["weighIn"],
};

/** Entries of the filter's kinds, on `day` only when one is given. */
export function filterEntries(entries: LogEntry[], filter: LogFilter, day: string | null = null): LogEntry[] {
  const kinds = KINDS_BY_FILTER[filter];
  return entries.filter((e) => kinds.includes(e.kind) && (day === null || dayKey(e.date) === day));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-10": the local calendar day of a date. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface DayGroup {
  key: string;
  date: Date;
  entries: LogEntry[];
}

/** Consecutive entries on the same local day, keeping the input order. */
export function groupByDay(entries: LogEntry[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const entry of entries) {
    const key = dayKey(entry.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, date: entry.date, entries: [entry] });
  }
  return groups;
}

/** How many entries fall on each local day. */
export function countByDay(entries: LogEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = dayKey(entry.date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** A calendar month; `month` is 0-based like `Date.getMonth()`. */
export interface Month {
  year: number;
  month: number;
}

export function monthOf(date: Date): Month {
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function shiftMonth({ year, month }: Month, delta: number): Month {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** Every day of the month, at local midnight. */
export function daysInMonth({ year, month }: Month): Date[] {
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => new Date(year, month, i + 1));
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const DAY_LABEL = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const YEAR_DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function monthLabel({ year, month }: Month): string {
  return MONTH_LABEL.format(new Date(year, month, 1));
}

/** "Today", "Yesterday", "Tue, Nov 10", or with the year when it is not this year. */
export function dayLabel(date: Date, now: Date): string {
  const key = dayKey(date);
  if (key === dayKey(now)) return "Today";
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === dayKey(yesterday)) return "Yesterday";
  return date.getFullYear() === now.getFullYear() ? DAY_LABEL.format(date) : YEAR_DAY_LABEL.format(date);
}

/** The day key back to a local date. */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** True when every working set of a lift reached its target reps and completed normally. */
function targetsHit(session: WorkoutSession, exerciseId: string, tier: "T1" | "T2" | "T3"): boolean | null {
  const sets = workingSetsFor(session.sets ?? [], exerciseId, tier);
  if (sets.length === 0) return null;
  return sets.every((s) => s.status === "completed" && s.actualReps >= s.targetReps);
}

/**
 * One line for a workout row: its main lifts with the top working weight, then
 * whether every target was hit, e.g. "Squat 195 lbs, Bench Press 135 lbs · all targets hit".
 */
export function workoutResultLine(session: WorkoutSession): string {
  const template = WORKOUT_TEMPLATES[session.templateId];
  const lifts = (template?.exercises ?? []).filter(
    (ex): ex is typeof ex & { tier: "T1" | "T2" | "T3" } =>
      ex.tier === "T1" || ex.tier === "T2" || ex.tier === "T3"
  );
  const parts: string[] = [];
  const missed: string[] = [];
  let anyDone = false;
  for (const ex of lifts) {
    if (ex.tier === "T3") continue;
    const sets = workingSetsFor(session.sets ?? [], ex.exerciseId, ex.tier);
    if (sets.length === 0) continue;
    parts.push(`${liftName(ex.exerciseId)} ${Math.max(...sets.map((s) => s.weight))} lbs`);
  }
  for (const ex of lifts) {
    const hit = targetsHit(session, ex.exerciseId, ex.tier);
    if (hit === null) continue;
    anyDone = true;
    if (!hit) missed.push(liftName(ex.exerciseId));
  }
  const outcome = !anyDone
    ? "no sets logged"
    : missed.length === 0
      ? "all targets hit"
      : `missed reps on ${missed.join(", ")}`;
  return parts.length > 0 ? `${parts.join(", ")} · ${outcome}` : outcome;
}
