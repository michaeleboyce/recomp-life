// Data layer: importing from Apple Health. Reads through a HealthSource (the
// native plugin, or a fake in tests), maps with the pure functions in
// src/lib/health, and writes ordinary log rows. Importing the same period twice
// changes nothing: imported rows have ids derived from Apple Health's own.
import type { Table } from "dexie";
import { db } from "@/db/local";
import { dailyRowId, foldDaily, sameDailyValues } from "@/lib/health/daily";
import { findManualMatch } from "@/lib/health/dedupe";
import { linkSessionWorkout } from "@/lib/health/linkSession";
import { importedRowId, isStrengthWorkout, mapWorkout } from "@/lib/health/mapWorkout";
import { nightlySleep } from "@/lib/health/sleep";
import type {
  HealthCategory,
  HealthDailyValues,
  HealthRange,
  HealthSource,
  HealthWorkout,
} from "@/lib/health/types";
import { kgToLbs } from "@/lib/health/units";
import { watchDataFields } from "@/lib/sync/workoutMerge";
import type { HealthDailyLog, TimeOfDay } from "@/types";
import { editStamps, newRowStamps } from "./stamp";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface HealthImportOptions {
  /** The groups of data to import. */
  categories: readonly HealthCategory[];
  /** Import everything recorded from this moment on. */
  since: Date;
  now: Date;
}

export interface HealthImportResult {
  /** Weigh-ins added. */
  weighIns: number;
  /** Runs added. */
  runs: number;
  /** Other activities added. */
  activities: number;
  /** Hand-logged runs and activities recognised as the same session and linked. */
  matched: number;
  /** Lifting sessions that gained or changed their watch workout. */
  sessions: number;
  /** Days whose health values were added or changed. */
  days: number;
}

const emptyResult = (): HealthImportResult => ({
  weighIns: 0,
  runs: 0,
  activities: 0,
  matched: 0,
  sessions: 0,
  days: 0,
});

/** Morning before noon, evening from 17:00, otherwise "other". */
function timeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour >= 17) return "evening";
  return "other";
}

async function importWeights(source: HealthSource, range: HealthRange, now: number): Promise<number> {
  const weights = await source.readWeights(range);
  let added = 0;
  await db.transaction("rw", db.bodyweight, async () => {
    for (const sample of weights) {
      const id = importedRowId(sample.uuid);
      // A row that exists, deleted or not, is never imported again.
      if (await db.bodyweight.get(id)) continue;
      await db.bodyweight.add({
        id,
        clientId: id,
        date: sample.date,
        weight: kgToLbs(sample.kilograms),
        timeOfDay: timeOfDay(sample.date),
        source: "apple_health",
        externalId: sample.uuid,
        ...(sample.sourceName ? { sourceName: sample.sourceName } : {}),
        ...newRowStamps(now),
      });
      added++;
    }
  });
  return added;
}

/** The log fields of a mapped workout; where it came from is stored separately. */
function withoutOrigin<T extends { externalId: string; sourceName: string | null }>(
  record: T
): Omit<T, "externalId" | "sourceName"> {
  const copy: Partial<T> = { ...record };
  delete copy.externalId;
  delete copy.sourceName;
  return copy as Omit<T, "externalId" | "sourceName">;
}

/** Shared by runs and activities: link a hand-logged match, or add the imported row. */
async function importSession<T extends { id: string; date: Date; externalId?: string; updatedAt?: number; deletedAt?: number | null }>(
  table: Table<T>,
  /** Every row an import could duplicate: for an activity, rows of the same kind. */
  candidates: T[],
  workout: HealthWorkout,
  fields: Omit<T, "id" | "clientId" | "source" | "externalId" | "sourceName" | "updatedAt" | "deletedAt" | "synced">,
  now: number
): Promise<"added" | "matched" | "skipped"> {
  const id = importedRowId(workout.uuid);
  const origin = {
    externalId: workout.uuid,
    ...(workout.sourceName ? { sourceName: workout.sourceName } : {}),
  };
  // Already imported, or already linked to a hand-logged row.
  if ((await table.get(id)) || candidates.some((row) => row.externalId === workout.uuid)) {
    return "skipped";
  }
  const manual = findManualMatch(workout.start, candidates);
  if (manual) {
    // The same session, already logged by hand. A deleted one stays deleted.
    if (manual.deletedAt != null) return "skipped";
    // Keep the user's version (and its effort rating); remember which Health
    // workout it is so the next import recognises it.
    const patch = { ...origin, ...editStamps(manual, now) };
    await table.update(manual.id, patch as never);
    Object.assign(manual, patch);
    return "matched";
  }
  const row = {
    ...fields,
    id,
    clientId: id,
    source: "apple_health",
    ...origin,
    ...newRowStamps(now),
  } as unknown as T;
  await table.add(row);
  candidates.push(row);
  return "added";
}

async function importSessions(
  workouts: readonly HealthWorkout[],
  now: number,
  result: HealthImportResult
): Promise<void> {
  await db.transaction("rw", db.runs, db.activities, async () => {
    const runs = await db.runs.toArray();
    const activities = await db.activities.toArray();
    for (const workout of workouts) {
      const mapped = mapWorkout(workout);
      if (!mapped) continue;
      if (mapped.table === "runs") {
        const fields = withoutOrigin(mapped.record);
        const outcome = await importSession(db.runs, runs, workout, fields, now);
        if (outcome === "added") result.runs++;
        if (outcome === "matched") result.matched++;
      } else {
        const fields = withoutOrigin(mapped.record);
        const kind = fields.kind;
        const sameKind = activities.filter((a) => a.kind === kind);
        const outcome = await importSession(db.activities, sameKind, workout, fields, now);
        if (outcome === "added") result.activities++;
        if (outcome === "matched") result.matched++;
      }
    }
  });
}

/** Attaches each lifting session's watch workout (heart rate, energy) to it. */
async function linkSessions(
  workouts: readonly HealthWorkout[],
  range: HealthRange,
  now: number
): Promise<number> {
  const strength = workouts.filter(isStrengthWorkout);
  if (strength.length === 0) return 0;
  let linked = 0;
  await db.transaction("rw", db.workouts, async () => {
    const sessions = await db.workouts
      .where("startedAt")
      .aboveOrEqual(new Date(range.since.getTime() - DAY_MS))
      .toArray();
    for (const session of sessions) {
      if (session.deletedAt != null || !session.completedAt) continue;
      const health = linkSessionWorkout(session, strength);
      if (!health || session.health?.externalId === health.externalId) continue;
      // Stamped apart from the log, so attaching it cannot overwrite a correction made
      // on another device meanwhile (src/lib/sync/workoutMerge.ts).
      await db.workouts.update(session.id, watchDataFields(session, health, editStamps(session, now).updatedAt));
      linked++;
    }
  });
  return linked;
}

/** Writes each day's values, keeping what an earlier import stored for values not read this time. */
async function importDaily(days: readonly HealthDailyValues[], now: number): Promise<number> {
  let changed = 0;
  await db.transaction("rw", db.healthDaily, async () => {
    for (const incoming of days) {
      const id = dailyRowId(incoming.day);
      const existing = await db.healthDaily.get(id);
      if (!existing) {
        await db.healthDaily.add({ ...incoming, id, clientId: id, ...newRowStamps(now) });
        changed++;
        continue;
      }
      const merged: HealthDailyLog = { ...existing };
      for (const key of Object.keys(incoming) as (keyof HealthDailyValues)[]) {
        if (key !== "day" && incoming[key] !== null) merged[key] = incoming[key] as number;
      }
      if (sameDailyValues(existing, merged)) continue;
      await db.healthDaily.put({ ...merged, ...editStamps(existing, now) });
      changed++;
    }
  });
  return changed;
}

/**
 * Imports everything recorded since `since` in the chosen categories and
 * returns what was added. Safe to run as often as you like: nothing already
 * imported is added twice, and rows the user deleted are not brought back.
 */
export async function runHealthImport(
  source: HealthSource,
  options: HealthImportOptions
): Promise<HealthImportResult> {
  const result = emptyResult();
  const now = options.now.getTime();
  const range: HealthRange = { since: options.since, until: new Date(now + 1) };
  const wants = (category: HealthCategory) => options.categories.includes(category);

  if (wants("bodyweight")) {
    result.weighIns = await importWeights(source, range, now);
  }

  if (wants("workouts")) {
    const workouts = await source.readWorkouts(range);
    await importSessions(workouts, now, result);
    result.sessions = await linkSessions(workouts, range, now);
  }

  if (wants("sleep") || wants("daily")) {
    // A night's sleep starts the evening before the day it counts toward.
    const sleepRange = { since: new Date(range.since.getTime() - DAY_MS), until: range.until };
    const nights = wants("sleep") ? nightlySleep(await source.readSleep(sleepRange)) : [];
    const quantities = wants("daily") ? await source.readDaily(range) : [];
    result.days = await importDaily(foldDaily(quantities, nights), now);
  }

  return result;
}

/** The night of sleep counted toward a day ("YYYY-MM-DD"), in minutes; null when there is none. */
export async function getSleepMinutes(day: string): Promise<number | null> {
  const row = await db.healthDaily.get(dailyRowId(day));
  return row && row.deletedAt == null ? row.sleepMinutes : null;
}
