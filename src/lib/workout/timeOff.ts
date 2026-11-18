// "Lighter weights after a break" (the time-off rule) on the Ready screen, with training
// logged in another app counted: an imported session of a lift, or of one of its home
// versions, ends that lift's break, as an imported session ends the days-off note on
// Today. The cut itself is `getExerciseDecaySuggestions`; this file only says when each
// lift was last trained. Pure: the clock is `now`.
import { EXERCISES, HOME_SUBSTITUTE_CHAINS } from "@/lib/exercises";
import type { StrengthSet } from "@/lib/strength";
import { getExerciseDecaySuggestions, type ExerciseDecaySuggestion } from "@/lib/weightDecay";
import type { LiftState, TrainingPhase, VariantState } from "@/types";

/**
 * The exercises that count as training a program lift: the lift, its dumbbell
 * alternative, its home fallback chain and any exercise the app has planned for it at
 * home (`variantStates`).
 */
function versionsOf(liftId: string, variantStates: readonly Pick<VariantState, "liftId" | "exerciseId">[]): Set<string> {
  const ids = new Set<string>([liftId]);
  const alternative = EXERCISES[liftId]?.dumbbellAlternative;
  if (alternative) ids.add(alternative);
  for (const id of HOME_SUBSTITUTE_CHAINS[liftId] ?? []) ids.add(id);
  for (const v of variantStates) if (v.liftId === liftId) ids.add(v.exerciseId);
  return ids;
}

const timeOf = (date: Date | string) => new Date(date).getTime();

/**
 * When each of `liftIds` was last trained in a session imported from another app, up to
 * `now`: the first set of the latest imported session with a set (not a warm-up) of the
 * lift or one of its home versions. Lifts with none are left out.
 */
export function importedLastTrainedByLift(
  strengthSets: readonly StrengthSet[],
  variantStates: readonly Pick<VariantState, "liftId" | "exerciseId">[],
  liftIds: readonly string[],
  now: Date
): Map<string, Date> {
  const versions = liftIds.map((liftId) => ({ liftId, ids: versionsOf(liftId, variantStates) }));
  // The first set of each imported session, per lift.
  const sessions = new Map<string, Map<string, number>>();
  for (const set of strengthSets) {
    if (!set.imported || set.role === "warmup") continue;
    const at = timeOf(set.date);
    if (!Number.isFinite(at) || at > now.getTime()) continue;
    for (const { liftId, ids } of versions) {
      if (!ids.has(set.exerciseId)) continue;
      let bySession = sessions.get(liftId);
      if (!bySession) sessions.set(liftId, (bySession = new Map()));
      const first = bySession.get(set.sessionId);
      if (first === undefined || at < first) bySession.set(set.sessionId, at);
    }
  }
  const out = new Map<string, Date>();
  for (const [liftId, bySession] of sessions) out.set(liftId, new Date(Math.max(...bySession.values())));
  return out;
}

const laterOf = (app: Date | string | null | undefined, imported: Date | undefined): Date | string | null | undefined =>
  app != null && imported && imported.getTime() > timeOf(app) ? imported : app;

/**
 * The time-off suggestions for a day's lifts (`getExerciseDecaySuggestions`), with
 * imported training counted: for a lift already trained in the app at that tier, its
 * last session is the later of the app's (barbell or home) and the latest imported
 * session of the lift or its home versions (`importedLastTrainedByLift`). So an
 * imported session within LONG_BREAK_DAYS means no break for that lift, and an older
 * one can only shorten the break. A lift never done in the app is left to the starting
 * weights, as before. Imported sessions after `now` are not counted.
 *
 * @evidence time-off
 */
export function timeOffSuggestions(
  templateExercises: { exerciseId: string; tier: string }[],
  liftStates: LiftState[],
  phase: TrainingPhase,
  now: Date,
  variantStates: readonly VariantState[] = [],
  strengthSets: readonly StrengthSet[] = []
): ExerciseDecaySuggestion[] {
  const liftIds = [...new Set(templateExercises.map((e) => e.exerciseId))];
  const imported = importedLastTrainedByLift(strengthSets, variantStates, liftIds, now);
  const states =
    imported.size === 0
      ? liftStates
      : liftStates.map((state) => {
          const at = imported.get(state.exerciseId);
          if (!at) return state;
          const homeAt = (tier: "T1" | "T2") =>
            variantStates
              .filter((v) => v.liftId === state.exerciseId && v.tier === tier && v.lastSessionDate != null)
              .map((v) => timeOf(v.lastSessionDate!))
              .reduce<number | null>((a, b) => (a == null || b > a ? b : a), null);
          // Trained in the app at a tier: its barbell date, else its latest home session.
          const appAt = (tier: "T1" | "T2", barbell: Date | string | null | undefined) =>
            barbell ?? (homeAt(tier) != null ? new Date(homeAt(tier)!) : null);
          return {
            ...state,
            t1LastWorkoutDate: laterOf(appAt("T1", state.t1LastWorkoutDate), at) as LiftState["t1LastWorkoutDate"],
            t2LastWorkoutDate: laterOf(appAt("T2", state.t2LastWorkoutDate), at) as LiftState["t2LastWorkoutDate"],
          };
        });
  return getExerciseDecaySuggestions(templateExercises, states, phase, now, variantStates);
}
