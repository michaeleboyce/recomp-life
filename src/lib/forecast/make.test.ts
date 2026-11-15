// @vitest-environment node
import { describe, expect, it } from "vitest";
import { E1RM_MAX_REPS } from "@/lib/e1rm";
import { repsToBeat } from "@/lib/projection/prOpportunity";
import { makeEntry, makeSession } from "@/lib/workout/testFixtures";
import type { WorkoutPlan } from "@/lib/workout/types";
import type { Forecast } from "@/types";
import { emptyLiftState } from "@/lib/rebuild";
import { BODYWEIGHT_MODEL, E1RM_HORIZON_MODEL, REPS_MODEL, STALL_MODEL } from "./coefficients";
import {
  BODYWEIGHT_SUBJECT,
  horizonSlot,
  isoWeekUtc,
  makeHorizonForecasts,
  makeSessionForecasts,
  sessionForecastId,
} from "./make";
import { forecastMilestone, forecastStall } from "./outlook";
import { FORECAST_KINDS } from "./registry";
import { forecastReps, lastT1Sets } from "./reps";
import { forecastSessionLength } from "./sessionLength";
import { DAY, WEEK, sourceAt, t1Session, weighIn } from "./testHelpers";

const NOW = new Date("2026-11-14T17:00:00Z");
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

const session = makeSession({ id: "w-today", startedAt: NOW });
const plan: WorkoutPlan = [
  makeEntry({ tier: "warmup", isWarmUp: true, isAMRAP: false, targetSets: 1, targetReps: 5, weight: 95 }),
  makeEntry({ weight: 225 }),
  makeEntry({ exerciseId: "bench", tier: "T2", targetSets: 3, targetReps: 10, weight: 120, isAMRAP: false }),
  makeEntry({ exerciseId: "lat_pulldown", tier: "T3", targetSets: 3, targetReps: 15, weight: 90 }),
];

/** Five squat sessions a week apart, 200 to 220 lb. */
const squats = [5, 4, 3, 2, 1].map((weeksAgo, i) =>
  t1Session({
    id: `sq${i}`,
    at: new Date(NOW.getTime() - weeksAgo * WEEK),
    weight: 200 + i * 5,
    lastReps: [6, 5, 5, 4, 5][i],
  })
);
const source = sourceAt(NOW, { workouts: squats, bestE1RMs: { squat: 255 } });

const byKind = (rows: Forecast[]) => Object.fromEntries(rows.map((row) => [row.kind, row]));

describe("ids and slots", () => {
  it("builds session ids from the workout, the kind and the lift", () => {
    expect(sessionForecastId("w1", "sessionLength")).toBe("fc:w1:sessionLength");
    expect(sessionForecastId("w1", "amrapReps", "squat", "T1")).toBe("fc:w1:amrapReps:squat:T1");
    expect(sessionForecastId("w1", "liftPass", "squat")).toBe("fc:w1:liftPass:squat:T1");
  });

  it("names the ISO week in UTC", () => {
    expect(isoWeekUtc(new Date(Date.UTC(2026, 10, 14)))).toBe("2026-W46");
    expect(isoWeekUtc(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-W01");
    // The first days of January can belong to the last week of the year before.
    expect(isoWeekUtc(new Date(Date.UTC(2027, 0, 1)))).toBe("2026-W53");
    // And the last days of December to the first week of the next.
    expect(isoWeekUtc(new Date(Date.UTC(2024, 11, 30)))).toBe("2025-W01");
    // Monday starts a week; Sunday night UTC is still the week before.
    expect(isoWeekUtc(new Date(Date.UTC(2026, 10, 15, 23, 59)))).toBe("2026-W46");
    expect(isoWeekUtc(new Date(Date.UTC(2026, 10, 16, 0, 0)))).toBe("2026-W47");
  });

  it("builds horizon slots from kind, subject and week", () => {
    expect(horizonSlot("e1rm4w", "squat", NOW)).toBe("e1rm4w|squat|2026-W46");
    expect(horizonSlot("bodyweight4w", BODYWEIGHT_SUBJECT, NOW)).toBe(
      "bodyweight4w|bodyweight|2026-W46"
    );
  });
});

describe("makeSessionForecasts", () => {
  const rows = makeSessionForecasts(session, plan, source);
  const kinds = byKind(rows);

  it("makes one row per kind for the T1 lift, and one for the session", () => {
    expect(rows.map((row) => row.id).sort()).toEqual([
      "fc:w-today:amrapReps:squat:T1",
      "fc:w-today:liftPass:squat:T1",
      "fc:w-today:newBest:squat:T1",
      "fc:w-today:sessionLength",
    ]);
    for (const row of rows) {
      expect(row.clientId).toBe(row.id);
      expect(row.slot).toBe(row.id);
      expect(row.workoutId).toBe("w-today");
      expect(row.madeAt).toBe(NOW);
      expect(row.synced).toBe(false);
      expect(row.modelVersion).toBe(FORECAST_KINDS[row.kind].modelVersion);
    }
    expect(kinds.sessionLength.exerciseId).toBeUndefined();
    expect(kinds.amrapReps).toMatchObject({ exerciseId: "squat", tier: "T1" });
  });

  it("stores the reps forecast as the model gives it", () => {
    const model = forecastReps({
      history: lastT1Sets(squats, "squat", NOW),
      performedExerciseId: "squat",
      weight: 225,
      targetReps: 3,
      phase: source.settings!.trainingPhase.mode,
      bestE1RM: 255,
      now: NOW,
    });
    expect(kinds.amrapReps.event).toEqual({ type: "amrapReps", weight: 225 });
    expect(kinds.amrapReps.prediction).toEqual({
      point: model.typical,
      low: model.range.low,
      high: model.range.high,
      pmf: model.pmf,
      unit: "reps",
    });
    expect(sum(kinds.amrapReps.prediction.pmf!)).toBeCloseTo(1, 12);
    expect(kinds.amrapReps.prediction.pmf).toHaveLength(REPS_MODEL.maxReps + 1);
    expect(kinds.amrapReps.basis).toBe(model.basis);
    expect(kinds.amrapReps.inputs.rangeChance).toBe(model.range.chance);

    expect(kinds.liftPass.event).toEqual({ type: "repsAtLeast", weight: 225, reps: 3 });
    expect(kinds.liftPass.prediction).toEqual({
      point: model.passChance,
      probability: model.passChance,
      unit: "chance",
    });
  });

  it("states the new-best event as the estimated max to beat, at the weight", () => {
    // The best that stood when the forecast was made is on the event itself.
    expect(kinds.newBest.event).toEqual({ type: "e1rmAbove", weight: 225, level: 255 });
    // No effort was logged on the earlier last sets, so the chance is the stored
    // spread from the all-out reps needed up to the longest set that gives an estimate.
    const needed = repsToBeat(225, 255)!.reps;
    expect(kinds.newBest.prediction.probability).toBeCloseTo(
      sum(kinds.amrapReps.prediction.pmf!.slice(needed, E1RM_MAX_REPS + 1)),
      12
    );
    expect(kinds.newBest.inputs).toMatchObject({
      bestE1RM: 255,
      repsNeeded: needed,
      effortCredit: 0,
      effortSample: 5,
    });
  });

  it("counts the usual effort credit when the earlier last sets were logged with one", () => {
    const logged = squats.map((workout) => ({
      ...workout,
      sets: workout.sets.map((set) => ({ ...set, rpe: 8 })),
    }));
    const credited = byKind(makeSessionForecasts(session, plan, { ...source, workouts: logged }));
    const needed = repsToBeat(225, 255, 8)!.reps;
    expect(needed).toBeLessThan(repsToBeat(225, 255)!.reps);
    expect(credited.newBest.event).toEqual({ type: "e1rmAbove", weight: 225, level: 255 });
    expect(credited.newBest.inputs).toMatchObject({ repsNeeded: needed, effortCredit: 2 });
    expect(credited.newBest.prediction.probability).toBeCloseTo(
      sum(credited.amrapReps.prediction.pmf!.slice(needed, E1RM_MAX_REPS + 1)),
      12
    );
    expect(credited.newBest.prediction.probability!).toBeGreaterThan(
      kinds.newBest.prediction.probability!
    );
    // The reps spread and the pass chance are about logged reps: unchanged.
    expect(credited.amrapReps.prediction).toEqual(kinds.amrapReps.prediction);
    expect(credited.liftPass.prediction).toEqual(kinds.liftPass.prediction);
  });

  it("stores the session length with its range and a due time", () => {
    const model = forecastSessionLength({
      plan,
      workouts: squats,
      phase: source.settings!.trainingPhase,
      now: NOW,
    });
    expect(kinds.sessionLength.event).toEqual({ type: "durationSeconds" });
    expect(kinds.sessionLength.prediction).toEqual({
      point: model.seconds,
      low: model.low,
      high: model.high,
      unit: "s",
    });
    for (const row of rows) {
      expect(row.dueAt.getTime()).toBe(NOW.getTime() + Math.round(model.seconds) * 1000);
    }
  });

  it("records what the model saw on every row", () => {
    for (const row of rows) {
      for (const key of ["level", "scatter", "sampleSize", "sdScale", "readinessShift", "phase"]) {
        expect(row.inputs, `${row.kind}.${key}`).toHaveProperty(key);
      }
      expect(row.inputs.sdScale).toBe(1);
      expect(row.inputs.phase).toBe(source.settings!.trainingPhase.mode);
      expect(["prior", "persistence", "trend", "regime-change"]).toContain(row.basis);
    }
    expect(kinds.amrapReps.inputs).toMatchObject({
      sampleSize: 5,
      weight: 225,
      targetReps: 3,
      stage: "5x3",
      performedExerciseId: "squat",
      readinessShift: 0,
    });
  });

  it("holds the prediction and the event only: nothing about the outcome", () => {
    const allowed = [
      "id", "clientId", "slot", "kind", "workoutId", "exerciseId", "tier", "madeAt", "dueAt",
      "event", "prediction", "basis", "inputs", "modelVersion", "synced",
    ];
    for (const row of rows) {
      expect(Object.keys(row).filter((key) => !allowed.includes(key))).toEqual([]);
      expect(
        Object.keys(row.event).every((key) =>
          ["type", "weight", "reps", "level", "windowDays", "minResults"].includes(key)
        )
      ).toBe(true);
    }
  });

  it("has no new-best row without a best, or when no rep count would beat it", () => {
    const none = makeSessionForecasts(session, plan, sourceAt(NOW, { workouts: squats }));
    expect(none.map((row) => row.kind).sort()).toEqual(["amrapReps", "liftPass", "sessionLength"]);
    const outOfReach = makeSessionForecasts(
      session,
      plan,
      sourceAt(NOW, { workouts: squats, bestE1RMs: { squat: 500 } })
    );
    expect(outOfReach.some((row) => row.kind === "newBest")).toBe(false);
  });

  it("forecasts a home substitute from its own past sets and gives it no new-best row", () => {
    const homePlan: WorkoutPlan = [
      makeEntry({ weight: 80, substituteExerciseId: "goblet_squat", originalWeight: 225 }),
    ];
    const home = t1Session({
      id: "home1",
      at: new Date(NOW.getTime() - 10 * DAY),
      weight: 80,
      lastReps: 8,
      substituteExerciseId: "goblet_squat",
    });
    const first = byKind(makeSessionForecasts(session, homePlan, source));
    expect(first.amrapReps.basis).toBe("prior");
    expect(first.amrapReps.event.weight).toBe(80);
    expect(first.newBest).toBeUndefined();

    const second = byKind(
      makeSessionForecasts(session, homePlan, { ...source, workouts: [...squats, home] })
    );
    expect(second.amrapReps.basis).toBe("persistence");
    expect(second.amrapReps.inputs.performedExerciseId).toBe("goblet_squat");
    expect(second.amrapReps.prediction.point).toBe(8);
  });

  describe("a weight the user set before starting", () => {
    const prescribed = [{ exerciseId: "squat", tier: "T1" as const, weight: 225, sets: 5, reps: 3 }];
    const started = makeSession({ id: "w-today", startedAt: NOW, prescribed });
    const at = (weight: number, from = source) =>
      byKind(makeSessionForecasts(started, [makeEntry({ weight })], from)).amrapReps;

    it.each([
      ["no results", sourceAt(NOW)],
      ["one result", sourceAt(NOW, { workouts: squats.slice(-1) })],
      ["three results", sourceAt(NOW, { workouts: squats.slice(-3) })],
    ])("does not make the lifter look stronger or weaker: %s", (_name, from) => {
      const planned = at(225, from);
      const heavier = at(245, from);
      const lighter = at(205, from);
      // The strength level is worked out for the program's weight, whatever is on the bar.
      expect(heavier.inputs.level).toBe(planned.inputs.level);
      expect(lighter.inputs.level).toBe(planned.inputs.level);
      expect(heavier.inputs.scatter).toBe(planned.inputs.scatter);
      // So a heavier bar means fewer reps, and a lighter one more.
      expect(heavier.prediction.point).toBeLessThan(planned.prediction.point);
      expect(lighter.prediction.point).toBeGreaterThan(planned.prediction.point);
      // The forecast is still for the weight that will be lifted, and says what it assumed.
      expect(heavier.event.weight).toBe(245);
      expect(heavier.inputs).toMatchObject({ weight: 245, plannedWeight: 225 });
      expect(planned.inputs).toMatchObject({ weight: 225, plannedWeight: 225 });
    });

    it("leaves a lift at the program's weight exactly as it was", () => {
      expect(makeSessionForecasts(started, plan, source)).toEqual(rows);
    });

    it("reads a home substitute's planned weight in the substitute's own terms", () => {
      // The plan gave 80 for the 225 the program asked for; the user made it 90, and
      // the plan scaled the barbell weight it stands for to match (253).
      const edited = makeEntry({ weight: 90, originalWeight: 253, substituteExerciseId: "goblet_squat" });
      const plain = makeEntry({ weight: 80, originalWeight: 225, substituteExerciseId: "goblet_squat" });
      const heavier = byKind(makeSessionForecasts(started, [edited], source)).amrapReps;
      const planned = byKind(makeSessionForecasts(started, [plain], source)).amrapReps;
      expect(planned.inputs.plannedWeight).toBe(80);
      expect(heavier.inputs.plannedWeight as number).toBeCloseTo(80, 0);
      expect(heavier.inputs.level as number).toBeCloseTo(planned.inputs.level as number, 0);
      expect(heavier.prediction.point).toBeLessThan(planned.prediction.point);
    });
  });

  describe("a lift that is not in the session's prescription", () => {
    const prescribed = [{ exerciseId: "squat", tier: "T1" as const, weight: 225, sets: 5, reps: 3 }];
    const started = makeSession({ id: "w-today", startedAt: NOW, prescribed });

    it("gets no forecast rows: a swapped-in lift has nothing to be scored against", () => {
      // Deadlift swapped into the squat's slot: a T1 entry with an open last set.
      const swapped: WorkoutPlan = [makeEntry({ exerciseId: "deadlift", weight: 185 }), ...plan.slice(2)];
      const made = makeSessionForecasts(started, swapped, source);
      expect(made.map((row) => row.kind)).toEqual(["sessionLength"]);
      // Without the fix these would be rows built on no results at all.
      expect(made.some((row) => row.basis === "prior" && row.exerciseId === "deadlift")).toBe(false);
    });

    it("still forecasts the session's own lift beside it", () => {
      const both: WorkoutPlan = [makeEntry({ exerciseId: "deadlift", weight: 185 }), makeEntry({ weight: 225 })];
      const made = makeSessionForecasts(started, both, source);
      expect(made.filter((row) => row.exerciseId).every((row) => row.exerciseId === "squat")).toBe(true);
      expect(made.map((row) => row.kind).sort()).toEqual([
        "amrapReps",
        "liftPass",
        "newBest",
        "sessionLength",
      ]);
    });

    it("forecasts every T1 lift of a session stored without a prescription, as before", () => {
      const old = makeSession({ id: "w-today", startedAt: NOW });
      const made = makeSessionForecasts(old, [makeEntry({ exerciseId: "deadlift", weight: 185 })], source);
      expect(made.map((row) => row.kind)).toEqual(["amrapReps", "liftPass", "sessionLength"]);
    });
  });

  it("makes reps rows only for a T1 lift with a weight and an open last set", () => {
    const odd: WorkoutPlan = [
      makeEntry({ weight: 0 }),
      makeEntry({ exerciseId: "bench", isAMRAP: false, weight: 150 }),
      makeEntry({ exerciseId: "ohp", tier: "T2", weight: 60 }),
    ];
    expect(makeSessionForecasts(session, odd, source).map((row) => row.kind)).toEqual([
      "sessionLength",
    ]);
  });

  it("passes the readiness shift and the widening factors through", () => {
    const shifted = byKind(
      makeSessionForecasts(session, plan, {
        ...source,
        readinessShift: -0.02,
        sdScale: { amrapReps: 1.3, sessionLength: 1.15 },
      })
    );
    expect(shifted.amrapReps.inputs.readinessShift).toBe(-0.02);
    expect(shifted.amrapReps.inputs.level).toBeCloseTo(
      (kinds.amrapReps.inputs.level as number) * 0.98,
      8
    );
    expect(shifted.liftPass.prediction.probability!).toBeLessThan(
      kinds.liftPass.prediction.probability!
    );
    for (const kind of ["amrapReps", "liftPass", "newBest"] as const) {
      expect(shifted[kind].inputs.sdScale).toBe(1.3);
    }
    expect(shifted.sessionLength.inputs.sdScale).toBe(1.15);
    expect(shifted.sessionLength.inputs.readinessShift).toBeNull();
  });

  it("is the same for the same inputs, and blind to anything not finished before now", () => {
    expect(makeSessionForecasts(session, plan, source)).toEqual(rows);
    const noise = [
      t1Session({ id: "later", at: new Date(NOW.getTime() + DAY), weight: 300, lastReps: 9 }),
      {
        ...t1Session({ id: "open", at: new Date(NOW.getTime() - DAY), weight: 300, lastReps: 9 }),
        completedAt: null,
      },
      {
        ...t1Session({ id: "gone", at: new Date(NOW.getTime() - 2 * DAY), weight: 300, lastReps: 9 }),
        deletedAt: 3,
      },
    ];
    expect(
      makeSessionForecasts(session, plan, { ...source, workouts: [...noise, ...squats] })
    ).toEqual(rows);
  });
});

describe("makeHorizonForecasts", () => {
  const bodyweight = Array.from({ length: 28 }, (_, day) =>
    weighIn(`bw${day}`, new Date(NOW.getTime() - day * DAY), 230 + day / 7)
  );
  const full = sourceAt(NOW, { workouts: squats, bodyweight, bestE1RMs: { squat: 255 } });
  const ids = () => {
    let n = 0;
    return () => `id-${++n}`;
  };

  it("makes a row for each lift it can project and one for bodyweight", () => {
    const rows = makeHorizonForecasts(full, ids());
    expect(rows.map((row) => [row.id, row.kind, row.slot])).toEqual([
      ["id-1", "e1rm4w", "e1rm4w|squat|2026-W46"],
      ["id-2", "bodyweight4w", "bodyweight4w|bodyweight|2026-W46"],
    ]);
    const [lift, body] = rows;
    expect(lift).toMatchObject({
      clientId: "id-1",
      exerciseId: "squat",
      madeAt: NOW,
      event: { type: "e1rmLevel", windowDays: E1RM_HORIZON_MODEL.outcomeWindowDays },
      modelVersion: FORECAST_KINDS.e1rm4w.modelVersion,
      synced: false,
    });
    expect(lift.workoutId).toBeUndefined();
    expect(lift.dueAt.getTime()).toBe(NOW.getTime() + E1RM_HORIZON_MODEL.horizonWeeks * WEEK);
    expect(lift.prediction.unit).toBe("lb");
    expect(lift.prediction.low!).toBeLessThan(lift.prediction.point);
    expect(lift.prediction.high!).toBeGreaterThan(lift.prediction.point);

    expect(body).toMatchObject({
      event: { type: "bodyweightMean", windowDays: BODYWEIGHT_MODEL.outcomeWindowDays },
      modelVersion: FORECAST_KINDS.bodyweight4w.modelVersion,
    });
    expect(body.exerciseId).toBeUndefined();
    expect(body.dueAt.getTime()).toBe(NOW.getTime() + BODYWEIGHT_MODEL.horizonDays * DAY);
    expect(body.prediction.point).toBeCloseTo(226, 4);

    for (const row of rows) {
      for (const key of ["level", "scatter", "sampleSize", "sdScale", "readinessShift", "phase"]) {
        expect(row.inputs, `${row.kind}.${key}`).toHaveProperty(key);
      }
    }
  });

  it("makes nothing from too little history", () => {
    expect(makeHorizonForecasts(sourceAt(NOW), ids())).toEqual([]);
    const thin = sourceAt(NOW, { workouts: squats.slice(0, 2), bodyweight: bodyweight.slice(0, 3) });
    expect(makeHorizonForecasts(thin, ids())).toEqual([]);
  });

  it("asks for an id only for the rows it makes", () => {
    let asked = 0;
    makeHorizonForecasts(full, () => `x${++asked}`);
    expect(asked).toBe(2);
  });

  it("adds the stall chance and the round-number date of each T1 lift with a lift state", () => {
    const squat = { ...emptyLiftState("squat"), t1Weight: 225, t1Stage: "5x3" as const };
    const withState = { ...full, liftStates: [squat] };
    const rows = makeHorizonForecasts(withState, ids());
    const lift = rows.filter((row) => row.kind === "stallRisk" || row.kind === "milestone");
    expect(lift.map((row) => [row.kind, row.slot])).toEqual([
      ["stallRisk", "stallRisk|squat|2026-W46"],
      ["milestone", "milestone|squat|2026-W46"],
    ]);
    const stall = forecastStall(withState, "squat")!;
    expect(lift[0]).toMatchObject({
      exerciseId: "squat",
      tier: "T1",
      madeAt: NOW,
      dueAt: new Date(stall.dueAt),
      event: { type: "missAtStage", weight: 225, reps: 3, minResults: STALL_MODEL.sessions },
      prediction: { point: stall.chance, probability: stall.chance, unit: "chance" },
      basis: stall.basis,
      modelVersion: FORECAST_KINDS.stallRisk.modelVersion,
    });
    const milestone = forecastMilestone(withState, "squat")!;
    expect(lift[1]).toMatchObject({
      event: { type: "weightReached", weight: 250 },
      prediction: {
        point: milestone.point / DAY,
        low: milestone.low / DAY,
        high: milestone.high / DAY,
        unit: "day",
      },
      dueAt: new Date(milestone.high),
    });
    expect(lift[1].workoutId).toBeUndefined();
  });

  it("skips a slot it is told is taken without working it out", () => {
    const squat = { ...emptyLiftState("squat"), t1Weight: 225, t1Stage: "5x3" as const };
    let asked = 0;
    const rows = makeHorizonForecasts({ ...full, liftStates: [squat] }, () => `x${++asked}`, {
      skipSlot: (slot) => !slot.startsWith("bodyweight4w"),
    });
    expect(rows.map((row) => row.kind)).toEqual(["bodyweight4w"]);
    expect(asked).toBe(1);
  });

  it("uses the same slot all week and a new one the week after", () => {
    const monday = new Date(Date.UTC(2026, 10, 9, 6));
    const sunday = new Date(Date.UTC(2026, 10, 15, 22));
    const nextMonday = new Date(Date.UTC(2026, 10, 16, 6));
    const slotAt = (now: Date) =>
      makeHorizonForecasts({ ...full, now }, ids()).find((row) => row.kind === "bodyweight4w")?.slot;
    expect(slotAt(monday)).toBe(slotAt(sunday));
    expect(slotAt(nextMonday)).not.toBe(slotAt(sunday));
  });
});
