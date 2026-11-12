// Property tests: they must hold for any sensible PROJECTION_COEFFICIENTS, so every
// expectation is a relationship or is computed from the imported constants.
import { describe, it, expect } from "vitest";
import type { Point } from "@/lib/metrics/types";
import type { TrainingPhase } from "@/types";
import { PROJECTION_COEFFICIENTS as C } from "./coefficients";
import {
  fitTrend,
  projectE1RM,
  type ProjectionBaseline,
  type ProjectionScenario,
} from "./index";
import {
  effectiveWeeklySets,
  MAX_ADHERENCE_MULTIPLIER,
  PROJECTION_EVIDENCE_IDS,
  TREND_WINDOW_WEEKS,
} from "./project";
import { MS_PER_WEEK } from "./trend";

const NOW = new Date(2026, 2, 30, 18);
const WEEKS = 12;
const NOISE = [2, -3, 1, 4, -2, -1, 3, -4, 2, 0];

/** Ten weekly points ending at `now`, rising `perWeek` with fixed scatter. */
function history(perWeek = 2, noise: number[] = NOISE): Point[] {
  return noise.map((n, i) => ({
    t: NOW.getTime() - (noise.length - 1 - i) * MS_PER_WEEK,
    v: 250 + perWeek * i + n,
  }));
}

// Baseline dose sits low enough that doubling it stays under the sets ceiling
// for any relatedSetTransfer in [0, 1].
const STEP = C.weeklySetsCeiling / 8;
const baseline: ProjectionBaseline = {
  exerciseId: "squat",
  sessionsPerWeek: 1.5,
  directWeeklySets: STEP,
  relatedWeeklySets: STEP,
  byMuscle: [],
  passRate: 0.8,
  phase: "maintaining",
  windowWeeks: 8,
};

function project(scenario?: ProjectionScenario, overrides: Partial<Parameters<typeof projectE1RM>[0]> = {}) {
  return projectE1RM({ history: history(), baseline, scenario, weeks: WEEKS, now: NOW, ...overrides });
}

const PHASES: TrainingPhase["mode"][] = ["cutting", "maintaining", "bulking"];

const clampDose = (m: number) =>
  Math.min(C.maxDoseMultiplier, Math.max(C.minDoseMultiplier, m));

/** The volume multiplier the model should apply, from the coefficients. */
function expectedVolumeMultiplier(direct: number, related: number): number {
  const base = effectiveWeeklySets(baseline.directWeeklySets, baseline.relatedWeeklySets);
  const next = Math.min(C.weeklySetsCeiling, effectiveWeeklySets(direct, related));
  const m = (next / base) ** C.volumeExponent;
  return m === 1 ? 1 : clampDose(m);
}

describe("projectE1RM", () => {
  it("has one point per week from week 0, a week apart, starting now", () => {
    const p = project();
    expect(p.status).toBe("ok");
    expect(p.points).toHaveLength(WEEKS + 1);
    p.points.forEach((point, w) => expect(point.t).toBe(NOW.getTime() + w * MS_PER_WEEK));
  });

  it("starts at the fitted value now, not at the last raw point", () => {
    const h = history();
    const fit = fitTrend(h)!;
    const p = project();
    expect(p.points[0].v).toBeCloseTo(fit.valueAt(NOW.getTime()), 9);
    expect(p.points[0].v).not.toBeCloseTo(h[h.length - 1].v, 3);
  });

  it("with an empty scenario continues the fitted rate with the retention decay", () => {
    const fit = fitTrend(history())!;
    const p = project();
    expect(p.startingRatePerWeek).toBeCloseTo(fit.slopePerWeek, 9);
    let v = fit.valueAt(NOW.getTime());
    for (let w = 1; w <= WEEKS; w++) {
      v += fit.slopePerWeek * C.weeklyRateRetention ** (w - 1);
      expect(p.points[w].v).toBeCloseTo(v, 6);
    }
    expect(p.gain.v).toBeCloseTo(p.points[WEEKS].v - p.points[0].v, 9);
  });

  it("an empty scenario, an omitted one and one restating the baseline are identical", () => {
    const omitted = project(undefined);
    expect(project({})).toEqual(omitted);
    const restated = project({
      sessionsPerWeek: baseline.sessionsPerWeek,
      directWeeklySets: baseline.directWeeklySets,
      relatedWeeklySets: baseline.relatedWeeklySets,
      passRate: baseline.passRate,
      phase: baseline.phase,
    });
    expect(restated.points).toEqual(omitted.points);
    expect(restated.gain).toEqual(omitted.gain);
    expect(restated.startingRatePerWeek).toBe(omitted.startingRatePerWeek);
  });

  it("is deterministic", () => {
    const scenario = { directWeeklySets: STEP * 1.5, phase: "cutting" as const };
    expect(project(scenario)).toEqual(project(scenario));
  });

  it("more sets of the lift never projects lower, fewer never higher", () => {
    let previous = -Infinity;
    for (const factor of [0, 0.25, 0.5, 1, 1.5, 2, 3, 6, 20]) {
      const gain = project({ directWeeklySets: STEP * factor }).gain.v;
      expect(gain).toBeGreaterThanOrEqual(previous);
      previous = gain;
    }
    expect(project({ directWeeklySets: STEP * 2 }).gain.v).toBeGreaterThan(project().gain.v);
    expect(project({ directWeeklySets: STEP / 2 }).gain.v).toBeLessThan(project().gain.v);
  });

  it("more sets from other exercises for the same muscles never projects lower", () => {
    let previous = -Infinity;
    for (const factor of [0, 0.5, 1, 2, 4, 8, 40]) {
      const gain = project({ relatedWeeklySets: STEP * factor }).gain.v;
      expect(gain).toBeGreaterThanOrEqual(previous);
      previous = gain;
    }
    const more = project({ relatedWeeklySets: STEP * 2 }).gain.v;
    if (C.relatedSetTransfer > 0) expect(more).toBeGreaterThan(project().gain.v);
    else expect(more).toBe(project().gain.v);
  });

  it("a related set adds less than a set of the lift itself", () => {
    const base = project();
    const direct = project({ directWeeklySets: baseline.directWeeklySets + STEP });
    const related = project({ relatedWeeklySets: baseline.relatedWeeklySets + STEP });
    expect(related.gain.v).toBeLessThanOrEqual(direct.gain.v);

    const directM = expectedVolumeMultiplier(baseline.directWeeklySets + STEP, baseline.relatedWeeklySets);
    const relatedM = expectedVolumeMultiplier(baseline.directWeeklySets, baseline.relatedWeeklySets + STEP);
    expect(direct.startingRatePerWeek / base.startingRatePerWeek).toBeCloseTo(directM, 9);
    expect(related.startingRatePerWeek / base.startingRatePerWeek).toBeCloseTo(relatedM, 9);
    if (C.relatedSetTransfer < 1 && C.volumeExponent > 0 && relatedM < C.maxDoseMultiplier) {
      expect(related.gain.v).toBeLessThan(direct.gain.v);
    }
  });

  it("weights related sets by relatedSetTransfer when forming effective sets", () => {
    expect(effectiveWeeklySets(6, 0)).toBe(6);
    expect(effectiveWeeklySets(6, 4) - effectiveWeeklySets(6, 0)).toBeCloseTo(
      C.relatedSetTransfer * 4,
      9
    );
    expect(C.relatedSetTransfer).toBeGreaterThanOrEqual(0);
    expect(C.relatedSetTransfer).toBeLessThanOrEqual(1);
  });

  it("doubling sets gives less than double the gain (diminishing returns)", () => {
    const base = project().gain.v;
    const doubled = project({
      directWeeklySets: baseline.directWeeklySets * 2,
      relatedWeeklySets: baseline.relatedWeeklySets * 2,
    }).gain.v;
    expect(base).toBeGreaterThan(0);
    if (C.volumeExponent < 1) {
      expect(doubled).toBeLessThan(2 * base);
    }
    expect(doubled / base).toBeCloseTo(clampDose(2 ** C.volumeExponent), 6);
  });

  it("sets above the ceiling add nothing", () => {
    const atCeiling = project({ directWeeklySets: C.weeklySetsCeiling });
    const above = project({ directWeeklySets: C.weeklySetsCeiling + 10 });
    const aboveWithRelated = project({
      directWeeklySets: C.weeklySetsCeiling,
      relatedWeeklySets: baseline.relatedWeeklySets + 30,
    });
    expect(above.points).toEqual(atCeiling.points);
    expect(above.gain).toEqual(atCeiling.gain);
    expect(aboveWithRelated.points).toEqual(atCeiling.points);
  });

  it("more sessions per week never projects lower", () => {
    let previous = -Infinity;
    for (const sessions of [0.5, 1, 1.5, 2, 3, 4]) {
      const gain = project({ sessionsPerWeek: sessions }).gain.v;
      expect(gain).toBeGreaterThanOrEqual(previous);
      previous = gain;
    }
  });

  it("keeps the combined dose multiplier inside its bounds", () => {
    const base = project().startingRatePerWeek;
    const huge = project({ directWeeklySets: C.weeklySetsCeiling, sessionsPerWeek: 50 });
    const tiny = project({ directWeeklySets: 0.01, relatedWeeklySets: 0, sessionsPerWeek: 0.01 });
    expect(huge.startingRatePerWeek / base).toBeLessThanOrEqual(C.maxDoseMultiplier + 1e-9);
    expect(tiny.startingRatePerWeek / base).toBeGreaterThanOrEqual(C.minDoseMultiplier - 1e-9);
  });

  it("a lower pass rate projects lower, a higher one higher, in proportion", () => {
    const base = project();
    const worse = project({ passRate: baseline.passRate / 2 });
    const better = project({ passRate: 1 });
    expect(worse.gain.v).toBeLessThan(base.gain.v);
    expect(better.gain.v).toBeGreaterThan(base.gain.v);
    expect(worse.startingRatePerWeek / base.startingRatePerWeek).toBeCloseTo(0.5, 9);
  });

  it("caps the adherence multiplier and survives a baseline pass rate of zero", () => {
    const neverPassed = { ...baseline, passRate: 0 };
    const unchanged = project(undefined, { baseline: neverPassed });
    const perfect = project({ passRate: 1 }, { baseline: neverPassed });
    expect(Number.isFinite(perfect.gain.v)).toBe(true);
    expect(perfect.startingRatePerWeek / unchanged.startingRatePerWeek).toBeLessThanOrEqual(
      MAX_ADHERENCE_MULTIPLIER + 1e-9
    );
    expect(perfect.gain.v).toBeGreaterThanOrEqual(unchanged.gain.v);
  });

  it("orders training phases the way phaseMultiplier does", () => {
    for (const from of PHASES) {
      const fromBaseline = { ...baseline, phase: from };
      const reference = project(undefined, { baseline: fromBaseline }).startingRatePerWeek;
      const ordered = [...PHASES].sort((a, b) => C.phaseMultiplier[a] - C.phaseMultiplier[b]);
      let previous = -Infinity;
      for (const phase of ordered) {
        const p = project({ phase }, { baseline: fromBaseline });
        expect(p.gain.v).toBeGreaterThanOrEqual(previous);
        previous = p.gain.v;
        expect(p.startingRatePerWeek / reference).toBeCloseTo(
          C.phaseMultiplier[phase] / C.phaseMultiplier[from],
          9
        );
      }
    }
  });

  it("the range contains the value, widens with the horizon and never goes below zero", () => {
    for (const scenario of [{}, { directWeeklySets: STEP * 2 }, { phase: "cutting" as const }]) {
      const p = project(scenario);
      let previousWidth = -Infinity;
      for (const point of p.points) {
        expect(point.low).toBeLessThanOrEqual(point.v);
        expect(point.high).toBeGreaterThanOrEqual(point.v);
        expect(point.low).toBeGreaterThanOrEqual(0);
        const width = point.high - point.low;
        expect(width).toBeGreaterThanOrEqual(previousWidth);
        previousWidth = width;
      }
      const first = p.points[0];
      const last = p.points[WEEKS];
      if (C.bandGrowth > 0 && C.bandWidthSd > 0) {
        expect(last.high - last.low).toBeGreaterThan(first.high - first.low);
      }
    }
  });

  it("sizes the range from the residual scatter and the coefficients", () => {
    const fit = fitTrend(history())!;
    const p = project();
    const w = 4;
    // The scatter, or the minimum range when the scatter is smaller.
    const sd = Math.max(fit.residualSd, C.minResidualSdFraction * p.points[0].v);
    const half = C.bandWidthSd * sd * (1 + C.bandGrowth * Math.sqrt(w));
    expect(p.points[w].high - p.points[w].v).toBeCloseTo(half, 6);
    expect(p.points[w].v - p.points[w].low).toBeCloseTo(half, 6);
    expect(p.gain.high - p.gain.low).toBeCloseTo(p.points[WEEKS].high - p.points[WEEKS].low, 6);
    expect(p.gain.low).toBeLessThanOrEqual(p.gain.v);
    expect(p.gain.high).toBeGreaterThanOrEqual(p.gain.v);
  });

  it("clamps the low end at zero for tiny, noisy series", () => {
    const tiny = [5, 60, 2, 70, 3, 65].map((v, i) => ({
      t: NOW.getTime() - (5 - i) * MS_PER_WEEK,
      v,
    }));
    const p = projectE1RM({ history: tiny, baseline, weeks: WEEKS, now: NOW });
    for (const point of p.points) expect(point.low).toBeGreaterThanOrEqual(0);
  });

  it("projects a declining trend flat and says so", () => {
    const p = project({ directWeeklySets: STEP * 2 }, { history: history(-2) });
    expect(p.status).toBe("flat-trend");
    expect(p.startingRatePerWeek).toBe(0);
    expect(p.gain.v).toBe(0);
    for (const point of p.points) expect(point.v).toBe(p.points[0].v);
    expect(p.assumptions.join(" ")).toMatch(/flat|level/i);
  });

  it("reports insufficient data under four points", () => {
    const p = project(undefined, { history: history().slice(-3) });
    expect(p.status).toBe("insufficient-data");
    expect(p.points).toEqual([]);
    expect(p.startingRatePerWeek).toBe(0);
    expect(p.gain).toEqual({ v: 0, low: 0, high: 0 });
    expect(project(undefined, { history: [] }).status).toBe("insufficient-data");
  });

  it("fits only the recent window of the history", () => {
    // An old steep climb followed by a recent plateau: the plateau is what projects.
    const old: Point[] = Array.from({ length: 10 }, (_, i) => ({
      t: NOW.getTime() - (TREND_WINDOW_WEEKS + 30 - i) * MS_PER_WEEK,
      v: 100 + 10 * i,
    }));
    const recent = history(0.5);
    const withOld = project(undefined, { history: [...old, ...recent] });
    const recentOnly = project(undefined, { history: recent });
    expect(withOld.points).toEqual(recentOnly.points);

    // Only three points fall inside the window: not enough.
    const sparse: Point[] = [
      ...old,
      ...recent.slice(-3),
    ];
    expect(project(undefined, { history: sparse }).status).toBe("insufficient-data");
  });

  it("does not depend on the order of the history and ignores points after now", () => {
    const h = history();
    const shuffled = [...h].reverse();
    const future = { t: NOW.getTime() + 3 * MS_PER_WEEK, v: 999 };
    expect(project(undefined, { history: [...shuffled, future] }).points).toEqual(
      project().points
    );
  });

  it("handles a zero-week or invalid horizon with a single point", () => {
    for (const weeks of [0, -3, NaN]) {
      const p = project(undefined, { weeks });
      expect(p.status).toBe("ok");
      expect(p.points).toHaveLength(1);
      expect(p.gain.v).toBe(0);
    }
  });

  it("does not scale by a dose the baseline never had", () => {
    const untrained = { ...baseline, directWeeklySets: 0, relatedWeeklySets: 0, sessionsPerWeek: 0 };
    const p = project(
      { directWeeklySets: 10, relatedWeeklySets: 4, sessionsPerWeek: 2 },
      { baseline: untrained }
    );
    expect(p.startingRatePerWeek).toBeCloseTo(
      project(undefined, { baseline: untrained }).startingRatePerWeek,
      9
    );
    expect(Number.isFinite(p.gain.v)).toBe(true);
  });

  it("cites the four projection rules", () => {
    expect(project().evidenceIds).toEqual(PROJECTION_EVIDENCE_IDS);
    expect([...PROJECTION_EVIDENCE_IDS].sort()).toEqual([
      "projection-dose-response",
      "projection-energy-deficit",
      "projection-rate-of-gain",
      "projection-specificity",
    ]);
  });

  it("states its assumptions from the actual inputs", () => {
    const plain = project();
    const text = plain.assumptions.join("\n");
    expect(plain.assumptions.length).toBeGreaterThanOrEqual(4);
    expect(text).toContain(plain.startingRatePerWeek.toFixed(1));
    expect(text).toContain(baseline.phase);
    expect(text).toMatch(/slow/i);
    expect(text).toMatch(/range/i);

    const changed = project({ directWeeklySets: STEP * 2, phase: "cutting", passRate: 1 });
    const changedText = changed.assumptions.join("\n");
    expect(changedText).toMatch(/sets/i);
    expect(changedText).toContain("cutting");
    expect(changedText).toMatch(/pass/i);
    expect(changedText).not.toEqual(text);
    for (const sentence of changed.assumptions) {
      expect(sentence).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("spells out the direct / related split when the scenario changes either", () => {
    const plain = project().assumptions.join("\n");
    expect(plain).not.toMatch(/other exercises/i);
    for (const scenario of [
      { directWeeklySets: STEP * 2 },
      { relatedWeeklySets: STEP * 2 },
      { directWeeklySets: STEP * 2, relatedWeeklySets: 0 },
    ]) {
      const text = project(scenario).assumptions.join("\n");
      expect(text).toMatch(/lift itself/i);
      expect(text).toMatch(/other exercises/i);
      expect(text).toContain(C.relatedSetTransfer.toFixed(2));
      expect(text).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  describe("relatedTrend", () => {
    const rising: Point[] = Array.from({ length: 6 }, (_, i) => ({
      t: NOW.getTime() - (5 - i) * MS_PER_WEEK,
      v: 50 + 2.5 * i,
    }));
    const tooShort = rising.slice(0, 3);

    it("is absent unless related history is passed", () => {
      expect("relatedTrend" in project()).toBe(false);
    });

    it("reports the fitted slope of each related exercise with enough points", () => {
      const p = project(undefined, {
        relatedHistory: { goblet_squat: tooShort, bulgarian_split_squat: rising },
      });
      expect(p.relatedTrend).toHaveLength(1);
      expect(p.relatedTrend![0].exerciseId).toBe("bulgarian_split_squat");
      expect(p.relatedTrend![0].slopePerWeek).toBeCloseTo(fitTrend(rising)!.slopePerWeek, 9);
      expect(project(undefined, { relatedHistory: {} }).relatedTrend).toEqual([]);
    });

    it("does not alter the projected numbers", () => {
      const without = project({ directWeeklySets: STEP * 2 });
      const withRelated = project(
        { directWeeklySets: STEP * 2 },
        { relatedHistory: { bulgarian_split_squat: rising } }
      );
      expect(withRelated.points).toEqual(without.points);
      expect(withRelated.gain).toEqual(without.gain);
      expect(withRelated.assumptions).toEqual(without.assumptions);
    });

    it("is still reported when the lift itself has too little data", () => {
      const p = project(undefined, {
        history: [],
        relatedHistory: { bulgarian_split_squat: rising },
      });
      expect(p.status).toBe("insufficient-data");
      expect(p.relatedTrend).toHaveLength(1);
    });
  });
});
