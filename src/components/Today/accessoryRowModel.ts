// The accessory rows on Today and the Ready screen (A7, A8): what each shows, the
// one-line reason. Pure; no React.
import { getAccessoryRepRange } from "@/lib/accessories";
import type { AccessoryPrescription } from "@/lib/accessories/index";
import { EXERCISES } from "@/lib/exercises";
import type { AccessoryPlan, AccessoryRow } from "@/lib/workout/accessoryPlan";
import type { WorkoutPlan } from "@/lib/workout/types";
import { formatLbs } from "./format";
import { displayLiftName } from "./todayModel";

/** One accessory as a row shows it. */
export interface AccessoryRowView {
  exerciseId: string;
  name: string;
  /** The weight to do, as lifted; null when there is none yet (enter one at the bar). */
  weight: number | null;
  /** True when the weight is per dumbbell. */
  perHand: boolean;
  bodyweight: boolean;
  sets: number;
  /** The rep range the sets are taken toward; the top is the target. */
  reps: { min: number; max: number };
  /** The reason it was picked, in one line; null when there is none to give. */
  reason: string | null;
  /** True when the why sheet can explain it (it is on today's scored list). */
  explained: boolean;
}

/** "3×12–15": sets and the rep range ("3×15" when the range is one number), as the lifts' "5×3+". */
export function accessoryScheme(sets: number, reps: { min: number; max: number }): string {
  return `${sets}×${reps.min === reps.max ? reps.max : `${reps.min}–${reps.max}`}`;
}

/** The weight as a row's big number shows it ("30", "—" when there is none yet) and its unit ("/hand"). */
export function accessoryWeightParts(view: Pick<AccessoryRowView, "weight" | "perHand" | "bodyweight">): {
  value: string;
  unit: string;
} {
  if (view.bodyweight && !view.weight) return { value: "BW", unit: "" };
  if (view.weight == null) return { value: "—", unit: "" };
  return { value: formatLbs(view.weight), unit: view.perHand ? "/hand" : "" };
}

/** "30 lb", "20 lb/hand", "Bodyweight", "Enter weight". */
export function accessoryWeightText(view: Pick<AccessoryRowView, "weight" | "perHand" | "bodyweight">): string {
  if (view.bodyweight && !view.weight) return "Bodyweight";
  if (view.weight == null) return "Enter weight";
  return `${formatLbs(view.weight)} lb${view.perHand ? "/hand" : ""}`;
}

function viewOf(
  exerciseId: string,
  entry: WorkoutPlan[number],
  prescription: AccessoryPrescription | null,
  reason: string | null,
  explained: boolean
): AccessoryRowView {
  const exercise = EXERCISES[exerciseId];
  const bodyweight = exercise?.type === "bodyweight";
  const reps = prescription?.reps ?? (() => {
    const range = getAccessoryRepRange(exerciseId);
    return { min: Math.min(range.min, entry.targetReps), max: entry.targetReps };
  })();
  // Reps changed by hand are the target; the range's bottom stays where it was.
  const range = entry.targetReps === reps.max ? reps : { min: Math.min(reps.min, entry.targetReps), max: entry.targetReps };
  return {
    exerciseId,
    name: displayLiftName(exerciseId),
    weight: entry.weight > 0 ? entry.weight : null,
    perHand: exercise?.grip === "per_hand",
    bodyweight,
    sets: entry.targetSets,
    reps: range,
    reason,
    explained,
  };
}

/** The rows for an accessory plan as the setup screens hold it (`accessoryRowsOf`). */
export function viewsOfRows(rows: readonly AccessoryRow[]): AccessoryRowView[] {
  return rows.map((row) =>
    viewOf(row.exerciseId, row.entry, row.prescription, row.pick?.reasons[0] ?? (row.chosen ? null : "Added by you"), row.pick != null)
  );
}

/**
 * The accessory rows of a plan, in order. With the plan's accessory choice (the next
 * workout), each has its prescription's range and the first reason it was picked; an
 * open workout's (no choice at hand) shows its entry's scheme alone.
 */
export function accessoryRowViews(plan: WorkoutPlan, accessories: AccessoryPlan | null | undefined): AccessoryRowView[] {
  return plan
    .filter((entry) => !entry.isWarmUp && entry.tier === "accessory")
    .map((entry) => {
      const planned = accessories?.planned.find((p) => p.exerciseId === entry.exerciseId);
      return viewOf(entry.exerciseId, entry, planned?.prescription ?? null, planned?.pick?.reasons[0] ?? null, planned?.pick != null);
    });
}
