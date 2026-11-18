/**
 * The estimated-max chart's data: every session estimate behind a lift's strength (or a
 * muscle's strength trend) as dots by source, the smooth line through them and which
 * sources carry it each week. Pure. Display only: no plan, forecast or stored value
 * reads it; the planner reads `pooledLiftEstimate`.
 *
 * One timeline type serves both subjects:
 * - a lift (`strengthTimeline`): pounds; the lift's own sessions, its imported ones, and
 *   each related exercise's sessions divided by the exercise's ratio (`learnTransferRatios`,
 *   the planner's ratios); a weight set by hand and not lifted yet joins as a target;
 * - a muscle (`muscleTimeline`): the index of `muscleStrengthIndex`; one source per
 *   exercise that works it, each session at the relative the index gave it.
 *
 * The line is the recency-weighted mean of every dot up to each day, with the strength
 * library's weights (a lift session 1, a related one STRENGTH_POOLING.transferWeight,
 * a target TARGET_EVIDENCE.weight of that; a muscle's exercise MUSCLE_WEIGHTS), each
 * halving per half-life. Its band is one standard deviation, by the pooled estimate's
 * own formula (session scatter STRENGTH_POOLING.sessionSdFraction, a related session's
 * by that ÷ √transferWeight, plus each ratio's uncertainty).
 *
 * Spec: docs/plans/2026-11-17-estimated-max-chart-design.md (M1 to M3).
 *
 * @evidence strength-pooling
 */

import { DAY_MS } from "@/lib/dates";
import { nextWeekMs, weekStartMs } from "@/lib/metrics/helpers";
import type { MuscleId } from "@/types";
import { MUSCLE_WEIGHTS, STRENGTH_POOLING, TARGET_EVIDENCE } from "./coefficients";
import { sessionEstimates, targetEstimates } from "./estimate";
import type { MuscleStrengthIndex } from "./muscleIndex";
import { pooledLiftEstimate } from "./pooled";
import { learnTransferRatios } from "./ratio";
import type { EstimateSet, PooledEstimate, SessionEstimate, StrengthSet, TransferRatio } from "./types";

/** The smoothing choices for the line, as half-lives in days. Display only. */
export const TREND_SMOOTHING = {
  /** Follows recent sessions closely: half the planner's half-life. */
  light: STRENGTH_POOLING.evidenceHalfLifeDays / 2,
  /** The planner's own half-life. */
  standard: STRENGTH_POOLING.evidenceHalfLifeDays,
  /** Slow: three times the planner's half-life, for long windows. */
  heavy: STRENGTH_POOLING.evidenceHalfLifeDays * 3,
} as const;

export type SmoothingKey = keyof typeof TREND_SMOOTHING;
export const SMOOTHING_KEYS: readonly SmoothingKey[] = ["light", "standard", "heavy"];

/**
 * Where a dot comes from. `own`: the lift itself in the app; `imported`: the lift in
 * sessions imported from another app; `related`: another exercise translated through its
 * ratio; `exercise`: one exercise behind a muscle's index.
 */
export type TimelineSourceKind = "own" | "imported" | "related" | "exercise";

export interface TimelineSource {
  /** `own`, `imported`, or the exercise id. */
  id: string;
  kind: TimelineSourceKind;
  exerciseId: string;
  /** How much one session counts against a session of the lift itself, before age. */
  weight: number;
  /** A related exercise's ratio (exercise ÷ lift), as the planner uses it. */
  ratio?: TransferRatio;
  /** A muscle's exercise: whether it works the muscle as a primary or a secondary muscle. */
  role?: "primary" | "secondary";
}

export interface TimelinePoint {
  /** `exerciseId:sessionId`, plus `:target` for a target. */
  id: string;
  sourceId: string;
  exerciseId: string;
  sessionId: string;
  t: number;
  /** What the session says in the subject's units: lift pounds, or the muscle's index. */
  value: number;
  /** The session's strength in its own units (total load moved). */
  strength: number;
  /** The session's estimated max, its own units. */
  estimatedMax: number;
  bestSet: EstimateSet;
  dropsCounted: number;
  /** Weight before age: the source's, times TARGET_EVIDENCE.weight for a target. */
  weight: number;
  /** `weight` after the standard halving up to `now`. */
  weightToday: number;
  imported: boolean;
  /** A weight set by hand and not lifted yet. */
  provisional: boolean;
  /** A target stops counting at the exercise's next logged session. */
  until?: number;
}

export type TimelineSubject = { kind: "lift"; liftId: string } | { kind: "muscle"; muscle: MuscleId };

export interface StrengthTimeline {
  subject: TimelineSubject;
  unit: "lbs" | "index";
  /** Sources with at least one dot, own first. */
  sources: TimelineSource[];
  /** Oldest first. */
  points: TimelinePoint[];
  now: number;
  /**
   * The number the app acts on today: the planner's estimate (`pooledLiftEstimate`) for a
   * lift, the index's latest reading (`muscleStrengthIndex`) for a muscle.
   */
  anchor: { value: number; sd: number | null; t: number } | null;
  /** A lift's planner estimate, for explaining a difference from the line. */
  pooled: PooledEstimate | null;
}

export interface TimelineOptions {
  /** Epoch ms of "today". */
  now: number;
}

const keyOf = (e: SessionEstimate) => `${e.exerciseId}:${e.sessionId}${e.provisional ? ":target" : ""}`;
const halving = (ageMs: number, halfLifeDays: number) => 0.5 ** (Math.max(0, ageMs) / (halfLifeDays * DAY_MS));

/** Ids of sessions that hold imported sets. */
function importedSessionIds(sets: readonly StrengthSet[]): Set<string> {
  const ids = new Set<string>();
  for (const s of sets) if (s.imported) ids.add(s.sessionId);
  return ids;
}

function pointOf(
  estimate: SessionEstimate,
  sourceId: string,
  value: number,
  weight: number,
  imported: boolean,
  now: number
): TimelinePoint {
  const t = estimate.date.getTime();
  return {
    id: keyOf(estimate),
    sourceId,
    exerciseId: estimate.exerciseId,
    sessionId: estimate.sessionId,
    t,
    value,
    strength: estimate.strength,
    estimatedMax: estimate.estimatedMax,
    bestSet: estimate.bestSet,
    dropsCounted: estimate.dropsCounted,
    weight,
    weightToday: t <= now ? weight * halving(now - t, TREND_SMOOTHING.standard) : 0,
    imported,
    provisional: estimate.provisional === true,
  };
}

const byTime = (a: TimelinePoint, b: TimelinePoint) => a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Every session estimate of the lift and its related exercises, by source (M1): the
 * lift's own (split into the app's and imported), each related exercise's translated by
 * its ratio (learned with its pair count, or the starting ratio), and each target until
 * the exercise is next logged. Uses `sessionEstimates`, `targetEstimates` and
 * `learnTransferRatios` as the planner does; `anchor` is `pooledLiftEstimate`.
 *
 * @evidence strength-pooling
 * @evidence target-evidence
 */
export function strengthTimeline(
  liftId: string,
  sets: readonly StrengthSet[],
  { now }: TimelineOptions
): StrengthTimeline {
  const imported = importedSessionIds(sets);
  const points: TimelinePoint[] = [];
  for (const e of sessionEstimates(sets, liftId)) {
    const isImported = imported.has(e.sessionId);
    points.push(pointOf(e, isImported ? "imported" : "own", e.strength, 1, isImported, now));
  }

  const ratios = learnTransferRatios(liftId, sets);
  const related: TimelineSource[] = [];
  for (const [exerciseId, ratio] of Object.entries(ratios)) {
    if (exerciseId === liftId || !(ratio.ratio > 0)) continue;
    const weight = STRENGTH_POOLING.transferWeight;
    const logged = sessionEstimates(sets, exerciseId);
    for (const e of logged) {
      points.push(pointOf(e, exerciseId, e.strength / ratio.ratio, weight, imported.has(e.sessionId), now));
    }
    for (const e of targetEstimates(sets, exerciseId)) {
      const t = e.date.getTime();
      const next = logged.find((l) => l.date.getTime() >= t);
      const point = pointOf(e, exerciseId, e.strength / ratio.ratio, weight * TARGET_EVIDENCE.weight, false, now);
      if (next) {
        point.until = next.date.getTime();
        if (point.until <= now) point.weightToday = 0;
      }
      points.push(point);
    }
    related.push({ id: exerciseId, kind: "related", exerciseId, weight, ratio });
  }
  points.sort(byTime);

  const present = new Set(points.map((p) => p.sourceId));
  const sources: TimelineSource[] = [
    { id: "own", kind: "own" as const, exerciseId: liftId, weight: 1 },
    { id: "imported", kind: "imported" as const, exerciseId: liftId, weight: 1 },
    ...related,
  ].filter((s) => present.has(s.id));

  const pooled = pooledLiftEstimate(liftId, sets);
  return {
    subject: { kind: "lift", liftId },
    unit: "lbs",
    sources,
    points,
    now,
    anchor: pooled ? { value: pooled.value, sd: pooled.sd, t: now } : null,
    pooled,
  };
}

/**
 * A muscle's timeline (M10): one source per exercise behind its index, a dot per session
 * at the relative `muscleStrengthIndex` gave it, weighted MUSCLE_WEIGHTS.primary or
 * .secondary. `anchor` is the index's latest reading, the number the Muscles tab shows.
 * `sets` only tells which sessions were imported.
 *
 * @evidence strength-pooling
 */
export function muscleTimeline(
  muscle: MuscleId,
  index: MuscleStrengthIndex,
  sets: readonly StrengthSet[],
  { now }: TimelineOptions
): StrengthTimeline {
  const readings = index[muscle] ?? [];
  const imported = importedSessionIds(sets);
  const weightOf = new Map<string, number>();
  for (const r of readings) for (const c of r.contributors) weightOf.set(c.exerciseId, c.weight);

  const points: TimelinePoint[] = [];
  const order: string[] = [];
  for (const r of readings) {
    for (const { estimate, relative } of r.sessions) {
      const id = estimate.exerciseId;
      const weight = weightOf.get(id) ?? MUSCLE_WEIGHTS.secondary;
      if (!order.includes(id)) order.push(id);
      points.push(pointOf(estimate, id, relative, weight, imported.has(estimate.sessionId), now));
    }
  }
  points.sort(byTime);

  const sources: TimelineSource[] = order
    .map((id): TimelineSource => {
      const weight = weightOf.get(id) ?? MUSCLE_WEIGHTS.secondary;
      return {
        id,
        kind: "exercise",
        exerciseId: id,
        weight,
        role: weight >= MUSCLE_WEIGHTS.primary ? "primary" : "secondary",
      };
    })
    .sort((a, b) => b.weight - a.weight || order.indexOf(a.id) - order.indexOf(b.id));

  const last = readings[readings.length - 1];
  return {
    subject: { kind: "muscle", muscle },
    unit: "index",
    sources,
    points,
    now,
    anchor: last ? { value: last.index, sd: null, t: last.date.getTime() } : null,
    pooled: null,
  };
}

// ---------------------------------------------------------------------------
// The smooth line

export interface SmoothOptions {
  halfLifeDays: number;
  /** Source ids drawn and averaged; all when omitted. */
  sources?: readonly string[];
  /** Grid spacing in days (default 1). */
  stepDays?: number;
}

export interface TrendPoint {
  t: number;
  v: number;
  /** One standard deviation either side. */
  low: number;
  high: number;
}

/**
 * Why the line's value today differs from the anchor (the number the app acts on), or
 * that it does not.
 * - `match`: they agree to the pound (or index tenth).
 * - `display`: the smoothing or the sources shown are not the planner's.
 * - `older-sessions`: the planner starts from the latest session of the lift itself and
 *   sets aside `ownBefore` older sessions of it and `relatedBefore` sessions of related
 *   exercises from before it; the line still averages them, halving with age.
 * - `muscle-latest`: the index takes each exercise's latest session and drops one not
 *   done for MUSCLE_INDEX.staleAfterDays; the line averages every session, halving.
 */
export type TrendReason =
  | { kind: "match" }
  | { kind: "display" }
  | { kind: "older-sessions"; ownBefore: number; relatedBefore: number; line: number; anchor: number }
  | { kind: "muscle-latest"; line: number; anchor: number };

export interface SmoothedLine {
  halfLifeDays: number;
  /** The estimate as of each instant a dot arrives, a target lapses, and today. */
  knots: TrendPoint[];
  /** On an even grid of days ending at `now`, oldest first, from the first dot shown. */
  points: TrendPoint[];
  /** The line at `now`. */
  today: TrendPoint | null;
  /** Null without an anchor or without a line. */
  reason: TrendReason | null;
}

interface Accumulator {
  /** Dots counted. */
  n: number;
  /** Σ w, Σ w·v */
  w: number;
  wv: number;
  /** Σ w² of sessions scattering by sessionSdFraction, and of related ones (÷ transfer). */
  q1: number;
  q2: number;
  /** Per related exercise: Σ w and the ratio's log sd. */
  ratioWeight: Map<string, { w: number; logSd: number }>;
  bySource: Map<string, number>;
}

function enabledPoints(timeline: StrengthTimeline, sources?: readonly string[]): TimelinePoint[] {
  if (!sources) return timeline.points;
  const on = new Set(sources);
  return timeline.points.filter((p) => on.has(p.sourceId));
}

/**
 * Walks `times` (ascending) keeping the weighted sums of every enabled dot at or before
 * each time, halving per half-life, with targets removed once the exercise is logged.
 * O(points + times × sources).
 */
function walk(
  timeline: StrengthTimeline,
  points: readonly TimelinePoint[],
  halfLifeDays: number,
  times: readonly number[],
  visit: (t: number, acc: Accumulator) => void
): void {
  const sourceById = new Map(timeline.sources.map((s) => [s.id, s]));
  const acc: Accumulator = { n: 0, w: 0, wv: 0, q1: 0, q2: 0, ratioWeight: new Map(), bySource: new Map() };
  const expiries = points.filter((p) => p.until !== undefined).sort((a, b) => a.until! - b.until!);
  let next = 0;
  let nextExpiry = 0;
  let prev: number | null = null;

  const apply = (p: TimelinePoint, t: number, sign: 1 | -1) => {
    const w = p.weight * halving(t - p.t, halfLifeDays) * sign;
    const source = sourceById.get(p.sourceId);
    acc.n += sign;
    acc.w += w;
    acc.wv += w * p.value;
    if (source?.kind === "related") {
      acc.q2 += sign * w * w;
      const entry = acc.ratioWeight.get(p.sourceId) ?? { w: 0, logSd: source.ratio?.logSd ?? 0 };
      entry.w += w;
      acc.ratioWeight.set(p.sourceId, entry);
    } else {
      acc.q1 += sign * w * w;
    }
    acc.bySource.set(p.sourceId, (acc.bySource.get(p.sourceId) ?? 0) + w);
  };

  for (const t of times) {
    if (prev !== null && t > prev) {
      const f = halving(t - prev, halfLifeDays);
      acc.w *= f;
      acc.wv *= f;
      acc.q1 *= f * f;
      acc.q2 *= f * f;
      for (const e of acc.ratioWeight.values()) e.w *= f;
      for (const [id, w] of acc.bySource) acc.bySource.set(id, w * f);
    }
    while (next < points.length && points[next].t <= t) apply(points[next++], t, 1);
    while (nextExpiry < expiries.length && expiries[nextExpiry].until! <= t) {
      const p = expiries[nextExpiry++];
      if (p.t <= t) apply(p, t, -1);
    }
    prev = t;
    visit(t, acc);
  }
}

/** The line's relative standard deviation: the pooled estimate's formula, incrementally. */
function relativeSdOf(acc: Accumulator): number {
  if (!(acc.w > 0)) return 0;
  const s2 = STRENGTH_POOLING.sessionSdFraction ** 2;
  let variance = Math.max(0, acc.q1) * s2 + (Math.max(0, acc.q2) * s2) / STRENGTH_POOLING.transferWeight;
  for (const { w, logSd } of acc.ratioWeight.values()) variance += (w * logSd) ** 2;
  return Math.sqrt(variance) / acc.w;
}

/**
 * Grid instants: every `stepDays` days back from `now` to `from`, plus `from` itself, so
 * lines of different subjects share instants and the first dot starts the line.
 */
export function gridTimes(from: number, now: number, stepDays = 1): number[] {
  if (!(from <= now)) return [];
  const step = Math.max(1, stepDays) * DAY_MS;
  const out: number[] = [];
  for (let t = now; t > from; t -= step) out.push(t);
  out.push(from);
  return out.reverse();
}

/** Relative tolerance under which a sum of weights counts as empty. */
const EMPTY = 1e-12;

/**
 * The smooth line and its band (M2). The line is the app's estimate as of each session:
 * at every instant a dot arrives (and today) it is the recency-weighted mean of every
 * dot up to then (`knots`); between sessions it runs straight from one to the next, and
 * `points` reads it on an even grid of days. With only the lift's own sessions and one
 * session, the line equals that session; with the planner's evidence alone (one session
 * of the lift and related sessions after it) it equals `pooledLiftEstimate`. At `now`,
 * with every source on and the standard half-life, `reason` says why it differs from
 * the anchor, if it does.
 *
 * @evidence strength-pooling
 */
export function smoothedEstimate(timeline: StrengthTimeline, options: SmoothOptions): SmoothedLine {
  const { halfLifeDays, stepDays = 1 } = options;
  const points = enabledPoints(timeline, options.sources).filter((p) => p.t <= timeline.now);
  if (points.length === 0) return { halfLifeDays, knots: [], points: [], today: null, reason: null };

  const instants = new Set<number>(points.map((p) => p.t));
  for (const p of points) if (p.until !== undefined && p.until <= timeline.now) instants.add(p.until);
  instants.add(timeline.now);
  const knots: TrendPoint[] = [];
  walk(timeline, points, halfLifeDays, [...instants].sort((a, b) => a - b), (t, acc) => {
    if (acc.n <= 0 || !(acc.w > 0)) return;
    const v = acc.wv / acc.w;
    const sd = v * relativeSdOf(acc);
    knots.push({ t, v, low: v - sd, high: v + sd });
  });

  const line: TrendPoint[] = [];
  let k = 0;
  for (const t of gridTimes(knots[0]?.t ?? timeline.now, timeline.now, stepDays)) {
    while (k + 1 < knots.length && knots[k + 1].t <= t) k++;
    const a = knots[k];
    const b = knots[k + 1];
    if (!a || t < a.t) continue;
    if (!b || a.t === t) {
      line.push(a.t === t ? a : { ...a, t });
      continue;
    }
    const f = (t - a.t) / (b.t - a.t);
    const mix = (x: number, y: number) => x + (y - x) * f;
    line.push({ t, v: mix(a.v, b.v), low: mix(a.low, b.low), high: mix(a.high, b.high) });
  }
  const lastKnot = knots[knots.length - 1];
  const today = lastKnot && lastKnot.t === timeline.now ? lastKnot : null;
  return { halfLifeDays, knots, points: line, today, reason: reasonFor(timeline, options, today) };
}

function reasonFor(timeline: StrengthTimeline, options: SmoothOptions, today: TrendPoint | null): TrendReason | null {
  const anchor = timeline.anchor;
  if (!anchor || !today) return null;
  const allOn =
    !options.sources || timeline.sources.every((s) => options.sources!.includes(s.id));
  if (options.halfLifeDays !== TREND_SMOOTHING.standard || !allOn) return { kind: "display" };

  if (timeline.subject.kind === "muscle") {
    const line = Math.round(today.v * 10) / 10;
    return line === anchor.value ? { kind: "match" } : { kind: "muscle-latest", line, anchor: anchor.value };
  }
  const line = Math.round(today.v);
  if (line === anchor.value) return { kind: "match" };
  const pooled = timeline.pooled;
  const used = new Set<string>();
  if (pooled?.own) used.add(keyOf(pooled.own));
  for (const r of pooled?.related ?? []) {
    used.add(`${r.exerciseId}:${r.sessionId}${r.provisional ? ":target" : ""}`);
  }
  let ownBefore = 0;
  let relatedBefore = 0;
  for (const p of timeline.points) {
    if (p.t > timeline.now || used.has(p.id) || (p.until !== undefined && p.until <= timeline.now)) continue;
    if (p.sourceId === "own" || p.sourceId === "imported") ownBefore += 1;
    else relatedBefore += 1;
  }
  return { kind: "older-sessions", ownBefore, relatedBefore, line, anchor: anchor.value };
}

/** How much one dot counts at `at`: its source weight, its age factor and the product. */
export function pointWeightAt(
  point: TimelinePoint,
  at: number,
  halfLifeDays: number
): { base: number; age: number; weight: number; expired: boolean } {
  const expired = point.until !== undefined && point.until <= at;
  const age = point.t <= at ? halving(at - point.t, halfLifeDays) : 0;
  return { base: point.weight, age, weight: expired ? 0 : point.weight * age, expired };
}

/** Each enabled dot's share of the line's weight at `at` (0 for one not counted). */
export function sharesAt(
  timeline: StrengthTimeline,
  at: number,
  options: Pick<SmoothOptions, "halfLifeDays" | "sources">
): Map<string, number> {
  const points = enabledPoints(timeline, options.sources);
  const weights = points.map((p) => pointWeightAt(p, at, options.halfLifeDays).weight);
  const total = weights.reduce((s, w) => s + w, 0);
  return new Map(points.map((p, i) => [p.id, total > 0 ? weights[i] / total : 0]));
}

// ---------------------------------------------------------------------------
// Which sources carry the line, week by week

export interface WeekShare {
  /** Local Monday 00:00 of the week. */
  weekStart: number;
  /** Share of the line's weight by source id at the week's end (or `now`); sums to 1. */
  shares: Record<string, number>;
}

/**
 * For each week from the first enabled dot to `now`, the share of the line's weight
 * from each source at the week's end (M3). Shares sum to 1; a week with no session
 * keeps the previous week's shares, since every weight halves at the same pace.
 *
 * @evidence strength-pooling
 */
export function weeklyShares(
  timeline: StrengthTimeline,
  options: Pick<SmoothOptions, "halfLifeDays" | "sources">
): WeekShare[] {
  const points = enabledPoints(timeline, options.sources).filter((p) => p.t <= timeline.now);
  if (points.length === 0) return [];
  const weeks: number[] = [];
  const ends: number[] = [];
  for (let week = weekStartMs(points[0].t); week <= timeline.now; week = nextWeekMs(week)) {
    weeks.push(week);
    ends.push(Math.min(nextWeekMs(week) - 1, timeline.now));
  }
  const out: WeekShare[] = [];
  let previous: Record<string, number> | null = null;
  let i = 0;
  walk(timeline, points, options.halfLifeDays, ends, (_t, acc) => {
    let shares: Record<string, number> | null = null;
    if (acc.n > 0 && acc.w > 0) {
      const kept = [...acc.bySource].filter(([, w]) => w > acc.w * EMPTY);
      const total = kept.reduce((sum, [, w]) => sum + w, 0);
      shares = Object.fromEntries(kept.map(([id, w]) => [id, w / total]));
    }
    const use = shares ?? previous;
    if (use) out.push({ weekStart: weeks[i], shares: use });
    if (shares) previous = shares;
    i += 1;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Several lifts at once

/**
 * The sum of several lines (the Strength tab's total of the lifts' smooth lines): at
 * each instant any line has, each line's latest value at or before it, from the instant
 * every line has started. Empty when any line is.
 */
export function sumLines(lines: readonly (readonly TrendPoint[])[]): Array<{ t: number; v: number }> {
  if (lines.length === 0 || lines.some((l) => l.length === 0)) return [];
  const start = Math.max(...lines.map((l) => l[0].t));
  const times = [...new Set(lines.flatMap((l) => l.map((p) => p.t)))].filter((t) => t >= start).sort((a, b) => a - b);
  const cursor = lines.map(() => 0);
  return times.map((t) => {
    let v = 0;
    lines.forEach((l, i) => {
      while (cursor[i] + 1 < l.length && l[cursor[i] + 1].t <= t) cursor[i]++;
      v += l[cursor[i]].v;
    });
    return { t, v };
  });
}
