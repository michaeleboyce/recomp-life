"use client";

import { useMemo } from "react";
import { useLedgerRecords } from "@/hooks/useLedgerRecords";
import { forecastSourceFrom } from "@/lib/data/forecasts";
import { forecastSessionLength, type ForecastSource } from "@/lib/forecast";
import { estimateWorkoutMinutes } from "@/lib/workout/duration";
import type { WorkoutPlan } from "@/lib/workout/types";
import type { TrainingPhase } from "@/types";

export interface ReadyLength {
  minutes: number;
  /** About an 80% range, minutes; absent while the history is still loading. */
  low?: number;
  high?: number;
}

const toMinutes = (seconds: number) => Math.round(seconds / 60);

/**
 * The Ready screen's session length: the same model as Today's tile and the row
 * written at start (`forecastSessionLength`), run on this screen's own plan, so
 * warm-ups, accessories and edits count. Without a source (still loading) or when
 * the model fails, the length on paper with no range.
 */
export function readyLengthFrom(
  source: ForecastSource | null,
  plan: WorkoutPlan,
  phase: TrainingPhase
): ReadyLength {
  const paper = { minutes: estimateWorkoutMinutes(plan, phase) };
  if (!source) return paper;
  try {
    const length = forecastSessionLength({
      plan,
      workouts: source.workouts,
      phase,
      sdScale: source.sdScale?.sessionLength,
      now: source.now,
    });
    return {
      minutes: Math.max(1, toMinutes(length.seconds)),
      low: toMinutes(length.low),
      high: toMinutes(length.high),
    };
  } catch (error) {
    console.error("Session length forecast failed; showing the length on paper", error);
    return paper;
  }
}

/** `readyLengthFrom` for the live records; the history is read once, not per plan change. */
export function useReadyLength(plan: WorkoutPlan, phase: TrainingPhase): ReadyLength {
  const records = useLedgerRecords();
  const source = useMemo(() => {
    if (!records) return null;
    try {
      return forecastSourceFrom(records, records.readAt);
    } catch (error) {
      console.error("Reading the forecast history failed", error);
      return null;
    }
  }, [records]);
  return useMemo(() => readyLengthFrom(source, plan, phase), [source, plan, phase]);
}
