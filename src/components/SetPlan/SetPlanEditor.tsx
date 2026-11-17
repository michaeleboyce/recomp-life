"use client";
// CONTRACT STUB: package P3 implements this (E5).
import type { PlannedSet } from "@/types";

export interface SetPlanEditorProps {
  /** The exercise's name, for the controls' accessible names. */
  name: string;
  /** The sets as they stand (yours where changed), in order. */
  sets: PlannedSet[];
  /** The plan's own sets, same length, shown beside a changed set. */
  planSets: PlannedSet[];
  /** "lbs", "lbs a hand". */
  unit: string;
  /** What a weight moves by, and its limits. */
  step: number;
  minWeight: number;
  maxWeight?: number;
  /** Indexes that can no longer change (done sets in a workout). */
  lockedBefore?: number;
  /** The new sets; null goes back to the plan. */
  onChange: (sets: PlannedSet[] | null) => void;
}

/** The sets as chips; tap one to change its weight and reps; "Back to plan" clears all. */
export function SetPlanEditor({ sets }: SetPlanEditorProps) {
  return <div data-testid="set-plan-editor">{sets.length} sets</div>;
}
