/**
 * Imported sessions as lift history, for the screens that show it beside the app's own
 * log: the lift page, the projection, the Strength tab and Today's cards. Pure.
 *
 * Per exercise, one entry per imported session: its estimated max by the app's own
 * formula and limits (`sessionEstimates`: warm-ups and drops never give one, an effort
 * word is read as `effortRpe` reads it), its heaviest working set, its volume. The points
 * built from them are marked `imported`, so a chart can draw them apart and a best
 * among them is never taken for a new best in the app: the new-best chances, the
 * forecasts and the program itself read the app's own workouts only.
 *
 * The sets are the imported ones in any list of strength evidence (`imported` set), as
 * mapped when the list was made (`importedStrengthSets` with the remembered choices).
 *
 * @evidence e1rm-estimate
 * @evidence strength-pooling
 */
import type { Point, Series } from "@/lib/metrics/types";
import { sessionEstimates, type EstimateSet, type StrengthSet } from "@/lib/strength";
import type { ImportedSessionRecord } from "@/types";

export interface ImportedLiftSession {
  sessionId: string;
  exerciseId: string;
  /** When the session's first set of the exercise was done, epoch ms. */
  t: number;
  /** The estimated max (`sessionEstimates`); null when no set of the session gives one. */
  estimatedMax: number | null;
  /** The set the estimated max comes from. */
  bestSet: EstimateSet | null;
  /** The heaviest set that is not a warm-up or a drop, as lifted; ties go to more reps. */
  topSet: { weight: number; reps: number; perHand: boolean } | null;
  /** Weight × reps over the sets that are not warm-ups, as lifted, as the app counts its own. */
  volume: number;
  /** Sets that are not warm-ups. */
  sets: number;
}

/** Imported sessions per exercise id, oldest first. */
export type ImportedLiftIndex = ReadonlyMap<string, readonly ImportedLiftSession[]>;

const NONE: readonly ImportedLiftSession[] = [];
const indexCache = new WeakMap<readonly StrengthSet[], ImportedLiftIndex>();

const timeOf = (date: Date | string) => new Date(date).getTime();

function entryFor(exerciseId: string, sessionId: string, sets: StrengthSet[], estimates: Map<string, ReturnType<typeof sessionEstimates>[number]>): ImportedLiftSession {
  const counted = sets.filter((s) => s.role !== "warmup");
  let top: ImportedLiftSession["topSet"] = null;
  for (const set of counted) {
    if (set.role === "drop") continue;
    if (!top || set.weight > top.weight || (set.weight === top.weight && set.reps > top.reps)) {
      top = { weight: set.weight, reps: set.reps, perHand: set.perHand };
    }
  }
  const estimate = estimates.get(sessionId);
  return {
    sessionId,
    exerciseId,
    t: Math.min(...sets.map((s) => timeOf(s.date))),
    estimatedMax: estimate?.estimatedMax ?? null,
    bestSet: estimate?.bestSet ?? null,
    topSet: top,
    volume: counted.reduce((sum, s) => sum + s.weight * s.reps, 0),
    sets: counted.length,
  };
}

/**
 * The imported sets of `sets`, per exercise and session, worked out once per list (the
 * same map is returned for the same array). Sets with no usable date are left out.
 */
export function importedLiftIndex(sets: readonly StrengthSet[]): ImportedLiftIndex {
  const cached = indexCache.get(sets);
  if (cached) return cached;
  const byExercise = new Map<string, Map<string, StrengthSet[]>>();
  for (const set of sets) {
    if (!set.imported || !Number.isFinite(timeOf(set.date))) continue;
    let bySession = byExercise.get(set.exerciseId);
    if (!bySession) byExercise.set(set.exerciseId, (bySession = new Map()));
    const list = bySession.get(set.sessionId);
    if (list) list.push(set);
    else bySession.set(set.sessionId, [set]);
  }
  const index = new Map<string, ImportedLiftSession[]>();
  for (const [exerciseId, bySession] of byExercise) {
    const own = [...bySession.values()].flat();
    const estimates = new Map(sessionEstimates(own, exerciseId).map((e) => [e.sessionId, e]));
    const entries = [...bySession].map(([sessionId, list]) => entryFor(exerciseId, sessionId, list, estimates));
    entries.sort((a, b) => a.t - b.t || (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0));
    index.set(exerciseId, entries);
  }
  indexCache.set(sets, index);
  return index;
}

/** The imported sessions of one exercise in `sets`, oldest first. */
export function importedHistoryOf(sets: readonly StrengthSet[], exerciseId: string): readonly ImportedLiftSession[] {
  return importedLiftIndex(sets).get(exerciseId) ?? NONE;
}

/** The latest imported session of an exercise in `sets` that has a top set, or null. */
export function lastImportedSession(sets: readonly StrengthSet[], exerciseId: string): ImportedLiftSession | null {
  const history = importedHistoryOf(sets, exerciseId);
  for (let i = history.length - 1; i >= 0; i -= 1) if (history[i].topSet) return history[i];
  return null;
}

const weightText = (weight: number, perHand: boolean) => `${Number(weight.toFixed(1))}${perHand ? " each" : ""}`;

/** "Imported · 185 x 5": the label of an imported point. */
function label(detail: string): string {
  return `Imported · ${detail}`;
}

/** One estimated-max point per imported session that gives one, marked imported. */
export function importedE1rmPoints(history: readonly ImportedLiftSession[]): Point[] {
  return history.flatMap((h) =>
    h.estimatedMax != null && h.bestSet
      ? [
          {
            t: h.t,
            v: h.estimatedMax,
            label: label(`${weightText(h.bestSet.weight, h.bestSet.perHand)} x ${h.bestSet.reps}`),
            refId: h.sessionId,
            imported: true,
          },
        ]
      : []
  );
}

const setsText = (n: number) => `${n} ${n === 1 ? "set" : "sets"}`;

/** One working-weight point per imported session: its heaviest working set, as lifted. */
export function importedWorkingWeightPoints(history: readonly ImportedLiftSession[]): Point[] {
  return history.flatMap((h) =>
    h.topSet && h.topSet.weight > 0
      ? [{ t: h.t, v: h.topSet.weight, label: label(`${weightText(h.topSet.weight, h.topSet.perHand)} x ${h.topSet.reps}`), refId: h.sessionId, imported: true }]
      : []
  );
}

/** One volume point per imported session with some volume. */
export function importedVolumePoints(history: readonly ImportedLiftSession[]): Point[] {
  return history.flatMap((h) =>
    h.volume > 0 ? [{ t: h.t, v: h.volume, label: label(setsText(h.sets)), refId: h.sessionId, imported: true }] : []
  );
}

/**
 * `series` with `points` added, oldest first (at the same instant the app's point comes
 * first). The same series when there is nothing to add.
 */
export function withImportedPoints(series: Series, points: readonly Point[]): Series {
  if (points.length === 0) return series;
  const merged = [...series.points, ...points].filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
  merged.sort((a, b) => a.t - b.t || Number(a.imported === true) - Number(b.imported === true));
  return { ...series, points: merged };
}

/** The app's own points: what new bests, stalls and forecasts are judged against. */
export function appPointsOnly(points: readonly Point[]): Point[] {
  return points.filter((p) => !p.imported);
}

export interface ImportedBest {
  sessionId: string;
  t: number;
  value: number;
  set: EstimateSet;
  /** Every imported session of the lift came before the app's first one (or there is none). */
  beforeApp: boolean;
}

/**
 * The highest estimated max among imported sessions (the earliest on a tie), shown as
 * history: "best before ReComp" when all of them came before `firstAppMs` (the app's
 * first session of the lift; null when it has none). Null with no estimate.
 */
export function importedBest(history: readonly ImportedLiftSession[], firstAppMs: number | null): ImportedBest | null {
  let best: ImportedLiftSession | null = null;
  for (const h of history) {
    if (h.estimatedMax == null || !h.bestSet) continue;
    if (!best || h.estimatedMax > best.estimatedMax!) best = h;
  }
  if (!best || !best.bestSet) return null;
  const last = history[history.length - 1];
  return {
    sessionId: best.sessionId,
    t: best.t,
    value: best.estimatedMax!,
    set: best.bestSet,
    beforeApp: firstAppMs == null || last.t < firstAppMs,
  };
}

/** How many live imported sessions started in [from, to). */
export function importedSessionsBetween(
  sessions: readonly Pick<ImportedSessionRecord, "startedAt" | "deletedAt">[],
  from: Date,
  to: Date
): number {
  let n = 0;
  for (const s of sessions) {
    if (s.deletedAt != null) continue;
    const t = timeOf(s.startedAt);
    if (t >= from.getTime() && t < to.getTime()) n += 1;
  }
  return n;
}
