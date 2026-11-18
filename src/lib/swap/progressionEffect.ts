// What swapping an exercise does to the program (W10), worded from the progression code's
// actual behaviour. Pure. progressionEffect.test.ts runs real sessions through
// `computeCompletion`, `rebuildDerived` and the rotation fold and fails if this text and
// that behaviour ever disagree.
//
// The behaviour it describes (src/lib/workout/completeWorkout.ts, credit.ts):
// - A T1, T2 or T3 swapped for another exercise (a `swap` edit, before or during a
//   workout) has none of its own sets in the session: `computeCompletion` records it as
//   not done and leaves its lift state exactly as it was: weight, stage, fail count and
//   last-workout date. The same holds when it was ended early during the workout (a
//   `scheme` edit to the sets done): the entry no longer matches its prescription
//   (`classifyEntry`), so it is logged only. Neither is a pass or a miss.
// - The swapped-in exercise is logged only: it changes no lift state, and a `swap` to a
//   home version of the lift is not a home substitute (Configure's `overrides`), so its
//   home exercise state does not move either. (The original's stored prescription still
//   spends the re-entry steps it took in at start: at the gym `passesSinceGym` of its
//   home exercises goes to 0, at home `gymPassesSinceHome` is cleared, swapped or not.)
// - A swapped T1 means the session does not move the A1 -> B1 -> A2 -> B2 rotation
//   (`sessionCountsForRotation`): the same day is due next time. A swapped T2 or T3 does
//   not affect the rotation.
// - An accessory has no program progression; the exercise swapped in is planned from its
//   own sets next time (`accessoryPrescription`).
import { EXERCISES } from "@/lib/exercises";
import { homeOptionsFor } from "@/lib/workout/variant";
import { catalogueName, liftShortName } from "@/lib/liftNames";
import type { Tier, WorkoutLocation } from "@/types";

/**
 * "held": a program lift left exactly as it is, neither passed nor missed.
 * "counts": at home before a workout, one of the lift's own home versions: it is done as
 *   the lift (the home-substitute path, `chooseHomeVariant`), with its own weight that
 *   moves up or resets by GZCLP, and the session counts as done.
 * "accessory": no program lift is involved.
 * "none": nothing is swapped (the same exercise).
 */
export type SwapProgressionKind = "held" | "counts" | "accessory" | "none";

export interface SwapProgressionEffect {
  kind: SwapProgressionKind;
  /** The original lift's weight, stage, fail count and last-workout date stay as they are. */
  liftHeld: boolean;
  /** The swapped-in exercise is done as the lift: its own home state moves (kind "counts"). */
  replacementCounts: boolean;
  /** For a T1: the session does not move the rotation, so the same day is due next time. */
  dayStaysDue: boolean;
  /** One or two plain sentences for the swap sheet. */
  text: string;
}

export interface SwapProgressionContext {
  /** Sets of the original already logged in this session (a swap during the workout). */
  setsLogged?: number;
  /** Where the workout is: only at home can a home version count as the lift. */
  location?: WorkoutLocation;
  /**
   * A swap during the workout: the session's home exercises were fixed at start, so a
   * home version picked then is a swap like any other (logged only).
   */
  inWorkout?: boolean;
}

/**
 * True when `exerciseId` is one of the program lift's own home versions (its dumbbell
 * alternative or its fallback chain) and the lift is converted at home: picking it at
 * home before a workout goes through the home-substitute path (`chooseHomeVariant`).
 */
export function isHomeVersionOf(liftId: string, exerciseId: string): boolean {
  const lift = EXERCISES[liftId];
  if (!lift?.requiresGym || !lift.dumbbellAlternative || !EXERCISES[exerciseId]) return false;
  return homeOptionsFor(liftId).includes(exerciseId);
}

/** True when the swap is done as the lift (kind "counts"): see `isHomeVersionOf`. */
export function swapCountsAsLift(
  tier: Tier,
  originalId: string,
  replacementId: string,
  context: SwapProgressionContext = {}
): boolean {
  return (
    context.location === "home" &&
    !context.inWorkout &&
    !(context.setsLogged && context.setsLogged > 0) &&
    PROGRAM_TIERS.includes(tier) &&
    isHomeVersionOf(originalId, replacementId)
  );
}

const PROGRAM_TIERS: readonly Tier[] = ["T1", "T2", "T3"];
const nameOf = catalogueName;

/**
 * The line a finished workout shows for an exercise that stood in for a program lift
 * (an `add` edit with `replaces`), instead of an accessory's next-time verdict: what it
 * stood in for and what that did, in `swapProgressionEffect`'s words.
 *
 * @evidence swap-recommendation
 */
export function standInText(replacementId: string, replaces: { exerciseId: string; tier: Tier }): string {
  const effect = swapProgressionEffect(replaces.tier, replaces.exerciseId, replacementId);
  return `Stood in for ${nameOf(replaces.exerciseId)}. ${effect.text}`;
}

/**
 * What the program does with `originalId` at `tier` when it is swapped for
 * `replacementId`, as the progression code does it today (see the comment at the top of
 * this file). Pure: reads the catalogue for names only.
 */
export function swapProgressionEffect(
  tier: Tier,
  originalId: string,
  replacementId: string,
  context: SwapProgressionContext = {}
): SwapProgressionEffect {
  const original = nameOf(originalId);
  const replacement = nameOf(replacementId);
  if (originalId === replacementId) {
    return { kind: "none", liftHeld: false, replacementCounts: false, dayStaysDue: false, text: "Nothing changes." };
  }
  if (!PROGRAM_TIERS.includes(tier)) {
    return {
      kind: "accessory",
      liftHeld: false,
      replacementCounts: false,
      dayStaysDue: false,
      text: `Accessories are not part of the program's progression: next time ${replacement} is planned from its own sets.`,
    };
  }
  if (swapCountsAsLift(tier, originalId, replacementId, context)) {
    return {
      kind: "counts",
      liftHeld: false,
      replacementCounts: true,
      dayStaysDue: false,
      text: `Counts as ${liftShortName(originalId)}: ${replacement} has its own weight and moves up on its own.`,
    };
  }
  const logged = context.setsLogged ?? 0;
  const kept =
    logged > 0
      ? `The ${logged === 1 ? "set" : `${logged} sets`} of ${original} already done ${logged === 1 ? "is" : "are"} kept in the log. `
      : "";
  const held = `${original} stays at its ${tier} weight and stage: a swapped lift counts as neither a pass nor a miss. ${replacement} is logged only.`;
  const day = tier === "T1" ? " This day stays due next time." : "";
  return {
    kind: "held",
    liftHeld: true,
    replacementCounts: false,
    dayStaysDue: tier === "T1",
    text: `${kept}${held}${day}`,
  };
}
