import { CREDIT_TIERS, classifyEntry } from "@/lib/workout";
import type { WorkoutPlan } from "@/lib/workout/types";
import type { PlanEdit, PrescribedEntry, Tier } from "@/types";
import { editedKeys } from "./editList";

/**
 * What an edited workout does to the program, per program lift (T1, T2, T3):
 * - "program": counts toward progression, judged as usual
 * - "logged-only": performed and logged, but progression is paused for it
 * - "not-done": a prescribed lift the plan no longer contains; its weight is unchanged
 */
export type ImpactStatus = "program" | "logged-only" | "not-done";

export interface ImpactItem {
  exerciseId: string;
  tier: Tier;
  status: ImpactStatus;
  /** An edit touched this entry (a swap counts for its replacement). */
  edited: boolean;
  /** A program lift set heavier than prescribed: its next weight builds from this one. */
  heavier?: true;
}

/** Empty when there are no edits: an unedited day has nothing to explain. */
export function computeImpact(
  plan: WorkoutPlan,
  prescribed: PrescribedEntry[],
  edits: PlanEdit[]
): ImpactItem[] {
  if (edits.length === 0) return [];
  const touched = editedKeys(edits);

  const working = plan.filter((entry) => !entry.isWarmUp && CREDIT_TIERS.includes(entry.tier));
  const performed: ImpactItem[] = working.map((entry) => {
    const status = classifyEntry(entry, prescribed);
    const target = prescribed.find((p) => p.exerciseId === entry.exerciseId && p.tier === entry.tier);
    const heavier =
      status === "program" && target && (entry.originalWeight ?? entry.weight) > target.weight;
    return {
      exerciseId: entry.exerciseId,
      tier: entry.tier,
      status,
      edited: touched.has(`${entry.exerciseId}|${entry.tier}`),
      ...(heavier ? { heavier: true as const } : {}),
    };
  });

  const notDone: ImpactItem[] = prescribed
    .filter((p) => !working.some((e) => e.exerciseId === p.exerciseId && e.tier === p.tier))
    .map((p) => ({ exerciseId: p.exerciseId, tier: p.tier, status: "not-done", edited: true }));

  return [...performed, ...notDone];
}
