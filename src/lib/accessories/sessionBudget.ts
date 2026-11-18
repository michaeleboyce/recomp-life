// The session length to plan for (L1 to L4): the setting, and which accessories fit in
// it. A planning convenience on the app's own time estimate (`estimateWorkoutSeconds`,
// corrected by the lifter's own pace as the screens show it), not a training rule: the
// program's lifts are never shortened, pins are always kept. Pure and deterministic.
import { estimateSetSeconds, estimateWorkoutSeconds } from "@/lib/workout/duration";
import type { TrainingPhase, UserSettings } from "@/types";
import type { WorkoutExerciseState } from "@/lib/workout/types";

/** The lengths offered in Settings and on the Ready screen, in minutes. */
export const SESSION_MINUTE_CHOICES = [30, 45, 60, 75, 90] as const;

/** The length planned for when none is set. */
export const DEFAULT_SESSION_MINUTES = 60;

/** The longest length a stored or linked value may name, in minutes. */
const MAX_SESSION_MINUTES = 600;

/** A session length: minutes, or null for no limit. */
export type SessionMinutes = number | null;

/**
 * A stored or linked length as readers can use it: whole minutes from 1 to 600, or null
 * (no limit). Undefined for anything else, which reads as the default.
 */
export function sanitizeSessionMinutes(value: unknown): SessionMinutes | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const minutes = Math.round(value);
  return minutes >= 1 && minutes <= MAX_SESSION_MINUTES ? minutes : undefined;
}

/** The length in force: the stored one, else DEFAULT_SESSION_MINUTES; null is no limit. */
export function sessionMinutesOf(settings: Pick<UserSettings, "sessionMinutes"> | null | undefined): SessionMinutes {
  const stored = sanitizeSessionMinutes(settings?.sessionMinutes);
  return stored === undefined ? DEFAULT_SESSION_MINUTES : stored;
}

/** `?minutes=45` or `?minutes=none`: a length for one workout; undefined when absent or unreadable. */
export function sessionMinutesFromParam(value: string | null | undefined): SessionMinutes | undefined {
  if (value == null || value === "") return undefined;
  if (value === "none") return null;
  return /^\d+$/.test(value) ? sanitizeSessionMinutes(Number(value)) : undefined;
}

/** The URL value for a length: "45", or "none" for no limit. */
export function sessionMinutesParam(minutes: SessionMinutes): string {
  return minutes === null ? "none" : String(minutes);
}

/** "60 min", "No limit". */
export function sessionMinutesLabel(minutes: SessionMinutes): string {
  return minutes === null ? "No limit" : `${minutes} min`;
}

/** One accessory the budget is asked about, in the order it would be added. */
export interface BudgetCandidate {
  exerciseId: string;
  sets: number;
  /** Pinned (or named outright by the user): always kept, whatever the length. */
  pinned: boolean;
}

/** An accessory left out for time, with what the screens say about it. */
export interface LeftOutForTime {
  exerciseId: string;
  /** Minutes it would have added, rests included. */
  minutes: number;
  /** "Left out to fit 60 min". */
  reason: string;
}

export interface SessionBudget {
  /** The length planned for; null is no limit. */
  minutes: SessionMinutes;
  /** The program's lifts alone (warm-ups as planned), to the nearest minute. */
  programMinutes: number;
  /** The program's lifts and the accessories kept, to the nearest minute. */
  plannedMinutes: number;
  /** How many accessories were asked about. */
  offered: number;
  /** The accessories kept, in order. */
  kept: string[];
  /** The ones left out for time, in the order they were asked about. */
  leftOut: LeftOutForTime[];
  /** True when the program's lifts alone take longer than the length. */
  programOverBudget: boolean;
  /** True when the plan as kept is longer than the length (the lifts or the pins). */
  overBudget: boolean;
}

export interface FitAccessoriesInput {
  /** The length planned for; null is no limit. */
  minutes: SessionMinutes;
  /** The program's plan before accessories, warm-ups as configured. */
  programPlan: ReadonlyArray<Pick<WorkoutExerciseState, "tier" | "targetSets">>;
  phase?: TrainingPhase;
  /** In the order they would be added (best first). */
  candidates: readonly BudgetCandidate[];
  /**
   * The lifter's own pace (`sessionPaceCorrection`): real length over length on paper,
   * the factor the session-length forecast on Today, Ready and Coming up applies. Left
   * out, or not a positive number, the length on paper (1).
   */
  pace?: number;
}

const toMinutes = (seconds: number) => Math.round(seconds / 60);

/**
 * Which accessories fit in the session length. The length of a plan is the one the
 * screens show: the app's estimate on paper (`estimateWorkoutSeconds`: every set plus
 * the rest after it) times the lifter's own `pace` (1 before there is history). The
 * program's lifts are always in and never shortened. Pinned accessories are always
 * kept, even past the length. The rest are taken in the order given, each kept only
 * when the plan with it stays at or under the length; one that does not fit is left
 * out and the next is tried. When the lifts alone are over the length, no unpinned
 * accessory is kept. With no limit, every one is kept.
 *
 * @evidence session-length-budget
 */
export function fitAccessoriesToBudget(input: FitAccessoriesInput): SessionBudget {
  const { minutes, phase, candidates } = input;
  const pace = typeof input.pace === "number" && Number.isFinite(input.pace) && input.pace > 0 ? input.pace : 1;
  const programSeconds = estimateWorkoutSeconds(input.programPlan, phase) * pace;
  const perSet = estimateSetSeconds("accessory", phase) * pace;
  const secondsOf = (c: BudgetCandidate) => Math.max(0, c.sets) * perSet;
  const limit = minutes === null ? Infinity : minutes * 60;
  const programOverBudget = programSeconds > limit;

  // Pins first: their time is taken whatever the order.
  let total = programSeconds;
  for (const c of candidates) if (c.pinned) total += secondsOf(c);

  const kept: string[] = [];
  const leftOut: LeftOutForTime[] = [];
  for (const c of candidates) {
    if (c.pinned) {
      kept.push(c.exerciseId);
      continue;
    }
    const seconds = secondsOf(c);
    if (!programOverBudget && total + seconds <= limit) {
      kept.push(c.exerciseId);
      total += seconds;
      continue;
    }
    leftOut.push({
      exerciseId: c.exerciseId,
      minutes: Math.max(1, toMinutes(seconds)),
      reason:
        programOverBudget
          ? `The main lifts alone take about ${toMinutes(programSeconds)} min`
          : `Left out to fit ${minutes} min`,
    });
  }
  return {
    minutes,
    programMinutes: toMinutes(programSeconds),
    plannedMinutes: toMinutes(total),
    offered: candidates.length,
    kept,
    leftOut,
    programOverBudget,
    overBudget: total > limit,
  };
}

/**
 * The one line the accessory lists show about the length: "2 of 3 accessories fit in
 * 60 min", or why none or only the pinned ones are in. Null with no limit, or when no
 * accessory was asked about (the "ask me" and "none" modes).
 */
export function budgetLine(budget: SessionBudget | null | undefined): string | null {
  if (!budget || budget.minutes === null || budget.offered === 0) return null;
  const { minutes, kept, offered } = budget;
  if (budget.programOverBudget) {
    const head = `The main lifts alone take about ${budget.programMinutes} of ${minutes} min`;
    return kept.length > 0 ? `${head}: only your pinned accessories are in` : `${head}: no accessories added`;
  }
  if (budget.overBudget) return `Your pinned accessories take it to about ${budget.plannedMinutes} of ${minutes} min`;
  return `${kept.length} of ${offered} ${offered === 1 ? "accessory fits" : "accessories fit"} in ${minutes} min`;
}

/** "1 left out to fit 60 min": the short form for a list header; null when none was left out. */
export function leftOutNote(budget: SessionBudget | null | undefined): string | null {
  if (!budget || budget.minutes === null || budget.leftOut.length === 0) return null;
  return `${budget.leftOut.length} left out to fit ${budget.minutes} min`;
}

/** "About 58 of 60 min", or "About 58 min" with no limit. */
export function lengthAgainstTarget(forecastMinutes: number, target: SessionMinutes): string {
  return target === null ? `About ${forecastMinutes} min` : `About ${forecastMinutes} of ${target} min`;
}
