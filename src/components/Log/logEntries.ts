// Pure helpers for the Log screen: one list of entries from every log table, the
// filter, grouping by day and the month calendar. No React, no database.
import { localDayKey } from "@/lib/dates";
import { isImportedRow } from "@/components/ImportedHistory/importedView";
import { liftName } from "@/components/LogEdit/format";
import { displayLiftName } from "@/components/Today/todayModel";
import { EXERCISES } from "@/lib/exercises";
import { workingSetsFor } from "@/lib/workout/setSelectors";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { ActivityLog, BodyweightLog, ImportedSessionRecord, RunLog, SetLog, WorkoutSession } from "@/types";

export type LogEntry =
  | { kind: "workout"; id: string; date: Date; row: WorkoutSession }
  | { kind: "run"; id: string; date: Date; row: RunLog }
  | { kind: "activity"; id: string; date: Date; row: ActivityLog }
  | { kind: "weighIn"; id: string; date: Date; row: BodyweightLog }
  /** A strength session from another app's export: history, never a GZCLP workout. */
  | { kind: "imported"; id: string; date: Date; row: ImportedSessionRecord };

export type LogFilter = "all" | "workouts" | "cardio" | "weighIns" | "imported";

export const LOG_FILTERS: { value: LogFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "workouts", label: "Workouts" },
  { value: "cardio", label: "Cardio & activity" },
  { value: "weighIns", label: "Weigh-ins" },
  { value: "imported", label: "Imported" },
];

/** How many entries the Log renders at first, and how many more each "Show more" adds. */
export const LOG_PAGE_SIZE = 60;

export interface LogSources {
  workouts?: WorkoutSession[];
  runs?: RunLog[];
  activities?: ActivityLog[];
  weighIns?: BodyweightLog[];
  imported?: ImportedSessionRecord[];
}

/** An entry from another app's export: an imported session, or a run or activity an import added. */
export function isImportedEntry(entry: LogEntry): boolean {
  if (entry.kind === "imported") return true;
  if (entry.kind === "run" || entry.kind === "activity") return isImportedRow(entry.row);
  return false;
}

function validDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Every entry with a readable date, newest first. Workouts and imported sessions are
 * dated when they started.
 */
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
  for (const row of sources.imported ?? []) add({ kind: "imported", id: row.id, date: row.startedAt, row });
  return entries.sort(
    (a, b) => b.date.getTime() - a.date.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * The kinds each filter keeps. "Workouts" are the app's own; an imported run is still
 * a run. "Imported" is by origin instead (`isImportedEntry`).
 */
const KINDS_BY_FILTER: Record<Exclude<LogFilter, "imported">, LogEntry["kind"][]> = {
  all: ["workout", "run", "activity", "weighIn", "imported"],
  workouts: ["workout"],
  cardio: ["run", "activity"],
  weighIns: ["weighIn"],
};

/** Entries of the filter's kinds, on `day` only when one is given. */
export function filterEntries(entries: LogEntry[], filter: LogFilter, day: string | null = null): LogEntry[] {
  const keep =
    filter === "imported" ? isImportedEntry : (e: LogEntry) => KINDS_BY_FILTER[filter].includes(e.kind);
  return entries.filter((e) => keep(e) && (day === null || dayKey(e.date) === day));
}

/** "2026-11-10": the local calendar day of a date. */
export const dayKey = localDayKey;

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
 * The exercise a lift's sets were performed as: the home substitute when they were
 * substituted (with whether its weight is per hand), else the lift itself.
 */
function performedAs(sets: readonly SetLog[], exerciseId: string): { name: string; perHand: boolean } {
  const substitute = sets.find((s) => s.substituteExerciseId && EXERCISES[s.substituteExerciseId])?.substituteExerciseId;
  return substitute
    ? { name: displayLiftName(substitute), perHand: EXERCISES[substitute]?.grip === "per_hand" }
    : { name: liftName(exerciseId), perHand: false };
}

/**
 * The program lifts this session swapped for something else, before it started (a `swap`
 * edit) or part-way (a replacement added with `replaces`), as "Squat swapped for Goblet
 * squat". One line per lift, naming every exercise that replaced it.
 */
function swapLines(session: WorkoutSession, liftIds: readonly string[]): string[] {
  const replaced = new Map<string, string[]>();
  const note = (from: string, to: string) => {
    if (!liftIds.includes(from) || !EXERCISES[to]) return;
    const list = replaced.get(from) ?? [];
    if (!list.includes(to)) replaced.set(from, [...list, to]);
  };
  for (const edit of session.planEdits ?? []) {
    if (edit.kind === "swap") note(edit.exerciseId, edit.replacementId);
    if (edit.kind === "add" && edit.replaces) note(edit.replaces.exerciseId, edit.exerciseId);
  }
  return [...replaced].map(([from, to]) => `${liftName(from)} swapped for ${to.map(displayLiftName).join(" and ")}`);
}

/**
 * One line for a workout row: its main lifts with the top working weight, then
 * whether every target was hit, e.g. "Squat 195 lbs, Bench Press 135 lbs · all targets hit".
 * A lift swapped for another exercise says so in place of "all targets hit": the sets it
 * did log may have hit their reps, but the lift was not done as planned.
 * A lift done as a home exercise is named as that exercise, at its weight as lifted:
 * "Bulgarian split squat 80 lbs a hand".
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
    const { name, perHand } = performedAs(sets, ex.exerciseId);
    parts.push(`${name} ${Math.max(...sets.map((s) => s.weight))} lbs${perHand ? " a hand" : ""}`);
  }
  for (const ex of lifts) {
    const hit = targetsHit(session, ex.exerciseId, ex.tier);
    if (hit === null) continue;
    anyDone = true;
    if (!hit) missed.push(performedAs(workingSetsFor(session.sets ?? [], ex.exerciseId, ex.tier), ex.exerciseId).name);
  }
  const swapped = swapLines(session, lifts.map((ex) => ex.exerciseId));
  const notes = [...(missed.length > 0 ? [`missed reps on ${missed.join(", ")}`] : []), ...swapped];
  const outcome = !anyDone ? "no sets logged" : notes.length === 0 ? "all targets hit" : notes.join(" · ");
  return parts.length > 0 ? `${parts.join(", ")} · ${outcome}` : outcome;
}
