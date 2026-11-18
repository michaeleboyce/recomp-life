// Builders for strength-model tests. Not used by app code.
import type { RepsInReserve } from "@/types";
import type { StrengthSet } from "./types";

const DAY = 86_400_000;
const START = Date.UTC(2026, 8, 1, 17, 0, 0);

/** Noon-ish on day `n` after a fixed start, plus `minute` minutes. */
export function day(n: number, minute = 0): Date {
  return new Date(START + n * DAY + minute * 60_000);
}

let counter = 0;

/** A set with sensible defaults: a T1 working AMRAP set of 5 reps at 100 lb. */
export function makeStrengthSet(overrides: Partial<StrengthSet> = {}): StrengthSet {
  counter += 1;
  return {
    id: `s${counter}`,
    sessionId: "w1",
    exerciseId: "squat",
    weight: 100,
    perHand: false,
    reps: 5,
    repsInReserve: null,
    role: "working",
    tier: "T1",
    isAMRAP: true,
    date: day(0),
    ...overrides,
  };
}

/**
 * A T1 session as GZCLP logs it: `sets - 1` non-AMRAP sets of `target` reps, then
 * the AMRAP set with `amrapReps`.
 */
export function makeT1Session(opts: {
  sessionId: string;
  exerciseId: string;
  weight: number;
  amrapReps: number;
  day: number;
  perHand?: boolean;
  sets?: number;
  target?: number;
  repsInReserve?: RepsInReserve | null;
}): StrengthSet[] {
  const count = opts.sets ?? 5;
  const target = opts.target ?? 3;
  const out: StrengthSet[] = [];
  for (let i = 0; i < count; i++) {
    const last = i === count - 1;
    out.push(
      makeStrengthSet({
        id: `${opts.sessionId}:${opts.exerciseId}:${i}`,
        sessionId: opts.sessionId,
        exerciseId: opts.exerciseId,
        weight: opts.weight,
        perHand: opts.perHand ?? false,
        reps: last ? opts.amrapReps : target,
        repsInReserve: last ? opts.repsInReserve ?? null : null,
        isAMRAP: last,
        date: day(opts.day, i * 3),
      })
    );
  }
  return out;
}
