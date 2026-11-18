// What an accessory is done at next time (A4): weight, sets and reps, what happened
// last time and why. Worked out from the log when read; nothing new is stored. Pure.
// Spec: docs/plans/2026-11-17-accessories-design.md (decision 3).
import {
  evaluateAccessoryProgression,
  getAccessoryRepRange,
} from "@/lib/accessories";
import { EXERCISES } from "@/lib/exercises";
import { asLifted, impliedWeightForReps, latestEstimate, type StrengthSet } from "@/lib/strength";
import type { AccessoryHandSetWeight, EquipmentProfile, UserSettings } from "@/types";
import { sanitizeAccessoryWeights } from "./settings";

const DAY_MS = 86_400_000;

/** The weight step for an accessory that is not done with dumbbells. */
export const ACCESSORY_LOAD_STEP_LBS = 5;

/**
 * The first weight of an exercise from its own history (no app session of it as an
 * accessory yet). Shares its limits with the own-history seed for home exercises that
 * src/lib/workout/variant.ts is adding (F6); the two are meant to be unified into one
 * helper later, so the names say "own history" in both.
 *
 * - `recentDays`: the history read is the sets within this many days of the newest one.
 * - `stepsAboveHeaviest`: never more than the heaviest weight lifted in that window
 *   plus this many steps.
 *
 * @evidence accessory-progression
 */
export const OWN_HISTORY_FIRST_WEIGHT = {
  recentDays: 56,
  stepsAboveHeaviest: 1,
} as const;

/** The weight step for an exercise: the dumbbell increment for dumbbell work, 5 lb otherwise. */
export function accessoryLoadStep(exerciseId: string, equipment: Pick<EquipmentProfile, "dumbbellIncrementLbs">): number {
  if (EXERCISES[exerciseId]?.type === "dumbbell" && equipment.dumbbellIncrementLbs > 0) {
    return equipment.dumbbellIncrementLbs;
  }
  return ACCESSORY_LOAD_STEP_LBS;
}

const t = (date: Date | string) => new Date(date).getTime();
const isNormal = (set: StrengthSet) => set.role !== "warmup" && set.role !== "drop" && !set.provisional;

/** True for a set the app logged (not imported, not a stand-in for a weight set by hand). */
const isAppSet = (set: StrengthSet) => set.imported !== true && set.provisional !== true;

/**
 * The hand-set weight in force for `exerciseId`: the stored entry, until a session the
 * app logged after it was set contains the exercise. From then on double progression
 * over the log decides again, so nothing has to be cleared when a workout is finished,
 * and deleting that later session (its sets are no longer passed in) brings the
 * hand-set weight back. Imported sessions never end it. Null when none is in force.
 */
export function activeHandSetWeight(
  entry: AccessoryHandSetWeight | null | undefined,
  exerciseId: string,
  sets: readonly StrengthSet[]
): AccessoryHandSetWeight | null {
  if (!entry || !Number.isFinite(entry.weight) || entry.weight < 0 || !Number.isFinite(entry.setAt)) return null;
  const lifted = sets.some(
    (set) => set.exerciseId === exerciseId && isAppSet(set) && set.role !== "warmup" && t(set.date) > entry.setAt
  );
  return lifted ? null : entry;
}

/** The hand-set weight in force for an exercise, read from the settings (see `activeHandSetWeight`). */
export function handSetAccessoryWeight(
  settings: Pick<UserSettings, "accessoryWeights"> | null | undefined,
  exerciseId: string,
  sets: readonly StrengthSet[]
): AccessoryHandSetWeight | null {
  return activeHandSetWeight(sanitizeAccessoryWeights(settings?.accessoryWeights)?.[exerciseId], exerciseId, sets);
}

export interface OwnHistoryFirstWeight {
  weight: number;
  /** "top": the heaviest weight the top of the range was reached at; "estimate": the
   * estimate's weight for the middle of the range; "heaviest": neither was possible. */
  rule: "top" | "estimate" | "heaviest";
  /** The heaviest weight lifted in the window. */
  heaviest: number;
  /** The newest set read. */
  from: Date;
}

/**
 * A conservative first weight from an exercise's own sets (imported, or logged in the
 * app at another tier), or null when there are none with a load:
 * 1. the heaviest weight at which the top of the range was reached in the window, else
 * 2. the estimate's weight for the middle of the range (the latest session's estimated
 *    max, each set read as taken to its limit, which gives the lower estimate), else
 * 3. the heaviest weight lifted;
 * never more than the heaviest weight lifted plus one step, rounded down to the step.
 * The window is OWN_HISTORY_FIRST_WEIGHT.recentDays back from the newest set.
 *
 * @evidence accessory-progression
 */
export function ownHistoryFirstWeight(
  sets: readonly StrengthSet[],
  exerciseId: string,
  range: { min: number; max: number },
  step: number
): OwnHistoryFirstWeight | null {
  const own = sets.filter(
    (s) => s.exerciseId === exerciseId && isNormal(s) && s.weight > 0 && s.reps > 0 && Number.isFinite(t(s.date))
  );
  if (own.length === 0) return null;
  const newest = Math.max(...own.map((s) => t(s.date)));
  const recent = own.filter((s) => t(s.date) >= newest - OWN_HISTORY_FIRST_WEIGHT.recentDays * DAY_MS);
  const heaviest = Math.max(...recent.map((s) => s.weight));
  const cap = heaviest + OWN_HISTORY_FIRST_WEIGHT.stepsAboveHeaviest * step;

  let raw: number;
  let rule: OwnHistoryFirstWeight["rule"];
  const atTop = recent.filter((s) => s.reps >= range.max).map((s) => s.weight);
  const estimate = latestEstimate(
    recent.map((s) => ({ ...s, tier: "T1" as const, isAMRAP: true })),
    exerciseId
  );
  if (atTop.length > 0) {
    raw = Math.max(...atTop);
    rule = "top";
  } else if (estimate) {
    raw = asLifted(impliedWeightForReps(estimate.estimatedMax, Math.round((range.min + range.max) / 2)), exerciseId);
    rule = "estimate";
  } else {
    raw = heaviest;
    rule = "heaviest";
  }
  const weight = Math.floor(Math.min(raw, cap) / step + 1e-9) * step;
  if (!(weight > 0)) return null;
  return { weight, rule, heaviest, from: new Date(newest) };
}

export interface AccessoryLastSession {
  date: Date;
  /** The top working weight of the session. */
  weight: number;
  /** Reps of the working sets at that weight, in order. */
  reps: number[];
}

export interface AccessoryPrescription {
  exerciseId: string;
  /** The weight to do, as lifted (per dumbbell for a two-dumbbell exercise); null: enter one. */
  weight: number | null;
  /**
   * The plan's own weight beside one set by hand ("Plan · You"): what the log gives
   * without it. Null when nothing was set by hand or it equals `weight`.
   */
  planWeight: number | null;
  /** When the weight in force was set by hand (epoch ms); null when it was not. */
  setAt: number | null;
  sets: number;
  reps: { min: number; max: number };
  /** Where the weight comes from. */
  basis: "hand" | "progression" | "history" | "none";
  /** The last app session of the exercise as an accessory. */
  last?: AccessoryLastSession;
  /** Double progression's verdict on the last session. */
  verdict?: "up" | "same" | "down";
  /** One plain sentence for the row. */
  note: string;
}

export interface AccessoryPrescriptionInput {
  exerciseId: string;
  /** The exercise's own sets, app and imported, with dates and roles (other exercises are ignored). */
  sets: readonly StrengthSet[];
  equipment: Pick<EquipmentProfile, "dumbbellIncrementLbs">;
  /** The stored hand-set weight, if any (`settings.accessoryWeights[exerciseId]`); it is applied only while in force. */
  handSetWeight?: AccessoryHandSetWeight | null;
  now: Date;
}

/** The app's sessions of the exercise as an accessory, oldest first, each with its normal sets. */
function accessorySessions(sets: readonly StrengthSet[], exerciseId: string, now: number): StrengthSet[][] {
  const bySession = new Map<string, StrengthSet[]>();
  for (const set of sets) {
    // A stand-in for a program lift swapped out is logged only: not an accessory session.
    if (set.exerciseId !== exerciseId || set.tier !== "accessory" || set.standsInFor || !isAppSet(set) || !isNormal(set)) continue;
    const time = t(set.date);
    if (!Number.isFinite(time) || time > now) continue;
    const list = bySession.get(set.sessionId);
    if (list) list.push(set);
    else bySession.set(set.sessionId, [set]);
  }
  const sessionTime = (list: StrengthSet[]) => Math.max(...list.map((s) => t(s.date)));
  return [...bySession.values()]
    .map((list) => [...list].sort((a, b) => t(a.date) - t(b.date) || (a.id < b.id ? -1 : 1)))
    .sort((a, b) => sessionTime(a) - sessionTime(b) || (a[0].sessionId < b[0].sessionId ? -1 : 1));
}

function lastOf(session: StrengthSet[]): AccessoryLastSession {
  const weight = Math.max(...session.map((s) => s.weight));
  return {
    date: new Date(Math.max(...session.map((s) => t(s.date)))),
    weight,
    reps: session.filter((s) => s.weight === weight).map((s) => s.reps),
  };
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

interface PlanWeight {
  weight: number | null;
  basis: "progression" | "history" | "none";
  last?: AccessoryLastSession;
  verdict?: "up" | "same" | "down";
  note: string;
}

function planFromLog(input: AccessoryPrescriptionInput, range: { min: number; max: number }, step: number): PlanWeight {
  const { exerciseId, sets } = input;
  const bodyweight = EXERCISES[exerciseId]?.type === "bodyweight";
  const sessions = accessorySessions(sets, exerciseId, input.now.getTime());
  if (sessions.length > 0) {
    const lasts = sessions.map(lastOf);
    const last = lasts[lasts.length - 1];
    // Sessions in a row, newest back, at the last weight without every set at the top.
    let stuck = 0;
    for (let i = lasts.length - 1; i >= 0; i -= 1) {
      const s = lasts[i];
      if (s.weight !== last.weight || s.reps.every((r) => r >= range.max)) break;
      stuck += 1;
    }
    if (bodyweight && !(last.weight > 0)) {
      const all = last.reps.every((r) => r >= range.max);
      return {
        weight: 0,
        basis: "progression",
        last,
        verdict: "same",
        note: all ? `Every set reached ${range.max} last time: add load or slow the reps` : `Working toward ${range.max} reps on every set`,
      };
    }
    const result = evaluateAccessoryProgression(
      { exerciseId, weight: last.weight, lastSessionReps: last.reps },
      range,
      stuck,
      step
    );
    const verdict = result.action === "increase" ? "up" : result.action === "deload" ? "down" : "same";
    const note =
      verdict === "up"
        ? `Every set reached ${range.max} last time: up ${fmt(step)} lb`
        : verdict === "down"
          ? `Short of ${range.max} reps for ${stuck} sessions: down to ${fmt(result.newWeight)} lb to build back`
          : `Same weight: working toward ${range.max} reps on every set`;
    return { weight: result.newWeight, basis: "progression", last, verdict, note };
  }
  const first = bodyweight ? null : ownHistoryFirstWeight(sets, exerciseId, range, step);
  if (first) {
    const why =
      first.rule === "top"
        ? `the heaviest weight you did ${range.max} reps with`
        : first.rule === "estimate"
          ? `your estimated strength at ${Math.round((range.min + range.max) / 2)} reps`
          : "the heaviest weight you lifted";
    return { weight: first.weight, basis: "history", note: `First time in the app: from your history, ${why}` };
  }
  return { weight: null, basis: "none", note: bodyweight ? "Bodyweight: log your reps" : "No history yet: enter a weight" };
}

/**
 * The prescription for an accessory: sets and reps from its range
 * (`getAccessoryRepRange`) and a weight, in this order:
 * 1. a weight set by hand and still in force (`activeHandSetWeight`), with the plan's
 *    own weight beside it (`planWeight`, which keeps tracking the log);
 * 2. double progression (`evaluateAccessoryProgression`) over the app's sessions of
 *    the exercise as an accessory: every set at the top of the range, up one step;
 *    stuck ACCESSORY_STUCK_SESSIONS sessions, down to ACCESSORY_DELOAD_FRACTION; else
 *    the same;
 * 3. a first weight from the exercise's own history (`ownHistoryFirstWeight`);
 * 4. none: the user enters one.
 * The step is the dumbbell increment for dumbbell work, 5 lb otherwise.
 *
 * @evidence accessory-progression
 */
export function accessoryPrescription(input: AccessoryPrescriptionInput): AccessoryPrescription {
  const { exerciseId, sets } = input;
  const range = getAccessoryRepRange(exerciseId);
  const step = accessoryLoadStep(exerciseId, input.equipment);
  const plan = planFromLog(input, range, step);
  const hand = activeHandSetWeight(input.handSetWeight, exerciseId, sets);
  const base = { exerciseId, sets: range.sets, reps: { min: range.min, max: range.max } };
  const extra = { ...(plan.last ? { last: plan.last } : {}), ...(plan.verdict ? { verdict: plan.verdict } : {}) };
  if (hand) {
    const planWeight = plan.weight !== null && plan.weight !== hand.weight ? plan.weight : null;
    return {
      ...base,
      weight: hand.weight,
      planWeight,
      setAt: hand.setAt,
      basis: "hand",
      ...extra,
      note: planWeight !== null ? `Set by hand: the plan says ${fmt(planWeight)} lb` : "Set by hand",
    };
  }
  return { ...base, weight: plan.weight, planWeight: null, setAt: null, basis: plan.basis, ...extra, note: plan.note };
}
