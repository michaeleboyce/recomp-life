// Starting weights the imported history suggests and the lifter has not confirmed yet
// (Settings → Import history): Today's "Needs attention" item and the honest reason on a
// lift planned at its default weight. Nothing here changes a planned weight; that is the
// lifter's choice on the import screen. Pure; no React.
import { startAdjustmentId } from "@/db/seed";
import type { StartingWeightSuggestion } from "@/lib/import/startingWeights";
import type { StrengthSet } from "@/lib/strength";
import type { LiftAdjustment, Tier } from "@/types";
import type { LiftReason, ReasonEntry } from "./todayModel";

/** The starting weights still to confirm, and what the imported history holds. */
export interface StartingWeightsToConfirm {
  /** Suggestions from the imported history the lifter has not confirmed (`unconfirmedStartingWeights`). */
  unconfirmed: StartingWeightSuggestion[];
  /** The exercises the imported history contains. */
  imported: ReadonlySet<string>;
}

/** Where the suggestions are confirmed. */
export const IMPORT_HISTORY_HREF = "/settings/import";

/** The tier a starting-weight adjustment set, from the fields it set. */
function tierOf(adjustment: Pick<LiftAdjustment, "set" | "variant">): Tier | null {
  if (adjustment.variant) return adjustment.variant.tier;
  const set = adjustment.set;
  if (set.t1Weight != null) return "T1";
  if (set.t2Weight != null) return "T2";
  if (set.t3Weight != null) return "T3";
  return null;
}

/**
 * The suggestions still to confirm: those whose weight differs from the one planned now
 * and with no starting weight confirmed for that lift, tier and exercise (a `start`
 * adjustment other than the program's own default one, `startAdjustmentId`, which every
 * new device records). One the lifter confirmed at another weight counts as confirmed.
 *
 * @evidence starting-weights
 */
export function unconfirmedStartingWeights(
  suggestions: readonly StartingWeightSuggestion[],
  adjustments: readonly Pick<LiftAdjustment, "id" | "exerciseId" | "source" | "set" | "variant" | "deletedAt">[]
): StartingWeightSuggestion[] {
  const confirmed = (s: StartingWeightSuggestion) =>
    adjustments.some(
      (a) =>
        a.deletedAt == null &&
        a.source === "start" &&
        a.id !== startAdjustmentId(a.exerciseId) &&
        a.exerciseId === s.liftId &&
        tierOf(a) === s.tier &&
        (s.location === "home" ? a.variant?.exerciseId === s.exerciseId : !a.variant)
    );
  return suggestions.filter((s) => s.current !== s.suggested && !confirmed(s));
}

/** The exercises with at least one imported set: what the imported history contains. */
export function importedExerciseIds(sets: readonly Pick<StrengthSet, "exerciseId" | "imported">[]): Set<string> {
  const ids = new Set<string>();
  for (const set of sets) if (set.imported) ids.add(set.exerciseId);
  return ids;
}

/** One "Needs attention" item: confirm the starting weights, or null when none waits. */
export interface StartingWeightsAttention {
  id: "starting-weights";
  title: string;
  body: string;
  action: { label: string; href: string };
}

export function startingWeightsAttention(
  unconfirmed: readonly StartingWeightSuggestion[]
): StartingWeightsAttention | null {
  if (unconfirmed.length === 0) return null;
  const lifts = new Set(unconfirmed.map((s) => s.exerciseName));
  const n = lifts.size;
  return {
    id: "starting-weights",
    title: "Confirm your starting weights",
    body: `Your imported history suggests starting weights for ${n === 1 ? "1 lift" : `${n} lifts`}. Until you confirm them, those lifts are planned at the default weight.`,
    action: { label: "Review", href: IMPORT_HISTORY_HREF },
  };
}

/**
 * The reason for a lift planned for its first time in the app: "Default starting
 * weight" with the history's suggestion when one waits for confirmation, and never
 * "First time" for an exercise the imported history contains. Every other reason is
 * returned as it is.
 */
export function startingWeightReason(
  entry: Pick<ReasonEntry, "exerciseId" | "substituteExerciseId" | "tier">,
  reason: LiftReason,
  unconfirmed: readonly StartingWeightSuggestion[],
  imported: ReadonlySet<string>
): LiftReason {
  if (reason.kind !== "first") return reason;
  const performed = entry.substituteExerciseId ?? entry.exerciseId;
  const location = entry.substituteExerciseId ? "home" : "gym";
  const waiting = unconfirmed.find(
    (s) => s.liftId === entry.exerciseId && s.tier === entry.tier && s.location === location && s.exerciseId === performed
  );
  if (waiting) return { kind: "unconfirmed", suggested: waiting.suggested, perHand: waiting.perHand };
  if (imported.has(performed)) return { kind: "notYetInApp" };
  return reason;
}

/**
 * Lift rows with `startingWeightReason` applied to each: the one place Today's rows and
 * every position of the Coming up full view get their honest first-time reason. Rows
 * are returned as they are while `toConfirm` is still loading.
 */
export function withStartingWeightReasons<
  Row extends { entry: Pick<ReasonEntry, "exerciseId" | "substituteExerciseId" | "tier">; reason: LiftReason },
>(rows: Row[], toConfirm: StartingWeightsToConfirm | undefined): Row[] {
  if (!toConfirm) return rows;
  return rows.map((row) => {
    const reason = startingWeightReason(row.entry, row.reason, toConfirm.unconfirmed, toConfirm.imported);
    return reason === row.reason ? row : { ...row, reason };
  });
}
