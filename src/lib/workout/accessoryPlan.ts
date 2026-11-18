// The accessories of a workout about to start (A6): chosen once inside the planning path
// (`planWorkoutStart`), from the same inputs on every path, each with its prescription,
// and recorded as `add` edits so resume, the rebuild and the Log plan exactly what was
// shown. Accessories never touch the rotation, T1 to T3 progression or pass and fail:
// they are only appended after the program's lifts. Pure: the clock is `now`.
// Spec: docs/plans/2026-11-17-accessories-design.md (A6).
import { getMonday } from "@/lib/dates";
import { EXERCISES } from "@/lib/exercises";
import {
  accessoryModeOf,
  accessoryPinsFor,
  accessoryPrescription,
  chooseAccessories,
  fitAccessoriesToBudget,
  sessionMinutesOf,
  type AccessoryCandidate,
  type SessionBudget,
  type AccessoryPrescription,
  type ChooseAccessoriesResult,
} from "@/lib/accessories/index";
import { recoveryFromLastTrained, type MuscleValues } from "@/lib/muscleLoad";
import type { StrengthSet } from "@/lib/strength";
import type { AccessoryMode, MuscleId, PlanEdit, TrainingPhase, UserSettings, WorkoutLocation, WorkoutSession } from "@/types";
import { ACCESSORY_STUCK_SESSIONS } from "@/lib/accessories";
import { standInText } from "@/lib/swap/progressionEffect";
import { standInsOf, strengthSetOf, type StandIn } from "./strength";
import { estimateSetSeconds } from "./duration";
import type { WorkoutExerciseState, WorkoutPlan } from "./types";

/** The settings the accessories are chosen and prescribed from. */
export type AccessorySettings = Pick<
  UserSettings,
  | "equipment"
  | "trainingPhase"
  | "exercisePreferences"
  | "exercisePreferencesByLocation"
  | "accessories"
  | "accessoryPins"
  | "accessoryWeights"
  | "sessionMinutes"
>;

/** Everything the accessories of a workout are worked out from, besides the day's lifts. */
export interface AccessorySource {
  settings: AccessorySettings;
  /** Every set as strength evidence, app and imported (`useStrengthEvidence` / `strengthSetsFrom`). */
  strengthSets: readonly StrengthSet[];
  /** The moment planned for; only its calendar day matters (see `accessoryDay`). */
  now: Date;
  /**
   * The lifter's own pace (`sessionPaceCorrection` of the finished workouts by `now`):
   * the session length is measured as the screens show it. Left out, on paper.
   */
  pace?: number;
}

/** One accessory in the plan: its prescription and, when the app chose it, why. */
export interface PlannedAccessory {
  exerciseId: string;
  prescription: AccessoryPrescription;
  /** The scored pick behind it, with its reasons; null when it is not on today's list (blocked here, say). */
  pick: AccessoryCandidate | null;
}

export interface AccessoryPlan {
  mode: AccessoryMode;
  /** The scored list, whatever the mode: the sheet's "For today" and the swap alternatives read it. */
  choice: ChooseAccessoriesResult;
  /** The accessories planned before the user's own edits, in order. */
  planned: PlannedAccessory[];
  /** `planned` as `add` edits, saved on the session ahead of every other edit. */
  edits: PlanEdit[];
  /**
   * The session length planned for and what fitted in it (`fitAccessoriesToBudget`):
   * the picks left out for time, with their reasons. Null when no `programPlan` was
   * given (the length was not applied).
   */
  budget: SessionBudget | null;
}

/**
 * The two instants the accessories of a day are worked out at, so every path on the
 * same calendar day gives the same picks and weights whenever it runs: the choice at
 * local noon (habit, this week's sets, recovery), the prescriptions at the end of the
 * day (every session logged that day counts).
 */
export function accessoryDay(now: Date): { choose: Date; prescribe: Date } {
  const choose = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  const prescribe = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { choose, prescribe };
}

const timeOf = (date: Date | string) => new Date(date).getTime();
const counted = (set: StrengthSet) => set.role !== "warmup" && !set.provisional && Number.isFinite(timeOf(set.date));

/**
 * `compute()` worked out once per list of sets and key. The lists are the hooks' Dexie
 * results (and the projection's one list for every coming workout), so a long history is
 * scanned once per day planned for rather than once per workout planned. Results are
 * shared: callers must not change them.
 */
function oncePerSets<T>(
  cache: WeakMap<readonly StrengthSet[], Map<string, T>>,
  sets: readonly StrengthSet[],
  key: string,
  compute: () => T
): T {
  let byKey = cache.get(sets);
  if (!byKey) {
    byKey = new Map();
    cache.set(sets, byKey);
  }
  if (!byKey.has(key)) byKey.set(key, compute());
  return byKey.get(key)!;
}

const weekSetsCache = new WeakMap<readonly StrengthSet[], Map<string, MuscleValues>>();
const lastTrainedCache = new WeakMap<readonly StrengthSet[], Map<string, Partial<Record<MuscleId, Date>>>>();
const ownSetsCache = new WeakMap<readonly StrengthSet[], Map<string, StrengthSet[]>>();

/**
 * This week's sets per muscle up to `now` (Monday to Sunday), counted as the Muscles tab
 * counts them: primary 1, secondary 0.5, imported sets included, warm-ups left out.
 * Worked out once per list of sets and moment.
 */
export function accessoryWeekSets(sets: readonly StrengthSet[], now: Date): MuscleValues {
  return oncePerSets(weekSetsCache, sets, String(now.getTime()), () => weekSetsOf(sets, now));
}

function weekSetsOf(sets: readonly StrengthSet[], now: Date): MuscleValues {
  const from = getMonday(now).getTime();
  const to = now.getTime();
  const load: MuscleValues = {};
  for (const set of sets) {
    if (!counted(set)) continue;
    const at = timeOf(set.date);
    if (at < from || at > to) continue;
    const exercise = EXERCISES[set.exerciseId];
    if (!exercise) continue;
    for (const m of exercise.primaryMuscles) load[m] = (load[m] ?? 0) + 1;
    for (const m of exercise.secondaryMuscles) load[m] = (load[m] ?? 0) + 0.5;
  }
  return load;
}

/** When each muscle was last worked (primary or secondary) before `now`, app and imported; once per list and moment. */
function lastTrained(sets: readonly StrengthSet[], now: Date): Partial<Record<MuscleId, Date>> {
  return oncePerSets(lastTrainedCache, sets, String(now.getTime()), () => lastTrainedOf(sets, now));
}

function lastTrainedOf(sets: readonly StrengthSet[], now: Date): Partial<Record<MuscleId, Date>> {
  const last: Partial<Record<MuscleId, Date>> = {};
  for (const set of sets) {
    if (!counted(set)) continue;
    const at = timeOf(set.date);
    if (at > now.getTime()) continue;
    const exercise = EXERCISES[set.exerciseId];
    if (!exercise) continue;
    for (const m of [...exercise.primaryMuscles, ...exercise.secondaryMuscles]) {
      if (!last[m] || last[m]!.getTime() < at) last[m] = new Date(at);
    }
  }
  return last;
}

/** The prescription for one accessory on the day of `source.now` (`accessoryPrescription`). */
export function prescribeAccessory(exerciseId: string, source: AccessorySource): AccessoryPrescription {
  const own = oncePerSets(ownSetsCache, source.strengthSets, exerciseId, () =>
    source.strengthSets.filter((set) => set.exerciseId === exerciseId)
  );
  return accessoryPrescription({
    exerciseId,
    sets: own,
    equipment: source.settings.equipment,
    handSetWeight: source.settings.accessoryWeights?.[exerciseId] ?? null,
    now: accessoryDay(source.now).prescribe,
  });
}

/**
 * The `add` edit that puts an accessory in a plan at its prescription: its sets, the top
 * of its rep range (every set is taken toward it, so the sets are as-many-as-possible),
 * and its weight (0 when there is none yet, to be entered).
 */
export function accessoryAddEdit(prescription: AccessoryPrescription): Extract<PlanEdit, { kind: "add" }> {
  return {
    kind: "add",
    exerciseId: prescription.exerciseId,
    sets: prescription.sets,
    reps: prescription.reps.max,
    weight: prescription.weight ?? 0,
    isAMRAP: true,
  };
}

export interface PlanAccessoriesInput {
  templateId: string;
  /** The day's T1 to T3 as resolved: the exercise performed and its sets. */
  mainLifts: readonly { exerciseId: string; sets: number }[];
  location: WorkoutLocation;
  source: AccessorySource;
  /**
   * Accessories named outright (a favourite's): planned in this order instead of the
   * app's choice, whatever the mode. Empty or absent: the mode decides.
   */
  selected?: readonly string[];
  /**
   * The program's plan before accessories (warm-ups as configured): with it, the app's
   * picks are kept to the session length (`settings.sessionMinutes`). Left out, the
   * length is not applied.
   */
  programPlan?: ReadonlyArray<Pick<WorkoutExerciseState, "tier" | "targetSets">>;
}

/**
 * The accessories of a workout, chosen once (`chooseAccessories`) and prescribed
 * (`accessoryPrescription`): with mode "auto" (the default) the picks, with "ask" or
 * "none" nothing, and accessories named outright always those. The choice is made at
 * `accessoryDay(now).choose`, so the same day gives the same picks.
 *
 * With a `programPlan`, the app's picks are kept to the session length
 * (`fitAccessoriesToBudget`): taken in order while the plan stays within it, pins
 * always kept. Accessories named outright are the user's own and always kept. In "ask"
 * and "none" mode nothing is chosen, and the budget only measures the lifts.
 *
 * @evidence accessory-selection
 * @evidence accessory-progression
 * @evidence session-length-budget
 */
export function planAccessories(input: PlanAccessoriesInput): AccessoryPlan {
  const { source, location } = input;
  const { settings } = source;
  const mode = accessoryModeOf(settings);
  const { choose } = accessoryDay(source.now);
  const phase = settings.trainingPhase ?? { mode: "maintaining" };
  const choice = chooseAccessories({
    templateId: input.templateId,
    mainLifts: input.mainLifts,
    location,
    equipment: settings.equipment,
    phase,
    ...(settings.exercisePreferences ? { preferences: settings.exercisePreferences } : {}),
    ...(settings.exercisePreferencesByLocation ? { preferencesByLocation: settings.exercisePreferencesByLocation } : {}),
    pins: accessoryPinsFor(settings, input.templateId),
    history: source.strengthSets,
    weekSetsSoFar: accessoryWeekSets(source.strengthSets, choose),
    recovery: recoveryFromLastTrained(lastTrained(source.strengthSets, choose), choose, phase),
    now: choose,
  });

  const selected = (input.selected ?? []).filter((id, i, all) => EXERCISES[id] && all.indexOf(id) === i);
  const candidates = [...choice.picks, ...choice.others];
  const named = selected.length > 0;
  const ids = named ? selected : mode === "auto" ? choice.picks.map((pick) => pick.exerciseId) : [];
  const offered = ids.map((exerciseId) => ({
    exerciseId,
    prescription: prescribeAccessory(exerciseId, source),
    pick: candidates.find((c) => c.exerciseId === exerciseId) ?? null,
  }));
  const budget = input.programPlan
    ? fitAccessoriesToBudget({
        minutes: sessionMinutesOf(settings),
        programPlan: input.programPlan,
        phase,
        ...(source.pace !== undefined ? { pace: source.pace } : {}),
        candidates: offered.map((p) => ({
          exerciseId: p.exerciseId,
          sets: p.prescription.sets,
          pinned: named || (p.pick?.parts.pinned ?? 0) > 0,
        })),
      })
    : null;
  const planned = budget ? offered.filter((p) => budget.kept.includes(p.exerciseId)) : offered;
  return { mode, choice, planned, edits: planned.map((p) => accessoryAddEdit(p.prescription)), budget };
}

/** One accessory of a plan as the screens show it: the entry, its prescription and why. */
export interface AccessoryRow {
  exerciseId: string;
  /** The plan entry (its weight and scheme are what will be done, edits included). */
  entry: WorkoutExerciseState;
  /** What the app prescribes for it today: the weight's basis, last time, the verdict. */
  prescription: AccessoryPrescription;
  /** Its place on today's scored list, with the reasons; null when it is not on it. */
  pick: AccessoryCandidate | null;
  /** True when the app chose it (not added or swapped in by the user). */
  chosen: boolean;
}

/**
 * The accessory entries of a plan, in order, each with its prescription (the planned
 * one, else worked out now for an accessory the user added) and its reasons.
 */
export function accessoryRowsOf(
  plan: WorkoutPlan,
  accessories: AccessoryPlan | null,
  source: AccessorySource
): AccessoryRow[] {
  const candidates = accessories ? [...accessories.choice.picks, ...accessories.choice.others] : [];
  return plan
    .filter((entry) => !entry.isWarmUp && entry.tier === "accessory" && !entry.replaces)
    .map((entry) => {
      const planned = accessories?.planned.find((p) => p.exerciseId === entry.exerciseId);
      return {
        exerciseId: entry.exerciseId,
        entry,
        prescription: planned?.prescription ?? prescribeAccessory(entry.exerciseId, source),
        pick: planned?.pick ?? candidates.find((c) => c.exerciseId === entry.exerciseId) ?? null,
        chosen: planned != null,
      };
    });
}

/**
 * What an accessory does next time after a session of it (A9, A10): its prescription
 * read with the session's sets counted (`accessoryPrescription`), so double
 * progression's verdict and next weight are the ones the next plan will give. `sets`
 * is the evidence before the session (`strengthSetsOf` / `strengthEvidenceOf`); the
 * session's own sets are added here. Null when the session has no working set of it, or
 * when it stood in for a program lift swapped out (`replaces`): it is logged only.
 *
 * @evidence accessory-progression
 */
export function accessoryNextTime(
  exerciseId: string,
  session: Pick<WorkoutSession, "id" | "sets"> & Partial<Pick<WorkoutSession, "planEdits">>,
  sets: readonly StrengthSet[],
  settings: Pick<AccessorySettings, "equipment" | "accessoryWeights">,
  now: Date
): AccessoryPrescription | null {
  if (standInsOf(session.planEdits).has(exerciseId)) return null;
  const own = (session.sets ?? [])
    .filter((set) => set.tier === "accessory" && set.status !== "skipped_pain")
    .map((set) => strengthSetOf(set, session.id))
    .filter((set) => set.exerciseId === exerciseId && set.role !== "warmup" && set.role !== "drop");
  if (own.length === 0) return null;
  const before = sets.filter((set) => set.exerciseId === exerciseId && set.sessionId !== session.id);
  const latest = Math.max(now.getTime(), ...own.map((set) => new Date(set.date).getTime()));
  return accessoryPrescription({
    exerciseId,
    sets: [...before, ...own],
    equipment: settings.equipment,
    handSetWeight: settings.accessoryWeights?.[exerciseId] ?? null,
    now: new Date(latest),
  });
}

/**
 * "All sets at 15: up to 30 lb next time", "Short of 15 on a set: 25 lb again next time",
 * "Short of 15 for 3 sessions: down to 22.5 lb next time": what an accessory does next
 * time and why, in one line.
 */
export function nextTimeText(p: AccessoryPrescription): string {
  const top = p.reps.max;
  const unit = (w: number | null) => (w == null ? "" : `${Math.round(w * 100) / 100} lb`);
  // Done without a weight (none entered): nothing to step up from.
  if (p.last && !(p.last.weight > 0) && EXERCISES[p.exerciseId]?.type !== "bodyweight") {
    return `Done without a weight: enter one next time, then work toward ${top} reps`;
  }
  if (p.basis === "hand") return `Set by you: ${unit(p.weight)} next time${p.planWeight != null ? ` (the plan says ${unit(p.planWeight)})` : ""}`;
  if (p.verdict === "up") return `All sets at ${top}: up to ${unit(p.weight)} next time`;
  if (p.verdict === "down") return `Short of ${top} for ${ACCESSORY_STUCK_SESSIONS} sessions: down to ${unit(p.weight)} next time`;
  if (p.weight === 0 || p.weight == null) return `Next time: work toward ${top} reps on every set`;
  return `Short of ${top} on a set: ${unit(p.weight)} again next time`;
}

/** One accessory of a finished workout and what it does next time (A10). */
export interface AccessoryOutcome {
  exerciseId: string;
  /** What double progression does next time; null for a stand-in (`standsInFor`). */
  next: AccessoryPrescription | null;
  /** "All sets at 15: up to 30 next time", or for a stand-in what it stood in for (`standInText`). */
  text: string;
  /** It stood in for a program lift swapped out: logged only, not judged as an accessory. */
  standsInFor?: StandIn;
}

/**
 * What each accessory of a finished workout does next time, as of that workout: its
 * sets read with everything logged before it (later sessions and weights set by hand
 * after it are left out), in the order they were done. An exercise that stood in for a
 * program lift swapped out is not judged as an accessory: its line says what it stood in
 * for and that the lift is held (`standInText`).
 *
 * @evidence accessory-progression
 */
export function accessoryOutcomesOf(
  workout: Pick<WorkoutSession, "id" | "sets" | "completedAt" | "startedAt"> & Partial<Pick<WorkoutSession, "planEdits">>,
  sets: readonly StrengthSet[],
  settings: Pick<AccessorySettings, "equipment" | "accessoryWeights">
): AccessoryOutcome[] {
  const end = new Date(workout.completedAt ?? workout.startedAt).getTime();
  const before = sets.filter((set) => new Date(set.date).getTime() <= end);
  const weights = Object.fromEntries(
    Object.entries(settings.accessoryWeights ?? {}).filter(([, entry]) => entry.setAt <= end)
  );
  const ids: string[] = [];
  for (const set of workout.sets ?? []) {
    const id = set.substituteExerciseId || set.exerciseId;
    if (set.tier === "accessory" && !ids.includes(id)) ids.push(id);
  }
  const standIns = standInsOf(workout.planEdits);
  return ids.flatMap((exerciseId): AccessoryOutcome[] => {
    const standsInFor = standIns.get(exerciseId);
    if (standsInFor) return [{ exerciseId, next: null, text: standInText(exerciseId, standsInFor), standsInFor }];
    const next = accessoryNextTime(exerciseId, workout, before, { equipment: settings.equipment, accessoryWeights: weights }, new Date(end));
    return next ? [{ exerciseId, next, text: nextTimeText(next) }] : [];
  });
}

/** Minutes an accessory adds to the session: its sets, each with the rest after it. */
export function accessoryMinutes(sets: number, phase?: TrainingPhase): number {
  return Math.max(1, Math.round((Math.max(0, sets) * estimateSetSeconds("accessory", phase)) / 60));
}
