import { useMemo } from "react";
import { readinessTodayFrom } from "@/lib/data/forecasts";
import type { ReadinessAnswers } from "@/lib/readiness";
import type { ReadinessScore, WorkoutLocation } from "@/types";
import { useLedgerRecords } from "./useLedgerRecords";

/**
 * Today's readiness score with the list of what moved it. It is for the workout in
 * progress, with the sleep and energy answers saved when it started; otherwise for
 * the next workout in the rotation.
 *
 * `answers` are sleep and energy answers that are not saved yet (the pre-workout
 * check), so the score can be shown before the workout starts; a workout in progress
 * uses its own. `location` is where the next workout would be done (the saved default
 * when omitted).
 *
 * `undefined` while loading; `null` when nothing is known that could move the score
 * (a new user with no answers): the screen says so instead of showing a number.
 */
export function useReadinessToday(
  input: { location?: WorkoutLocation; answers?: ReadinessAnswers | null } = {}
): ReadinessScore | null | undefined {
  const records = useLedgerRecords();
  // Callers usually pass a fresh object each render; key on its contents.
  const { location } = input;
  const sleepHours = input.answers?.sleepHours;
  const stressLevel = input.answers?.stressLevel;
  const sleepMinutes = input.answers?.sleepMinutes;
  const sleepSource = input.answers?.sleepSource;

  return useMemo(() => {
    if (!records) return undefined;
    const answers: ReadinessAnswers | null =
      sleepHours && stressLevel
        ? {
            sleepHours,
            stressLevel,
            ...(sleepMinutes != null ? { sleepMinutes } : {}),
            ...(sleepSource ? { sleepSource } : {}),
          }
        : null;
    return readinessTodayFrom(records, { now: records.readAt, location, answers });
  }, [records, location, sleepHours, stressLevel, sleepMinutes, sleepSource]);
}
