// Projects a lift's estimated 1RM forward under "what if" scenarios. Pure.
//
// Every model number comes from PROJECTION_COEFFICIENTS (owned by the research
// package); the constants defined here are guards and windows, not model inputs.
import type { RuleId } from "@/lib/evidence";
import type { Point } from "@/lib/metrics/types";
import type { TrainingPhase } from "@/types";
import type { ProjectionBaseline } from "./baseline";
import { PROJECTION_COEFFICIENTS } from "./coefficients";
import { fitTrend, MIN_TREND_POINTS, MS_PER_WEEK, type TrendFit } from "./trend";

/** Any field left out keeps the baseline value. */
export type ProjectionScenario = Partial<
  Pick<
    ProjectionBaseline,
    "sessionsPerWeek" | "directWeeklySets" | "relatedWeeklySets" | "passRate" | "phase"
  >
>;

/** How another exercise for the same muscles has been trending. */
export interface RelatedTrend {
  exerciseId: string;
  /** lbs per week, from `fitTrend` over that exercise's recent working weights. */
  slopePerWeek: number;
}

export interface ProjectedPoint {
  t: number;
  v: number;
  low: number;
  high: number;
}

export interface Projection {
  /**
   * "insufficient-data" when the history has fewer than four recent points;
   * "flat-trend" when the fitted slope is zero or negative, so there is no personal
   * rate to scale: the points are level and the scenario has no effect.
   */
  status: "ok" | "insufficient-data" | "flat-trend";
  /** One point per week from now to the horizon, starting at week 0. */
  points: ProjectedPoint[];
  /** lbs per week at the start of the projection, after scenario scaling. */
  startingRatePerWeek: number;
  /** Projected change at the horizon relative to today, with its range. */
  gain: { v: number; low: number; high: number };
  /** The evidence rules whose coefficients shaped this projection. */
  evidenceIds: RuleId[];
  /** Plain-language assumptions to print under the chart. */
  assumptions: string[];
  /**
   * Present only when `relatedHistory` was passed: the fitted slope of each related
   * exercise that has enough recent points. Informational; it does not feed the
   * projected numbers.
   */
  relatedTrend?: RelatedTrend[];
}

/**
 * The trend is fitted to the history points from this many weeks before the most
 * recent point (not before `now`, so a lifter back from a break still gets a fit).
 */
export const TREND_WINDOW_WEEKS = 12;

/** Passing more sessions can raise the rate by at most this factor. */
export const MAX_ADHERENCE_MULTIPLIER = 1.5;

/**
 * The most the scenario-distance factor may widen the range (a guard for a total
 * multiplier at or near zero, where |ln| has no bound).
 */
export const MAX_SCENARIO_WIDENING = 2;

/** A last data point older than this many weeks earns a caveat in the assumptions. */
export const STALE_HISTORY_WEEKS = 4;

/** The registry rules the projection's coefficients come from. */
export const PROJECTION_EVIDENCE_IDS: RuleId[] = [
  "projection-dose-response",
  "projection-specificity",
  "projection-rate-of-gain",
  "projection-energy-deficit",
];

const C = PROJECTION_COEFFICIENTS;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

const fmt = (value: number, digits = 1) => value.toFixed(digits);
const pct = (share: number) => `${Math.round(share * 100)}%`;
const times = (multiplier: number) => `x${multiplier.toFixed(2)}`;

/**
 * Weekly sets as the volume term sees them: sets of the lift itself plus sets from
 * other exercises for the same muscles, the latter discounted by
 * `relatedSetTransfer` (specificity: a related set counts for less).
 */
export function effectiveWeeklySets(directWeeklySets: number, relatedWeeklySets: number): number {
  return (
    nonNegative(directWeeklySets) + C.relatedSetTransfer * nonNegative(relatedWeeklySets)
  );
}

interface Multipliers {
  /** Volume x frequency, clamped. */
  dose: number;
  adherence: number;
  phase: number;
  /** Sentences describing what the scenario changed. */
  notes: string[];
  scenarioPhase: TrainingPhase["mode"];
}

const NO_CHANGE = { dose: 1, adherence: 1, phase: 1, notes: [] as string[] };

function scenarioMultipliers(
  baseline: ProjectionBaseline,
  scenario: ProjectionScenario
): Multipliers {
  const notes: string[] = [];

  // Volume: diminishing returns, nothing beyond the ceiling.
  let volume = 1;
  const baseDirect = nonNegative(baseline.directWeeklySets);
  const baseRelated = nonNegative(baseline.relatedWeeklySets);
  const direct =
    scenario.directWeeklySets === undefined ? baseDirect : nonNegative(scenario.directWeeklySets);
  const related =
    scenario.relatedWeeklySets === undefined
      ? baseRelated
      : nonNegative(scenario.relatedWeeklySets);
  if (direct !== baseDirect || related !== baseRelated) {
    const baseEffective = effectiveWeeklySets(baseDirect, baseRelated);
    const effective = effectiveWeeklySets(direct, related);
    const change = (from: number, to: number) =>
      from === to ? `stay at ${fmt(from)}` : `go from ${fmt(from)} to ${fmt(to)}`;
    const split =
      `Sets of the lift itself ${change(baseDirect, direct)} a week, and sets from other exercises for the same muscles ${change(baseRelated, related)}. ` +
      `A set from another exercise counts as ${fmt(C.relatedSetTransfer, 2)} of a set of the lift, so effective weekly sets go from ${fmt(baseEffective)} to ${fmt(effective)}`;
    if (baseEffective <= 0) {
      notes.push(
        `${split}. With no effective sets recorded recently there is nothing to scale from, so this change is ignored.`
      );
    } else {
      const cappedBase = Math.min(baseEffective, C.weeklySetsCeiling);
      const capped = Math.min(effective, C.weeklySetsCeiling);
      volume = Math.pow(capped / cappedBase, C.volumeExponent);
      notes.push(`${split}, which on its own scales the rate by ${times(volume)}.`);
      if (effective > C.weeklySetsCeiling) {
        notes.push(
          `Effective sets beyond ${C.weeklySetsCeiling} a week are counted as ${C.weeklySetsCeiling}: more than that adds nothing in this model.`
        );
      }
    }
  }

  // Frequency.
  let frequency = 1;
  const baseSessions = nonNegative(baseline.sessionsPerWeek);
  if (scenario.sessionsPerWeek !== undefined) {
    const sessions = nonNegative(scenario.sessionsPerWeek);
    if (baseSessions <= 0) {
      if (sessions > 0) {
        notes.push(
          "No recent sessions were recorded for this lift, so the change in sessions per week cannot be scaled and is ignored."
        );
      }
    } else {
      frequency = Math.pow(sessions / baseSessions, C.frequencyExponent);
      if (sessions !== baseSessions) {
        notes.push(
          `Sessions per week for the lift go from ${fmt(baseSessions)} to ${fmt(sessions)}, which on its own scales the rate by ${times(frequency)}.`
        );
      }
    }
  }

  const rawDose = volume * frequency;
  // Only an actual change is clamped, so an unchanged dose is exactly 1.
  const dose = rawDose === 1 ? 1 : clamp(rawDose, C.minDoseMultiplier, C.maxDoseMultiplier);
  if (dose !== rawDose) {
    notes.push(
      `Together the set and session changes are limited to ${times(dose)}, the most this model allows.`
    );
  }

  // Adherence: share of sessions passed, relative to now.
  let adherence = 1;
  const basePass = clamp(nonNegative(baseline.passRate), 0, 1);
  if (scenario.passRate !== undefined) {
    const pass = clamp(nonNegative(scenario.passRate), 0, 1);
    if (pass !== basePass) {
      const ratio = basePass > 0 ? pass / basePass : MAX_ADHERENCE_MULTIPLIER;
      adherence = Math.min(MAX_ADHERENCE_MULTIPLIER, ratio);
      notes.push(
        `Sessions passed go from ${pct(basePass)} to ${pct(pass)}, which scales the rate by ${times(adherence)}.`
      );
    }
  }

  // Training phase.
  const scenarioPhase = scenario.phase ?? baseline.phase;
  const phase = C.phaseMultiplier[scenarioPhase] / C.phaseMultiplier[baseline.phase];
  if (scenarioPhase !== baseline.phase) {
    notes.push(
      `Training phase changes from ${baseline.phase} to ${scenarioPhase}, which scales the rate by ${times(phase)}.`
    );
  }

  return { dose, adherence, phase, notes, scenarioPhase };
}

/**
 * Factor by which the range widens for a scenario whose total rate multiplier is
 * `total`: 1 + scenarioUncertainty x |ln total|, exactly 1 when `total` is 1, at most
 * MAX_SCENARIO_WIDENING (also for a total of zero or an invalid one). The
 * coefficient and its evidence tag live in coefficients.ts.
 */
export function scenarioWidening(total: number): number {
  if (total === 1) return 1;
  if (!Number.isFinite(total) || total <= 0) return MAX_SCENARIO_WIDENING;
  return Math.min(
    MAX_SCENARIO_WIDENING,
    1 + C.scenarioUncertainty * Math.abs(Math.log(total))
  );
}

/** The history points up to `nowMs` within TREND_WINDOW_WEEKS of the latest one. */
function recentWindow(history: Point[], nowMs: number): { points: Point[]; latest: number } | null {
  const past = history.filter(
    (p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.t <= nowMs
  );
  if (past.length === 0) return null;
  const latest = Math.max(...past.map((p) => p.t));
  const windowStart = latest - TREND_WINDOW_WEEKS * MS_PER_WEEK;
  return { points: past.filter((p) => p.t >= windowStart), latest };
}

/** The fit over the points up to `nowMs` within TREND_WINDOW_WEEKS of the latest one. */
function fitRecent(history: Point[], nowMs: number): { fit: TrendFit; latest: number } | null {
  const recent = recentWindow(history, nowMs);
  const fit = recent ? fitTrend(recent.points) : null;
  return recent && fit ? { fit, latest: recent.latest } : null;
}

/**
 * How many more results (estimated-1RM points) the history needs before a trend can
 * be fitted: 0 when it already can, at least 1 when it cannot (for example when every
 * recent point shares one timestamp).
 */
export function resultsNeeded(history: Point[], now: Date): number {
  const nowMs = now.getTime();
  if (fitRecent(history, nowMs)) return 0;
  const have = recentWindow(history, nowMs)?.points.length ?? 0;
  return Math.max(1, MIN_TREND_POINTS - have);
}

function relatedTrends(relatedHistory: Record<string, Point[]>, nowMs: number): RelatedTrend[] {
  return Object.keys(relatedHistory)
    .sort()
    .flatMap((exerciseId) => {
      const recent = fitRecent(relatedHistory[exerciseId], nowMs);
      return recent ? [{ exerciseId, slopePerWeek: recent.fit.slopePerWeek }] : [];
    });
}

function insufficientData(): Projection {
  return {
    status: "insufficient-data",
    points: [],
    startingRatePerWeek: 0,
    gain: { v: 0, low: 0, high: 0 },
    evidenceIds: [],
    assumptions: [
      "Not enough data: a projection needs at least four recent estimated-1RM results.",
    ],
  };
}

/**
 * Projects estimated 1RM `weeks` ahead. With an empty scenario this is the current
 * trend continued (with decay); scenario fields scale the rate by dose, adherence and
 * training phase with diminishing returns. The range widens with the horizon.
 *
 * Model:
 * - Trend: `fitTrend` over the history points (up to `now`) within
 *   TREND_WINDOW_WEEKS of the most recent one. No fit -> "insufficient-data".
 * - Base rate: the fitted slope. A slope of zero or below gives status
 *   "flat-trend": the points are level, the scenario is ignored entirely (there is
 *   no personal rate to scale) and the assumptions say so and what would change it.
 * - Scenario: rate x dose x adherence x phase, where
 *   dose = clamp((effective sets / baseline effective sets) ^ volumeExponent
 *                x (sessions / baseline sessions) ^ frequencyExponent),
 *   effective sets = directWeeklySets + relatedSetTransfer x relatedWeeklySets
 *   (work from other exercises for the same muscles helps, but less than sets of
 *   the lift), capped on both sides at weeklySetsCeiling;
 *   adherence = pass rate / baseline pass rate, at most MAX_ADHERENCE_MULTIPLIER;
 *   phase = phaseMultiplier[scenario] / phaseMultiplier[baseline].
 *   A field left out, or equal to the baseline, multiplies by exactly 1. A baseline
 *   dose of zero cannot be scaled, so a change to it is ignored (and said so).
 * - Path: the value starts at the fitted value at `now` (not the last raw point)
 *   and gains startingRate x weeklyRateRetention^k during week k+1.
 * - Range: value -/+ bandWidthSd x sd x (1 + bandGrowth x sqrt(week)) x widening,
 *   where sd = max(residualSd, minResidualSdFraction x the value now) (an exactly
 *   linear history still gets a range) and widening = scenarioWidening(dose x
 *   adherence x phase) (exactly 1 for an unchanged scenario, wider the further the
 *   scenario is from the baseline); never narrower than the week before, low end
 *   not below 0.
 * - `gain`: horizon minus week 0; its low/high are the horizon's low/high minus the
 *   week-0 value.
 * - `weeks` is floored to a whole number; anything invalid counts as 0.
 * - `relatedHistory` (optional) is only reported back: `relatedTrend` lists, by
 *   exercise id, the fitted slope of each series with enough recent points (same
 *   window rule as the main trend), so the screen can say "your split squat is also
 *   rising". It does NOT alter the projected numbers; the muscle's other work
 *   enters the model through `relatedWeeklySets` only.
 */
export function projectE1RM(input: {
  history: Point[];
  baseline: ProjectionBaseline;
  scenario?: ProjectionScenario;
  weeks: number;
  now: Date;
  /** Working-weight series of other exercises for the same muscles, by exercise id. */
  relatedHistory?: Record<string, Point[]>;
}): Projection {
  const { history, baseline, scenario = {} } = input;
  const nowMs = input.now.getTime();
  const horizon = Number.isFinite(input.weeks) ? Math.max(0, Math.floor(input.weeks)) : 0;

  const related = input.relatedHistory
    ? { relatedTrend: relatedTrends(input.relatedHistory, nowMs) }
    : {};

  const recent = fitRecent(history, nowMs);
  if (!recent) return { ...insufficientData(), ...related };
  const { fit, latest } = recent;

  // A flat or falling trend has no personal rate to scale: hold it level and ignore
  // the scenario, so the current trend and any alternative are the same line.
  const flat = fit.slopePerWeek <= 0;
  const m = flat
    ? { ...NO_CHANGE, scenarioPhase: baseline.phase }
    : scenarioMultipliers(baseline, scenario);
  const total = m.dose * m.adherence * m.phase;
  const startingRatePerWeek = flat ? 0 : fit.slopePerWeek * total;
  const widening = scenarioWidening(total);

  const startValue = fit.valueAt(nowMs);
  const floorSd = C.minResidualSdFraction * Math.max(0, startValue);
  const rangeSd = Math.max(fit.residualSd, floorSd);
  const points: ProjectedPoint[] = [];
  let value = startValue;
  let halfWidth = 0;
  for (let week = 0; week <= horizon; week++) {
    if (week > 0) {
      value += startingRatePerWeek * Math.pow(C.weeklyRateRetention, week - 1);
    }
    halfWidth = Math.max(
      halfWidth,
      C.bandWidthSd * rangeSd * (1 + C.bandGrowth * Math.sqrt(week)) * widening
    );
    points.push({
      t: nowMs + week * MS_PER_WEEK,
      v: value,
      low: Math.max(0, value - halfWidth),
      high: value + halfWidth,
    });
  }

  const first = points[0];
  const last = points[points.length - 1];

  // ── Assumptions, written from the actual inputs ──
  const assumptions: string[] = [];
  const fitted = `fitted to ${fit.pointsUsed} results from the last ${TREND_WINDOW_WEEKS} weeks of history`;
  if (flat) {
    assumptions.push(
      `Your recent estimates are not rising (${fmt(fit.slopePerWeek)} lbs per week, ${fitted}), so the model has no personal rate of gain to scale. It holds today's estimate level instead of projecting a decline, and changing sessions, sets or phase cannot move a rate of zero.`,
      "A few more sessions of data, with the estimate moving up, would give it a rate to work from and let it compare alternatives."
    );
  } else if (m.notes.length === 0) {
    assumptions.push(
      `Your recent trend is ${fmt(fit.slopePerWeek)} lbs per week (${fitted}); the projection starts at that rate, ${fmt(startingRatePerWeek)} lbs per week, with nothing else changed.`
    );
  } else {
    assumptions.push(
      `Your recent trend is ${fmt(fit.slopePerWeek)} lbs per week (${fitted}); with the changes below the projection starts at ${fmt(startingRatePerWeek)} lbs per week.`
    );
  }
  assumptions.push(...m.notes);
  if (m.scenarioPhase === baseline.phase) {
    assumptions.push(`Training phase stays ${baseline.phase}.`);
  }
  assumptions.push(
    `Gains are assumed to slow: each week adds ${pct(C.weeklyRateRetention)} of what the week before added.`
  );
  if (rangeSd > fit.residualSd) {
    assumptions.push(
      `Your past results sit closer to the trend than a single 1RM test is repeatable, so the range assumes a scatter of at least ${fmt(C.minResidualSdFraction * 100)}% of today's estimate (about ${fmt(C.bandWidthSd * rangeSd)} lbs either side today) and widens the further ahead it looks.`
    );
  } else {
    assumptions.push(
      `The range reflects how much your past results scattered around the trend (about ${fmt(C.bandWidthSd * rangeSd)} lbs either side today) and widens the further ahead it looks.`
    );
  }
  if (widening > 1) {
    assumptions.push(
      `This alternative is further from what you do now, so its range is ${pct(widening - 1)} wider: how much a change in training helps is itself uncertain.`
    );
  }
  const staleWeeks = (nowMs - latest) / MS_PER_WEEK;
  if (staleWeeks > STALE_HISTORY_WEEKS) {
    assumptions.push(
      `Your last result is ${Math.round(staleWeeks)} weeks old, so today's starting value is itself an extrapolation.`
    );
  }

  return {
    status: flat ? "flat-trend" : "ok",
    points,
    startingRatePerWeek,
    gain: {
      v: last.v - first.v,
      low: last.low - first.v,
      high: last.high - first.v,
    },
    evidenceIds: [...PROJECTION_EVIDENCE_IDS],
    assumptions,
    ...related,
  };
}
