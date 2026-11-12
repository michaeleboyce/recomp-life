// The plain-language sentence at the top of the projection screen. Pure.
import { EXERCISES } from "@/lib/exercises";
import type { ProjectionBaseline } from "./baseline";
import type { Projection, ProjectionScenario, RelatedTrend } from "./project";

/** "Barbell Squat" -> "squat", "Barbell OHP" -> "OHP"; unknown ids are returned as is. */
export function liftShortName(exerciseId: string): string {
  const name = EXERCISES[exerciseId]?.name;
  if (!name) return exerciseId;
  return name
    .replace(/^Barbell\s+/, "")
    .split(" ")
    .map((word) => (word === word.toUpperCase() ? word : word.toLowerCase()))
    .join(" ");
}

/** 2 -> "2", 1.53 -> "1.5", 5.08 -> "5.1". */
export function formatAmount(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const percent = (share: number) => `${Math.round(share * 100)}%`;
const about = (value: number) => String(Math.round(value));
const weeksText = (weeks: number) => `${weeks} week${weeks === 1 ? "" : "s"}`;

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** One phrase per scenario field that differs from the baseline, in a fixed order. */
export function describeChanges(
  baseline: ProjectionBaseline,
  scenario: ProjectionScenario
): string[] {
  const lift = liftShortName(baseline.exerciseId);
  const changes: string[] = [];
  const s = scenario.sessionsPerWeek;
  if (s !== undefined && s !== baseline.sessionsPerWeek) {
    changes.push(
      `${formatAmount(s)} ${lift} session${s === 1 ? "" : "s"} a week instead of ${formatAmount(baseline.sessionsPerWeek)}`
    );
  }
  const d = scenario.directWeeklySets;
  if (d !== undefined && d !== baseline.directWeeklySets) {
    changes.push(
      `${formatAmount(d)} sets of ${lift} a week instead of ${formatAmount(baseline.directWeeklySets)}`
    );
  }
  const r = scenario.relatedWeeklySets;
  if (r !== undefined && r !== baseline.relatedWeeklySets) {
    changes.push(
      `${formatAmount(r)} sets a week from other exercises for the same muscles instead of ${formatAmount(baseline.relatedWeeklySets)}`
    );
  }
  const p = scenario.passRate;
  if (p !== undefined && p !== baseline.passRate) {
    changes.push(`${percent(p)} of sessions passed instead of ${percent(baseline.passRate)}`);
  }
  if (scenario.phase !== undefined && scenario.phase !== baseline.phase) {
    changes.push(`${scenario.phase} instead of ${baseline.phase}`);
  }
  return changes;
}

/** A slope smaller than this (lbs a week, either way) reads as flat. */
export const FLAT_SLOPE_LBS = 0.25;

/** "Goblet Squat is rising 2.5 lb a week", "... is flat", "... is falling 1 lb a week". */
export function describeRelatedTrend(trend: RelatedTrend): string {
  const name = EXERCISES[trend.exerciseId]?.name ?? trend.exerciseId;
  const slope = trend.slopePerWeek;
  if (!Number.isFinite(slope) || Math.abs(slope) < FLAT_SLOPE_LBS) return `${name} is flat`;
  const direction = slope > 0 ? "rising" : "falling";
  return `${name} is ${direction} ${formatAmount(Math.abs(slope))} lb a week`;
}

/**
 * The sentence for the top of the projection screen, e.g. "With 2 squat sessions a
 * week instead of 1.5, about 258 in 12 weeks. On your current trend, about 252."
 * `projection` is the scenario's projection, `comparison` the current trend's (empty
 * scenario). Only the fields the scenario changed are named.
 */
export function summarizeScenario(
  baseline: ProjectionBaseline,
  scenario: ProjectionScenario,
  projection: Projection,
  comparison: Projection
): string {
  const lift = liftShortName(baseline.exerciseId);
  if (projection.status === "insufficient-data" || projection.points.length === 0) {
    return `Not enough recent ${lift} results to project yet.`;
  }
  const weeks = projection.points.length - 1;
  const end = projection.points[weeks].v;
  if (projection.status === "flat-trend") {
    return `Your recent ${lift} estimates are not rising, so the projection holds about ${about(end)} for the next ${weeksText(weeks)}.`;
  }
  const changes = describeChanges(baseline, scenario);
  const current = comparison.points[comparison.points.length - 1]?.v ?? end;
  if (changes.length === 0) {
    return `On your current trend, about ${about(current)} in ${weeksText(weeks)}.`;
  }
  return `With ${joinList(changes)}, about ${about(end)} in ${weeksText(weeks)}. On your current trend, about ${about(current)}.`;
}
