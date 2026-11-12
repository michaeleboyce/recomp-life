import { calculateWeeklyRateOfLoss, getStallProtocolSuggestion } from "@/lib/rateOfLoss";
import { detectFatLossStall } from "@/lib/stallDetection";
import type { Insight, InsightContext } from "../types";
import { DAY_MS, plural, sortedWeights } from "../shared";

/** Upper bound on weeks looked back, so a long flat history stays cheap. */
const MAX_WEEKS = 52;

/**
 * Consecutive weekly checkpoints, counting back from the latest weigh-in, at which
 * calculateWeeklyRateOfLoss (over the entries up to that checkpoint) is in the stall zone.
 */
function consecutiveStallWeeks(weights: { date: Date; weight: number }[]): number {
  if (weights.length === 0) return 0;
  const latest = weights[weights.length - 1].date.getTime();
  let weeks = 0;
  for (let k = 0; k < MAX_WEEKS; k++) {
    const cutoff = latest - k * 7 * DAY_MS;
    const rate = calculateWeeklyRateOfLoss(weights.filter((w) => w.date.getTime() <= cutoff));
    if (!rate || rate.zone !== "stall") break;
    weeks++;
  }
  return weeks;
}

/**
 * detectFatLossStall (cutting only), shown only once getStallProtocolSuggestion has a
 * suggestion, i.e. about three slow weeks, as the fat-loss-stall rule's activation notes ask.
 */
export function fatLossStallInsights(ctx: InsightContext): Insight[] {
  const phase = ctx.settings?.trainingPhase;
  if (!phase) return [];
  const weights = sortedWeights(ctx.bodyweight, ctx.now);

  const stall = detectFatLossStall(weights, phase);
  if (!stall?.detected) return [];

  const rate = calculateWeeklyRateOfLoss(weights);
  if (!rate) return [];
  const weeks = consecutiveStallWeeks(weights);
  const suggestion = getStallProtocolSuggestion(rate.lbsPerWeek, rate.percentPerWeek, weeks);
  if (!suggestion) return [];

  return [
    {
      id: "fat-loss-stall",
      kind: "fat-loss-stall",
      severity: "warning",
      title: `Weight loss stalled for ${plural(weeks, "week")}`,
      body: `${stall.message} ${suggestion}.`,
      evidenceId: "fat-loss-stall",
    },
  ];
}
