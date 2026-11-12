// Insights: one ranked list of things worth the user's attention, computed by pure
// rules from plain records. Each rule is a thin adapter from the context to an existing
// coaching function in src/lib (one file per kind under ./rules).
//
// "volume-balance" is part of the kind union but has no rule yet: with real GZCLP rep
// counts, calculateSessionVolumeRatio's thresholds flag nearly every cutting session that
// has a T3 and any accessory (its own tests note this), so wiring it would only nag.
import { KIND_ORDER, SEVERITY_ORDER, type Insight, type InsightContext } from "./types";
import { unfinishedWorkoutInsights } from "./rules/unfinishedWorkout";
import { weighInDueInsights } from "./rules/weighInDue";
import { inactivityInsights } from "./rules/inactivity";
import { deloadInsights } from "./rules/deload";
import { strengthStallInsights } from "./rules/strengthStall";
import { lossRateInsights } from "./rules/lossRate";
import { fatLossStallInsights } from "./rules/fatLossStall";
import { painCheckInsights } from "./rules/painCheck";
import { newPrInsights } from "./rules/newPr";

export type { InsightKind, InsightSeverity, Insight, InsightContext } from "./types";

function compareInsights(a: Insight, b: Insight): number {
  return (
    SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Every insight that currently applies, most important first: by severity
 * (action, warning, info, positive), then by a fixed order of kinds, then by id.
 * Deterministic for a given context.
 */
export function computeInsights(context: InsightContext): Insight[] {
  const deload = deloadInsights(context);
  const stall = fatLossStallInsights(context);

  const all: Insight[] = [
    ...unfinishedWorkoutInsights(context),
    ...weighInDueInsights(context),
    ...inactivityInsights(context),
    ...deload.insights,
    ...strengthStallInsights(context, deload.covered),
    // A stall wins over any loss-rate reading for the same weigh-ins.
    ...(stall.length > 0 ? [] : lossRateInsights(context)),
    ...stall,
    ...painCheckInsights(context),
    ...newPrInsights(context),
  ];
  return all.sort(compareInsights);
}
