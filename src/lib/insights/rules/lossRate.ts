import { calculateWeeklyRateOfLoss } from "@/lib/rateOfLoss";
import type { Insight, InsightContext } from "../types";
import { DAY_MS, sortedWeights } from "../shared";

/** A rate from weigh-ins older than this is not "current". */
const MAX_STALENESS_DAYS = 14;

/**
 * calculateWeeklyRateOfLoss while cutting: green is on pace, yellow or red is off
 * target. The stall zone is left to fat-loss-stall, which waits for about three weeks.
 */
export function lossRateInsights(ctx: InsightContext): Insight[] {
  if (ctx.settings?.trainingPhase.mode !== "cutting") return [];
  const weights = sortedWeights(ctx.bodyweight, ctx.now);
  if (weights.length === 0) return [];
  const latest = weights[weights.length - 1].date.getTime();
  if (ctx.now.getTime() - latest > MAX_STALENESS_DAYS * DAY_MS) return [];

  const rate = calculateWeeklyRateOfLoss(weights);
  if (!rate || rate.zone === "stall") return [];

  const losing = `Losing ${rate.lbsPerWeek.toFixed(1)} lbs a week (${rate.percentPerWeek}% of bodyweight)`;
  const base = { id: "loss-rate", kind: "loss-rate", evidenceId: "rate-of-loss" } as const;

  if (rate.zone === "green") {
    return [
      { ...base, severity: "positive", title: "Weight loss on pace", body: `${losing}, inside the 0.5 to 1% target.` },
    ];
  }
  const tooFast = rate.percentPerWeek > 1;
  return [
    {
      ...base,
      severity: "warning",
      title: tooFast ? "Weight loss faster than target" : "Weight loss slower than target",
      body: `${losing}. The target is 0.5 to 1% a week.`,
    },
  ];
}
