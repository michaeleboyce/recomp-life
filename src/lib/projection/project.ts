// Projects a lift's estimated 1RM forward under "what if" scenarios. Pure.
//
// Every model number comes from PROJECTION_COEFFICIENTS (owned by the research
// package); the constants defined here are guards and windows, not model inputs.
import type { RuleId } from "@/lib/evidence";
import type { Point } from "@/lib/metrics/types";
import type { TrainingPhase } from "@/types";
import type { ProjectionBaseline } from "./baseline";
import { PROJECTION_COEFFICIENTS } from "./coefficients";
import { fitTrend, MS_PER_WEEK, type TrendFit } from "./trend";

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
  /** "insufficient-data" when the history has fewer than four points. */
  status: "ok" | "insufficient-data";
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

/** The fit over the points up to `nowMs` within TREND_WINDOW_WEEKS of the latest one. */
function fitRecent(history: Point[], nowMs: number): { fit: TrendFit; latest: number } | null {
  const past = history.filter(
    (p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.t <= nowMs
  );
  if (past.length === 0) return null;
  const latest = Math.max(...past.map((p) => p.t));
  const windowStart = latest - TREND_WINDOW_WEEKS * MS_PER_WEEK;
  const fit = fitTrend(past.filter((p) => p.t >= windowStart));
  return fit ? { fit, latest } : null;
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
 * - Base rate: the fitted slope, floored at 0. A falling trend projects flat.
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
 * - Range: value -/+ bandWidthSd x residualSd x (1 + bandGrowth x sqrt(week)),
 *   never narrower than the week before, low end not below 0.
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

  const baseRate = Math.max(0, fit.slopePerWeek);
  const m = scenarioMultipliers(baseline, scenario);
  const startingRatePerWeek = baseRate * m.dose * m.adherence * m.phase;

  const startValue = fit.valueAt(nowMs);
  const points: ProjectedPoint[] = [];
  let value = startValue;
  let halfWidth = 0;
  for (let week = 0; week <= horizon; week++) {
    if (week > 0) {
      value += startingRatePerWeek * Math.pow(C.weeklyRateRetention, week - 1);
    }
    halfWidth = Math.max(
      halfWidth,
      C.bandWidthSd * fit.residualSd * (1 + C.bandGrowth * Math.sqrt(week))
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
  if (fit.slopePerWeek <= 0) {
    assumptions.push(
      `Your recent trend is flat or falling (${fmt(fit.slopePerWeek)} lbs per week, ${fitted}), so the projection holds today's estimate level instead of projecting a decline; scenario changes cannot raise a rate of zero.`
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
  assumptions.push(
    `The range reflects how much your past results scattered around the trend (about ${fmt(C.bandWidthSd * fit.residualSd)} lbs either side today) and widens the further ahead it looks.`
  );
  const staleWeeks = (nowMs - latest) / MS_PER_WEEK;
  if (staleWeeks > STALE_HISTORY_WEEKS) {
    assumptions.push(
      `Your last result is ${Math.round(staleWeeks)} weeks old, so today's starting value is itself an extrapolation.`
    );
  }

  return {
    status: "ok",
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
