// @vitest-environment node
/**
 * The forecast half of the glass-box contract: anything the app predicts is a
 * registered kind with a model, a resolver, a declared quantity and an evidence rule,
 * and is stored as a prediction only. These tests fail when a kind is added without
 * one of those. Spec: docs/plans/2026-11-14-glass-box-design.md (G4).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { E1RM_MAX_REPS, isNewPR } from "@/lib/e1rm";
import { EVIDENCE_RULES } from "@/lib/evidence/rules";
import { repsToBeat } from "@/lib/projection/prOpportunity";
import { e1rmsForWorkout } from "@/lib/rebuild";
import type { Forecast, ForecastEventType, ForecastKind } from "@/types";
import { REPS_MODEL } from "./coefficients";
import { FORECAST_KINDS, FORECAST_KIND_IDS } from "./registry";
import { replayForecasts } from "./replay";
import { lastT1Sets, usualEffortCredit } from "./reps";
import { resolveForecast } from "./resolve";
import { demoReplayInput, forecastRow } from "./testHelpers";

/** Every kind the stored type allows. Adding one to the type breaks this until it is listed. */
const ALL_KINDS: Record<ForecastKind, true> = {
  amrapReps: true,
  newBest: true,
  liftPass: true,
  sessionLength: true,
  e1rm4w: true,
  bodyweight4w: true,
  stallRisk: true,
  milestone: true,
};

const EVENT_OF_KIND: Record<ForecastKind, ForecastEventType> = {
  amrapReps: "amrapReps",
  newBest: "e1rmAbove",
  liftPass: "repsAtLeast",
  sessionLength: "durationSeconds",
  e1rm4w: "e1rmLevel",
  bodyweight4w: "bodyweightMean",
  stallRisk: "missAtStage",
  milestone: "weightReached",
};

const NOW = new Date(2026, 10, 14, 12, 0, 0);
const demo = demoReplayInput(NOW);
const replay = replayForecasts(demo);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("the registry", () => {
  it("lists every kind the stored type allows, and nothing else", () => {
    expect(Object.keys(FORECAST_KINDS).sort()).toEqual(Object.keys(ALL_KINDS).sort());
    expect([...FORECAST_KIND_IDS].sort()).toEqual(Object.keys(ALL_KINDS).sort());
  });

  it.each(Object.keys(ALL_KINDS) as ForecastKind[])("%s is fully described", (kind) => {
    const def = FORECAST_KINDS[kind];
    expect(def.kind).toBe(kind);
    expect(typeof def.resolve).toBe("function");
    expect(def.estimand.length).toBeGreaterThan(30);
    expect(def.modelVersion).toMatch(/^[a-z0-9]+-\d+$/);
    expect(["session", "horizon"]).toContain(def.scope);
    expect(Object.keys(EVIDENCE_RULES), `${kind}: ${def.ruleId} is not a rule`).toContain(def.ruleId);
  });

  it("names the rule that owns each model's numbers", () => {
    expect(FORECAST_KINDS.amrapReps.ruleId).toBe("forecast-reps");
    expect(FORECAST_KINDS.newBest.ruleId).toBe("forecast-reps");
    expect(FORECAST_KINDS.liftPass.ruleId).toBe("forecast-reps");
    expect(FORECAST_KINDS.sessionLength.ruleId).toBe("forecast-session-length");
    expect(FORECAST_KINDS.bodyweight4w.ruleId).toBe("forecast-bodyweight");
    expect(FORECAST_KINDS.e1rm4w.ruleId).toBe("projection-rate-of-gain");
    expect(FORECAST_KINDS.stallRisk.ruleId).toBe("forecast-stall");
    expect(FORECAST_KINDS.milestone.ruleId).toBe("forecast-milestone");
  });

  it("stores the second set of forecasts for a date ahead, one per lift per week", () => {
    for (const kind of ["stallRisk", "milestone"] as const) {
      expect(FORECAST_KINDS[kind].scope).toBe("horizon");
      const rows = replay.forecasts.filter((row) => row.kind === kind);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.slot).toMatch(new RegExp(`^${kind}\\|${row.exerciseId}\\|\\d{4}-W\\d{2}$`));
        expect(row.id).toBe(`replay:${row.slot}`);
        expect(row.tier).toBe("T1");
      }
    }
  });

  it("uses plain words in what screens show", () => {
    for (const def of Object.values(FORECAST_KINDS)) {
      for (const text of [def.label, def.estimand]) {
        expect(text, `${def.kind}: "${text}"`).not.toMatch(/AMRAP|e1RM|1RM|RPE|\bRIR\b|\bPR\b|\bT1\b/);
      }
      expect(def.label.length).toBeGreaterThan(5);
    }
    const labels = Object.values(FORECAST_KINDS).map((def) => def.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("every kind has a model", () => {
  const made = new Map<ForecastKind, Forecast[]>();
  for (const forecast of replay.forecasts) {
    made.set(forecast.kind, [...(made.get(forecast.kind) ?? []), forecast]);
  }

  it.each(Object.keys(ALL_KINDS) as ForecastKind[])("%s is made from the demo history", (kind) => {
    const rows = made.get(kind) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.modelVersion).toBe(FORECAST_KINDS[kind].modelVersion);
      expect(row.event.type).toBe(EVENT_OF_KIND[kind]);
      expect(!!row.workoutId).toBe(FORECAST_KINDS[kind].scope === "session");
      expect(Number.isFinite(row.prediction.point)).toBe(true);
      expect(row.dueAt.getTime()).toBeGreaterThan(row.madeAt.getTime());
      for (const key of ["level", "scatter", "sampleSize", "sdScale", "readinessShift", "phase"]) {
        expect(row.inputs, `${row.id}: inputs.${key}`).toHaveProperty(key);
      }
    }
  });

  it("gives every amount a range around its point and every chance a value from 0 to 1", () => {
    for (const row of replay.forecasts) {
      const { point, low, high, probability } = row.prediction;
      if (probability !== undefined) {
        expect(probability).toBeGreaterThanOrEqual(0);
        expect(probability).toBeLessThanOrEqual(1);
        expect(point).toBe(probability);
        expect(low).toBeUndefined();
        expect(high).toBeUndefined();
      } else {
        expect(low!).toBeLessThanOrEqual(point);
        expect(high!).toBeGreaterThanOrEqual(point);
      }
    }
  });
});

describe("every kind has a resolver", () => {
  it("resolves through the registry's own function", () => {
    for (const { forecast, status } of replay.scored) {
      const direct = FORECAST_KINDS[forecast.kind].resolve(
        forecast,
        { workouts: demo.workouts, bodyweight: demo.bodyweight },
        NOW
      );
      expect(direct).toEqual(status);
    }
  });

  it.each(Object.keys(ALL_KINDS) as ForecastKind[])("%s gives a status even with an empty log", (kind) => {
    const row = forecastRow({ kind, event: { type: EVENT_OF_KIND[kind] } });
    const far = new Date("2030-01-01T00:00:00Z");
    const status = resolveForecast(row, { workouts: [], bodyweight: [] }, far);
    expect(status.state).toBe("void");
  });

  it("is void, not an error, for a kind it does not know", () => {
    const row = forecastRow({ kind: "notAKind" as ForecastKind });
    expect(resolveForecast(row, { workouts: [], bodyweight: [] }, NOW)).toEqual({
      state: "void",
      reason: "not-scorable",
    });
  });
});

describe("the reps kinds are three readings of one spread", () => {
  const sibling = (row: Forecast, kind: ForecastKind) =>
    replay.forecasts.find(
      (other) =>
        other.kind === kind &&
        other.workoutId === row.workoutId &&
        other.exerciseId === row.exerciseId
    );
  const spreads = replay.forecasts.filter((row) => row.kind === "amrapReps");

  it("stores probabilities that sum to 1", () => {
    expect(spreads.length).toBe(demo.workouts.length);
    for (const row of spreads) {
      const pmf = row.prediction.pmf!;
      expect(pmf).toHaveLength(REPS_MODEL.maxReps + 1);
      expect(pmf.every((p) => p >= 0)).toBe(true);
      expect(sum(pmf)).toBeCloseTo(1, 12);
      expect(row.inputs.rangeChance as number).toBeCloseTo(
        sum(pmf.slice(row.prediction.low!, row.prediction.high! + 1)),
        12
      );
    }
  });

  /**
   * The new-best relationship, exactly:
   * - the event is "this workout's estimated max for the lift is above `event.level`",
   *   the best that stood when the forecast was made (`source.bestE1RMs`);
   * - the reps that needs are `repsToBeat(weight, level, effortCredit)`: the
   *   fewest logged reps whose estimate, with the lifter's usual effort credit
   *   (`usualEffortCredit` of the last sets known then), beats the level;
   * - the stated chance is the reps spread from that count up to E1RM_MAX_REPS, the
   *   longest set the app keeps an estimate for. Reps above that are not a new best.
   */
  it("makes the new-best chance the spread from the reps a new best needs, with the usual effort credit, up to the longest set that counts", () => {
    const rows = replay.forecasts.filter((row) => row.kind === "newBest");
    expect(rows.length).toBeGreaterThan(10);
    let credited = 0;
    for (const row of rows) {
      const { weight, level } = row.event;
      expect(level).toBe(row.inputs.bestE1RM);
      expect(row.event.reps).toBeUndefined();

      const before = demo.workouts.filter(
        (w) => w.completedAt != null && w.completedAt.getTime() <= row.madeAt.getTime()
      );
      const best = Math.max(
        ...before
          .flatMap(e1rmsForWorkout)
          .filter((r) => r.exerciseId === row.exerciseId)
          .map((r) => r.estimated1RM)
      );
      expect(level).toBe(best);

      const effort = usualEffortCredit(
        lastT1Sets(before, row.exerciseId!, row.madeAt),
        row.exerciseId!,
        row.madeAt
      );
      expect(row.inputs.effortCredit).toBe(effort.credit);
      expect(row.inputs.effortSample).toBe(effort.sample);
      if (effort.credit > 0) credited += 1;

      const needed = repsToBeat(weight!, level!, effort.credit)!;
      expect(row.inputs.repsNeeded).toBe(needed.reps);
      expect(needed.reps).toBeLessThanOrEqual(E1RM_MAX_REPS);
      const pmf = sibling(row, "amrapReps")!.prediction.pmf!;
      expect(row.prediction.probability!).toBeCloseTo(
        sum(pmf.slice(needed.reps, E1RM_MAX_REPS + 1)),
        12
      );
    }
    // The demo lifter logs an effort on most last sets, so the credit is exercised.
    expect(credited).toBeGreaterThan(0);
  });

  it("scores a new best exactly when the workout's own estimated max beats the level", () => {
    const scored = replay.scored.filter(
      (item) => item.forecast.kind === "newBest" && item.status.state === "resolved"
    );
    expect(scored.length).toBeGreaterThan(10);
    let hits = 0;
    for (const { forecast, status } of scored) {
      if (status.state !== "resolved") continue;
      const workout = demo.workouts.find((w) => w.id === forecast.workoutId)!;
      const own = e1rmsForWorkout(workout)
        .filter((r) => r.exerciseId === forecast.exerciseId)
        .map((r) => r.estimated1RM);
      const estimate = own.length > 0 ? Math.max(...own) : null;
      expect(status.hit).toBe(estimate !== null && isNewPR(estimate, [forecast.event.level!]));
      if (status.hit) hits += 1;
    }
    expect(hits).toBeGreaterThan(0);
    expect(hits).toBeLessThan(scored.length);
  });

  it("makes the pass chance the spread's tail at the target reps", () => {
    for (const row of replay.forecasts.filter((r) => r.kind === "liftPass")) {
      const reps = sibling(row, "amrapReps")!;
      expect(row.event.reps).toBe(reps.inputs.targetReps);
      expect(row.event.weight).toBe(reps.event.weight);
      expect(row.prediction.probability!).toBeCloseTo(
        sum(reps.prediction.pmf!.slice(row.event.reps!)),
        12
      );
      expect(row.basis).toBe(reps.basis);
    }
  });
});

describe("the package stays pure", () => {
  const dir = __dirname;
  const sources = fs
    .readdirSync(dir)
    .filter((name) => /\.ts$/.test(name) && !/\.test\.ts$/.test(name) && name !== "testHelpers.ts")
    .map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), "utf8") }));

  it("reads no clock and no dice", () => {
    expect(sources.length).toBeGreaterThan(8);
    for (const { name, text } of sources) {
      expect(text, `${name} reads the clock`).not.toMatch(/Date\.now\s*\(|new Date\(\s*\)/);
      expect(text, `${name} uses Math.random`).not.toMatch(/Math\.random\s*\(/);
    }
  });

  it("imports no database, no React and no store", () => {
    for (const { name, text } of sources) {
      expect(text, name).not.toMatch(/from\s+["'](@\/db|dexie|react|zustand|@\/stores|@\/hooks|@\/components)/);
    }
  });
});
