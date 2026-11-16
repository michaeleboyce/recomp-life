// Pure helpers for the choices made on the Ready screen: the lighter weight an
// advisory's "reduce" offers, and which of the choices queued before START still
// describe the workout that started. No React, no database.
import type { CoachEventInput } from "@/lib/data/coachEvents";
import type { EquipmentProfile, PlanEdit, Tier } from "@/types";

/** An advisory's "reduce": today's T1 at this share of its weight. */
export const ADVISORY_REDUCTION = 0.9;

/** Barbell weights on the Ready screen move in steps of this many pounds. */
const BARBELL_STEP_LBS = 5;

/**
 * The weight an advisory's "reduce" sets for an entry: `ADVISORY_REDUCTION` of it, to
 * the step its equipment moves in (the dumbbell increment for a home substitute, 5 lbs
 * for a barbell). Null when that rounds back to the same weight or to nothing, so a
 * reduction that changes nothing is neither offered nor logged.
 */
export function lighterWeight(
  entry: { weight: number; substituteExerciseId?: string },
  equipment: Pick<EquipmentProfile, "dumbbellIncrementLbs">
): number | null {
  const step =
    entry.substituteExerciseId && equipment.dumbbellIncrementLbs > 0
      ? equipment.dumbbellIncrementLbs
      : BARBELL_STEP_LBS;
  const lighter = Math.round((entry.weight * ADVISORY_REDUCTION) / step) * step;
  return lighter > 0 && lighter < entry.weight ? lighter : null;
}

/**
 * A choice made on the Ready screen, kept until START so a choice for a workout that
 * never starts is never logged. `key` names the advisory (a later choice about the same
 * one replaces it); `requires` is the weight edit the choice made, without which it no
 * longer describes the plan.
 */
export interface PendingNote {
  key: string;
  templateId: string;
  input: CoachEventInput;
  requires?: { exerciseId: string; tier: Tier; weight: number };
}

/** Adds a note, replacing any earlier note with the same key. */
export function queueNote(notes: PendingNote[], note: PendingNote): PendingNote[] {
  return [...notes.filter((n) => n.key !== note.key), note];
}

/**
 * The notes to write once the workout has started: those for the day that started
 * whose weight edit is still in the plan, each carrying the session id.
 */
export function notesToWrite(
  notes: PendingNote[],
  started: { sessionId: string; templateId: string; edits: PlanEdit[] }
): CoachEventInput[] {
  return notes
    .filter((note) => note.templateId === started.templateId)
    .filter(
      (note) =>
        !note.requires ||
        started.edits.some(
          (edit) =>
            edit.kind === "weight" &&
            edit.exerciseId === note.requires!.exerciseId &&
            edit.tier === note.requires!.tier &&
            edit.weight === note.requires!.weight
        )
    )
    .map((note) => ({ ...note.input, data: { ...note.input.data, sessionId: started.sessionId } }));
}
