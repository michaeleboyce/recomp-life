// The filter row of the adjustment log: All, Weights, Rest, Forecasts, Rules. Pure.
import { getRule } from "@/lib/evidence";
import type { AdjustmentEntry, AdjustmentSource, EvidenceArea } from "@/types";
import { realRuleId } from "./text";
import type { FeedGroup } from "./types";

/** The groups in display order, with the label of each chip. */
export const FEED_GROUPS: ReadonlyArray<{ id: FeedGroup; label: string }> = [
  { id: "all", label: "All" },
  { id: "weights", label: "Weights" },
  { id: "rest", label: "Rest" },
  { id: "forecasts", label: "Forecasts" },
  { id: "rules", label: "Rules" },
];

/** The group a source belongs to by what it is. A coach event has none of its own. */
const SOURCE_GROUP: Partial<Record<AdjustmentSource, FeedGroup>> = {
  progression: "weights",
  liftAdjustment: "weights",
  override: "weights",
  forecastRevision: "forecasts",
  selfCorrection: "forecasts",
  ruleChange: "rules",
};

/** The group a rule change or a coach event also shows under, by the area of its rule. */
const AREA_GROUP: Partial<Record<EvidenceArea, FeedGroup>> = {
  progression: "weights",
  rest: "rest",
  projection: "forecasts",
};

/**
 * The groups an entry shows under, "all" first. Progression, changes to a lift and
 * overrides are Weights; forecast revisions and self-corrections are Forecasts; a rule
 * change is Rules. A rule change or a coach event also shows under the topic of the
 * rule it cites: a rest rule under Rest, a progression rule under Weights, a
 * projection or forecast rule under Forecasts.
 */
export function groupsOf(entry: AdjustmentEntry): FeedGroup[] {
  const groups: FeedGroup[] = ["all"];
  const bySource = SOURCE_GROUP[entry.source];
  if (bySource) groups.push(bySource);
  if (entry.source === "ruleChange" || entry.source === "coachEvent") {
    const ruleId = realRuleId(entry.ruleId);
    const byArea = ruleId ? AREA_GROUP[getRule(ruleId).area] : undefined;
    if (byArea && !groups.includes(byArea)) groups.push(byArea);
  }
  return groups;
}

/** The entries of one group, in the order they came. */
export function filterFeed(feed: readonly AdjustmentEntry[], group: FeedGroup): AdjustmentEntry[] {
  return feed.filter((entry) => groupsOf(entry).includes(group));
}
