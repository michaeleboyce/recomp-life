import { checkSystemicFatigue } from "@/lib/deload";
import type { LiftState } from "@/types";
import type { Insight, InsightContext } from "../types";
import { joinList, liftName } from "../shared";

const OPTIONAL = "If you feel run down, an easier week is optional";

/**
 * Fatigue signs from checkSystemicFatigue, using the e1RM trend only.
 *
 * The fatigue-detection rule's activation notes say RPE and AMRAP trends must be
 * compared at equal load (they rise and fall as the weight goes up every session)
 * "or use the estimated 1RM trend only". LiftState does not record the load behind
 * each RPE/AMRAP value, so those arrays are blanked before the check.
 *
 * Returns the insights and the lifts they cover, so strength-stall does not repeat them.
 *
 * @evidence fatigue-detection
 */
export function deloadInsights(ctx: InsightContext): { insights: Insight[]; covered: Set<string> } {
  const covered = new Set<string>();
  const phase = ctx.settings?.trainingPhase;
  if (!phase) return { insights: [], covered };

  const lifts: LiftState[] = ctx.liftStates
    .filter((l) => !l.deloadActive && (l.recentE1RMs?.length ?? 0) > 0)
    .map((l) => ({ ...l, recentAvgRPEs: [], recentAMRAPReps: [] }))
    .sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));

  const alert = checkSystemicFatigue(lifts, phase);
  if (!alert) return { insights: [], covered };

  const flagged = [...new Set(alert.signals.map((s) => s.lift))].sort();
  flagged.forEach((id) => covered.add(id));

  if (alert.level === "systemic") {
    const sessions = Math.max(...alert.signals.map((s) => s.consecutiveSessions));
    return {
      covered,
      insights: [
        {
          id: "deload:systemic",
          kind: "deload",
          severity: "warning",
          title: `Fatigue signs on ${flagged.length} lifts`,
          body: `Estimated 1RM has dropped ${sessions} sessions in a row on ${joinList(flagged.map(liftName))}. ${OPTIONAL}.`,
          evidenceId: "fatigue-detection",
        },
      ],
    };
  }

  const insights = alert.signals.map((signal): Insight => {
    const state = lifts.find((l) => l.exerciseId === signal.lift);
    const values = (state?.recentE1RMs ?? []).slice(-(signal.consecutiveSessions + 1));
    return {
      id: `deload:${signal.lift}`,
      kind: "deload",
      severity: "warning",
      title: `Fatigue sign on ${liftName(signal.lift)}`,
      body: `Estimated 1RM has dropped ${signal.consecutiveSessions} sessions in a row: ${values.join(", ")} lbs. ${OPTIONAL}; one better session clears this.`,
      evidenceId: "fatigue-detection",
    };
  });
  return { insights, covered };
}
