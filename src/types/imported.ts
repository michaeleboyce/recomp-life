// Sessions imported from another app's export (Fitbod, Gravl). History only: they are
// stored apart from `workouts` so nothing that reads workouts has to learn to skip them.
import type { Stamped } from "./index";

/** One set of an imported session, as stored inside its session's JSON. */
export interface ImportedSetRecord {
  /** Deterministic id from the parser. */
  id: string;
  /** Name as written in the file. */
  exerciseName: string;
  /** The app's exercise id, or null when the name is not mapped. */
  mappedExerciseId: string | null;
  /** Muscles guessed from the name's words; only set for an unmapped exercise. */
  muscles?: string[];
  /** 1-based position within the exercise in the session. */
  setOrder: number;
  reps: number | null;
  /** Weight of ONE implement, in lbs. */
  weightPerImplementLb: number | null;
  /** How many implements the weight is per (2 dumbbells); null when the file does not say. */
  implementCount: number | null;
  multiplierRaw: number | null;
  /** false when the source marks the weight as not adding load (assistance). */
  weightCountsAsLoad: boolean;
  /** Seconds. */
  durationSec: number | null;
  /** Metres. */
  distanceM: number | null;
  role: "warmup" | "work" | "drop";
  /** The source's effort word ("Easy", "Hard"), else null. */
  effort: string | null;
}

export interface ImportedSessionRecord extends Stamped {
  /** The parser's deterministic session id: importing a file twice adds nothing. */
  id: string;
  clientId: string;
  sourceApp: "fitbod" | "gravl";
  startedAt: Date;
  /** true when the file carried no time zone and `startedAt` is local wall-clock. */
  startIsLocal: boolean;
  endedAt: Date | null;
  title: string;
  notes: string;
  /** Which import added this row; undo soft-deletes a batch. */
  importBatchId: string;
  sets: ImportedSetRecord[];
  synced: boolean;
}
