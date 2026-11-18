// Words for the strength trend chart: source names and ratios, why the line and the
// planner's number differ, what one dot is and how much it counts. Pure.
import { formatShortDate } from "@/components/chart-kit/scale";
import { DAY_MS } from "@/lib/dates";
import { repsInReserveLabel } from "@/lib/effort";
import { EXERCISES } from "@/lib/exercises";
import { LIFT_NAMES, isMainLift } from "@/lib/liftNames";
import { formatMuscle } from "@/lib/muscles";
import {
  MUSCLE_INDEX,
  MUSCLE_WEIGHTS,
  STRENGTH_POOLING,
  TARGET_EVIDENCE,
  TREND_SMOOTHING,
  pointWeightAt,
  type SmoothingKey,
  type StrengthTimeline,
  type TimelinePoint,
  type TimelineSource,
  type TrendReason,
} from "@/lib/strength";
import { percent, plural } from "@/lib/text";

export const SMOOTHING_LABELS: Record<SmoothingKey, string> = {
  light: "Light",
  standard: "Standard",
  heavy: "Heavy",
};

/** "185" for pounds, "104.2" for the index. */
export function formatTrendValue(v: number, unit: StrengthTimeline["unit"]): string {
  return unit === "lbs" ? String(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1);
}

/** "Bench press", "squat": the lift's names, falling back to the catalogue. */
function liftWords(liftId: string): { label: string; short: string } {
  if (isMainLift(liftId)) return LIFT_NAMES[liftId];
  const name = EXERCISES[liftId]?.name ?? liftId;
  return { label: name, short: name.toLowerCase() };
}

export function exerciseName(exerciseId: string): string {
  return EXERCISES[exerciseId]?.name ?? exerciseId;
}

/** What the chart is about: "Bench press" or "Quads". */
export function subjectName(timeline: StrengthTimeline): string {
  return timeline.subject.kind === "lift" ? liftWords(timeline.subject.liftId).label : formatMuscle(timeline.subject.muscle);
}

/** The legend's name for a source. */
export function sourceLabel(source: TimelineSource): string {
  if (source.kind === "own") return liftWords(source.exerciseId).label;
  if (source.kind === "imported") return `Imported ${liftWords(source.exerciseId).short}`;
  return exerciseName(source.exerciseId);
}

const ratioNumber = (r: number) => r.toFixed(2);

/**
 * The legend's second line: "÷ 0.89, from 20 pairs" or "÷ 0.83, starting ratio" for a
 * related exercise; how much a muscle's exercise counts; "counts fully" for the lift.
 */
export function sourceDetail(source: TimelineSource): string {
  if (source.kind === "related" && source.ratio) {
    const r = source.ratio;
    const basis = r.basis === "learned" ? `from ${plural(r.pairs, "pair")}` : "starting ratio";
    return `÷ ${ratioNumber(r.ratio)}, ${basis}, counts ${percent(source.weight)}`;
  }
  if (source.kind === "exercise") {
    return source.role === "primary"
      ? "main muscle, counts fully"
      : `helping muscle, counts ${percent(MUSCLE_WEIGHTS.secondary / MUSCLE_WEIGHTS.primary)}`;
  }
  if (source.kind === "imported") return "from another app, counts fully";
  return "counts fully";
}

/** "Standard smoothing: a session's weight halves every 14 days." */
export function smoothingText(key: SmoothingKey): string {
  const days = TREND_SMOOTHING[key];
  const planner = key === "standard" ? ", as the plan does" : "";
  return `${SMOOTHING_LABELS[key]} smoothing: a session's weight halves every ${plural(days, "day")}${planner}.`;
}

/**
 * One plain line on why the line's value today is not the headline number, or null
 * when they agree.
 */
export function reasonText(reason: TrendReason | null, timeline: StrengthTimeline): string | null {
  if (!reason || reason.kind === "match") return null;
  const unit = timeline.unit;
  const fmt = (v: number) => formatTrendValue(v, unit);
  if (reason.kind === "display") {
    return `The line uses the smoothing and sources you picked; the number above is the plan's, from every source with its ${STRENGTH_POOLING.evidenceHalfLifeDays}-day halving.`;
  }
  if (reason.kind === "muscle-latest") {
    return (
      `The line reads ${fmt(reason.line)} today: it averages every session, each halving every ` +
      `${STRENGTH_POOLING.evidenceHalfLifeDays} days, while the index takes each exercise's latest session ` +
      `and leaves out one not done for ${MUSCLE_INDEX.staleAfterDays} days.`
    );
  }
  const lift = timeline.subject.kind === "lift" ? liftWords(timeline.subject.liftId).short : "the lift";
  const parts: string[] = [];
  if (reason.ownBefore > 0) parts.push(plural(reason.ownBefore, `older ${lift} session`));
  if (reason.relatedBefore > 0) parts.push(plural(reason.relatedBefore, "earlier related session"));
  const older = parts.length > 0 ? parts.join(" and ") : "older sessions";
  return (
    `The line reads ${fmt(reason.line)} lbs today: it still averages ${older}, each halving every ` +
    `${STRENGTH_POOLING.evidenceHalfLifeDays} days. The plan starts from your latest ${lift} session ` +
    `and adds only the related sessions after it.`
  );
}

/** "70 each × 8, 1-2 left" for the dot's best set. */
export function setText(point: TimelinePoint): string {
  const s = point.bestSet;
  const weight = `${Number(s.weight.toFixed(1))}${s.perHand ? " each" : ""}`;
  return `${weight} × ${s.reps}${s.repsInReserve ? `, ${repsInReserveLabel(s.repsInReserve)}` : ""}`;
}

export interface PointDetail {
  title: string;
  lines: string[];
}

function dayWords(t: number): string {
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * What a tapped dot is: the set, its estimated max, the ratio and translated value (or
 * the index reading), and how much it counts at `at` and why.
 */
export function pointDetail(
  point: TimelinePoint,
  timeline: StrengthTimeline,
  at: number,
  halfLifeDays: number,
  share: number
): PointDetail {
  const source = timeline.sources.find((s) => s.id === point.sourceId);
  const name = exerciseName(point.exerciseId);
  const kind = point.provisional ? " · weight you set, not lifted yet" : point.imported ? " · imported" : "";
  const lines: string[] = [];
  const both = point.bestSet.perHand ? `, ${Math.round(point.bestSet.load)} lbs both dumbbells` : "";
  lines.push(`${point.provisional ? "Planned set" : "Best set"}: ${setText(point)}${both}.`);
  lines.push(`Estimated max ${Math.round(point.estimatedMax)} lbs.`);
  if (point.dropsCounted > 0) {
    lines.push(`With ${plural(point.dropsCounted, "drop set")}, the session counts as ${Math.round(point.strength)} lbs.`);
  }
  if (source?.kind === "related" && source.ratio) {
    const lift = timeline.subject.kind === "lift" ? liftWords(timeline.subject.liftId).short : "the lift";
    const basis = source.ratio.basis === "learned" ? `learned from ${plural(source.ratio.pairs, "pair")}` : "the starting ratio";
    lines.push(
      `${Math.round(point.strength)} ÷ ${ratioNumber(source.ratio.ratio)} (${basis}) = ${Math.round(point.value)} lbs of ${lift}.`
    );
  } else if (timeline.unit === "index") {
    lines.push(
      `Against ${name}'s own earlier sessions: ${formatTrendValue(point.value, "index")} on the index (${MUSCLE_INDEX.base} at the muscle's first reading).`
    );
  }

  const w = pointWeightAt(point, at, halfLifeDays);
  if (w.expired) {
    lines.push(`No longer counts: ${name} was logged on ${dayWords(point.until!)}, which replaces it.`);
  } else {
    const factors: string[] = [];
    if (source?.kind === "related") factors.push(`${STRENGTH_POOLING.transferWeight} for a related exercise`);
    if (source?.kind === "exercise") factors.push(`${point.weight} for a ${source.role === "primary" ? "main" : "helping"} muscle`);
    if (point.provisional) factors.push(`× ${TARGET_EVIDENCE.weight} for a weight not lifted yet`);
    const days = Math.max(0, Math.round((at - point.t) / DAY_MS));
    const age = `${w.age < 0.01 ? w.age.toExponential(1) : w.age.toFixed(2)} for its age (${plural(days, "day")}, halving every ${plural(halfLifeDays, "day")})`;
    const total = w.weight < 0.01 ? w.weight.toExponential(1) : w.weight.toFixed(2);
    const sum = factors.length > 0 ? `${factors.join(" ")} × ${age} = ${total}` : age;
    lines.push(`Counts today: ${sum}, ${percent(share)} of the line.`);
  }
  return { title: `${name} · ${formatShortDate(point.t)}${kind}`, lines };
}

/** The accessible summary of what the chart shows in the window. */
export function trendSummary(args: {
  timeline: StrengthTimeline;
  from: number;
  to: number;
  first: number | null;
  last: number | null;
  dots: readonly TimelinePoint[];
  sourceNames: ReadonlyMap<string, string>;
}): string {
  const { timeline, from, to, first, last, dots, sourceNames } = args;
  const unit = timeline.unit === "lbs" ? " lbs" : "";
  const what = timeline.unit === "lbs" ? "estimated 1RM trend" : "strength trend (an index)";
  const head = `${subjectName(timeline)} ${what}, ${formatShortDate(from)} to ${formatShortDate(to)}`;
  if (first === null || last === null) return `${head}: no sessions in this window.`;
  const counts = new Map<string, number>();
  for (const d of dots) counts.set(d.sourceId, (counts.get(d.sourceId) ?? 0) + 1);
  const bySource = [...counts]
    .map(([id, n]) => `${n} ${sourceNames.get(id) ?? id}`)
    .join(", ");
  const anchor = timeline.anchor
    ? ` ${timeline.unit === "lbs" ? "The plan's estimate today" : "The index today"}: ${formatTrendValue(timeline.anchor.value, timeline.unit)}${unit}.`
    : "";
  return `${head}: the line goes from ${formatTrendValue(first, timeline.unit)} to ${formatTrendValue(last, timeline.unit)}${unit}. ${plural(dots.length, "session")} shown (${bySource}).${anchor}`;
}

/** "Mar 4 – Jun 8", with years when the span crosses one: "Nov 11, 2025 – Jun 8, 2026". */
export function spanText(from: number, to: number): string {
  const a = new Date(from);
  const b = new Date(to);
  if (a.getFullYear() === b.getFullYear()) return `${formatShortDate(from)} – ${formatShortDate(to)}`;
  return `${formatShortDate(from)}, ${a.getFullYear()} – ${formatShortDate(to)}, ${b.getFullYear()}`;
}
