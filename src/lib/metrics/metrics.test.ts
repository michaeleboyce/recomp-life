import { describe, expect, it } from "vitest";
import {
  METRICS,
  bucket,
  computeMetric,
  getMetric,
  inRange,
  summarize,
  type MetricId,
  type MetricSource,
  type Point,
  type Series,
} from "./index";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { MUSCLE_GROUP_ORDER } from "@/lib/muscles";
import type {
  BodyweightLog,
  Estimated1RM,
  ReadinessLog,
  RunLog,
  SetLog,
  Tier,
  UserSettings,
  WorkoutSession,
} from "@/types";

const DAY = 24 * 60 * 60 * 1000;

const ALL_IDS: MetricId[] = [
  "e1rm",
  "workingWeight",
  "amrapReps",
  "avgRpe",
  "liftVolume",
  "weeklySets",
  "bodyweight",
  "bodyweight7d",
  "lossRate",
  "sessionsPerWeek",
  "tonnage",
  "runDistance",
  "runDuration",
  "runPace",
  "runEffort",
  "sleep",
  "stress",
];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let setCounter = 0;

function sets(
  exerciseId: string,
  tier: Tier,
  weight: number,
  reps: number[],
  extra: Partial<SetLog> & { rpes?: Array<number | undefined>; amrapLast?: boolean } = {}
): SetLog[] {
  const { rpes, amrapLast, ...overrides } = extra;
  return reps.map((actualReps, i) => {
    const id = `set-${++setCounter}`;
    return {
      id,
      clientId: `c-${id}`,
      exerciseId,
      tier,
      setNumber: i + 1,
      targetReps: tier === "T1" ? 3 : tier === "T2" ? 10 : 15,
      actualReps,
      weight,
      isAMRAP: !!amrapLast && i === reps.length - 1,
      completedAt: new Date(2026, 9, 5, 18, i),
      restAfterSeconds: 0,
      status: "completed",
      isSubstituted: false,
      location: "gym",
      synced: false,
      ...(rpes?.[i] !== undefined ? { rpe: rpes[i] } : {}),
      ...overrides,
    } satisfies SetLog;
  });
}

function workout(id: string, startedAt: Date | string, workoutSets: SetLog[]): WorkoutSession {
  return {
    id,
    clientId: `c-${id}`,
    templateId: "A1",
    location: "gym",
    startedAt: startedAt as Date,
    completedAt: new Date(new Date(startedAt).getTime() + 3600_000),
    totalDurationSeconds: 3600,
    includeWarmUps: true,
    selectedAccessories: [],
    sets: workoutSets,
    preWorkoutPainEntries: [],
    modifications: [],
    synced: false,
  };
}

const MON_OCT_5 = new Date(2026, 9, 5, 18, 0);
const THU_OCT_8 = new Date(2026, 9, 8, 18, 0);
const MON_OCT_19 = new Date(2026, 9, 19, 18, 0);

const w1 = workout("w1", MON_OCT_5, [
  ...sets("squat", "warmup", 45, [10]),
  ...sets("squat", "T1", 190, [3, 3, 3, 3, 5], { rpes: [8, 8, 8, 8, 9], amrapLast: true }),
  ...sets("bench", "T2", 100, [10, 10, 10], { rpes: [7, 7, 8] }),
  ...sets("lat_pulldown", "T3", 90, [15, 15, 20], { amrapLast: true }),
]);
// Stored with an ISO-string date, as rows synced from another device can be.
const w2 = workout("w2", THU_OCT_8.toISOString(), [
  ...sets("bench", "T1", 145, [3, 3, 3, 3, 4], { amrapLast: true }),
  ...sets("squat", "T2", 135, [10, 10, 10]),
]);
// A home session two weeks later: goblet squats standing in for 195 lb squats.
const w3 = workout("w3", MON_OCT_19, [
  ...sets("squat", "T1", 75, [3, 3, 3, 3, 6], {
    rpes: [undefined, undefined, undefined, undefined, 9],
    amrapLast: true,
    isSubstituted: true,
    substituteExerciseId: "goblet_squat",
    originalWeight: 195,
    location: "home",
  }),
]);

function e1rmRow(id: string, date: Date | string, exerciseId: string, w: number, r: number, v: number): Estimated1RM {
  return {
    id,
    clientId: `c-${id}`,
    date: date as Date,
    exerciseId,
    workingWeight: w,
    repsCompleted: r,
    estimated1RM: v,
    workoutSessionId: `session-${id}`,
    synced: false,
  };
}

/** 21 daily 07:00 weigh-ins from Mon Oct 5, losing 0.2 lb a day. */
const weighIns: BodyweightLog[] = Array.from({ length: 21 }, (_, i) => ({
  id: `bw-${i}`,
  clientId: `c-bw-${i}`,
  date: new Date(2026, 9, 5 + i, 7, 0),
  weight: Math.round((230 - 0.2 * i) * 10) / 10,
  timeOfDay: "morning" as const,
  synced: false,
}));

function run(id: string, date: Date, durationMinutes: number, distanceMiles: number | null, effort: RunLog["perceivedEffort"]): RunLog {
  return {
    id,
    clientId: `c-${id}`,
    date,
    durationMinutes,
    distanceMiles,
    type: "outdoor",
    category: "easy",
    notes: "",
    perceivedEffort: effort,
    synced: false,
  };
}

function readiness(id: string, date: Date | string, sleepHours: ReadinessLog["sleepHours"], stressLevel: ReadinessLog["stressLevel"]): ReadinessLog {
  return { id, clientId: `c-${id}`, sessionId: `session-${id}`, sleepHours, stressLevel, date: date as Date, synced: false };
}

function source(overrides: Partial<MetricSource> = {}): MetricSource {
  return {
    workouts: [],
    e1rms: [],
    bodyweight: [],
    runs: [],
    readiness: [],
    pain: [],
    liftStates: [],
    settings: null,
    ...overrides,
  };
}

function settings(mode: UserSettings["trainingPhase"]["mode"]): UserSettings {
  return { ...DEFAULT_USER_PROFILE.settings, trainingPhase: { mode } };
}

// Newest first, as the hooks deliver them: metrics must not depend on input order.
const training = source({ workouts: [w3, w2, w1] });

const values = (s: Series) => s.points.map((p) => p.v);
const times = (s: Series) => s.points.map((p) => p.t);

function series(points: Point[]): Series {
  return { metric: "bodyweight", params: {}, points, unit: "lbs", better: "down" };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe("registry", () => {
  it("has an entry for every metric id, keyed by its own id", () => {
    expect(Object.keys(METRICS).sort()).toEqual([...ALL_IDS].sort());
    for (const id of ALL_IDS) {
      expect(METRICS[id].id).toBe(id);
      expect(METRICS[id].label.length).toBeGreaterThan(0);
      expect(typeof METRICS[id].format(1)).toBe("string");
      expect(getMetric(id)).toBe(METRICS[id]);
    }
  });

  it("scopes and directions are as specified", () => {
    const lift: MetricId[] = ["e1rm", "workingWeight", "amrapReps", "avgRpe", "liftVolume"];
    for (const id of ALL_IDS) {
      const scope = lift.includes(id) ? "lift" : id === "weeklySets" ? "muscle" : "global";
      expect(METRICS[id].scope).toBe(scope);
    }
    expect(METRICS.e1rm).toMatchObject({ unit: "lbs", better: "up" });
    expect(METRICS.workingWeight).toMatchObject({ unit: "lbs", better: "up" });
    expect(METRICS.amrapReps).toMatchObject({ unit: "reps", better: "up" });
    expect(METRICS.avgRpe).toMatchObject({ unit: "rpe", better: "none" });
    expect(METRICS.liftVolume).toMatchObject({ unit: "lbs", better: "up" });
    expect(METRICS.weeklySets).toMatchObject({ unit: "sets", better: "none" });
    expect(METRICS.lossRate.unit).toBe("lbs/week");
    expect(METRICS.sessionsPerWeek).toMatchObject({ unit: "sessions", better: "up" });
    expect(METRICS.tonnage).toMatchObject({ unit: "lbs", better: "up" });
    expect(METRICS.runDistance.unit).toBe("miles");
    expect(METRICS.runDuration.unit).toBe("min");
    expect(METRICS.runPace).toMatchObject({ unit: "min/mi", better: "down" });
    expect(METRICS.runEffort).toMatchObject({ unit: "level", better: "none" });
    expect(METRICS.sleep.unit).toBe("level");
    expect(METRICS.stress.unit).toBe("level");
  });

  it("getMetric throws for an unknown id", () => {
    expect(() => getMetric("nope" as MetricId)).toThrow(/nope/);
  });

  it("every metric returns an empty series for an empty source", () => {
    for (const id of ALL_IDS) {
      const params = { exerciseId: "squat", muscleGroup: "Quads" };
      const s = computeMetric(id, source(), params);
      expect(s).toMatchObject({ metric: id, params, points: [], unit: METRICS[id].unit });
    }
  });

  it("lift metrics return an empty series for an unknown or missing exercise", () => {
    const full = source({ workouts: [w1, w2, w3], e1rms: [e1rmRow("a", MON_OCT_5, "squat", 190, 5, 222)] });
    for (const id of ["e1rm", "workingWeight", "amrapReps", "avgRpe", "liftVolume"] as MetricId[]) {
      expect(computeMetric(id, full, { exerciseId: "nope" }).points).toEqual([]);
      expect(computeMetric(id, full).points).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Lift metrics
// ---------------------------------------------------------------------------

describe("e1rm", () => {
  it("emits one point per stored row for the exercise, oldest first", () => {
    const s = computeMetric(
      "e1rm",
      source({
        e1rms: [
          e1rmRow("b", THU_OCT_8.toISOString(), "squat", 195, 4, 228),
          e1rmRow("x", MON_OCT_5, "bench", 145, 5, 169),
          e1rmRow("a", MON_OCT_5, "squat", 190, 5, 222),
          e1rmRow("bad", MON_OCT_19, "squat", 200, 5, NaN),
        ],
      }),
      { exerciseId: "squat" }
    );
    expect(s.points).toEqual([
      { t: MON_OCT_5.getTime(), v: 222, label: "190 x 5", refId: "session-a" },
      { t: THU_OCT_8.getTime(), v: 228, label: "195 x 4", refId: "session-b" },
    ]);
    expect(s).toMatchObject({ metric: "e1rm", unit: "lbs", better: "up", params: { exerciseId: "squat" } });
  });
});

describe("workingWeight", () => {
  it("uses the T1 weight only, and plots a substitute's original weight", () => {
    // The same lift is trained heavy (T1) one day and light (T2) another; mixing the
    // two in one series would zigzag and make the latest value the light day's.
    const s = computeMetric("workingWeight", training, { exerciseId: "squat" });
    expect(values(s)).toEqual([190, 195]);
    expect(times(s)).toEqual([MON_OCT_5.getTime(), MON_OCT_19.getTime()]);
    expect(s.points.map((p) => p.refId)).toEqual(["w1", "w3"]);
    expect(s.points.map((p) => p.label)).toEqual(["T1 5 x 3", "T1 5 x 3"]);
  });

  it("ignores originalWeight on a set that was not substituted (a load drop)", () => {
    const w = workout("drop", MON_OCT_5, sets("bench", "T1", 90, [3, 3, 3], { originalWeight: 100 }));
    expect(values(computeMetric("workingWeight", source({ workouts: [w] }), { exerciseId: "bench" }))).toEqual([90]);
  });

  it("skips workouts where the lift was not trained as T1", () => {
    expect(computeMetric("workingWeight", training, { exerciseId: "lat_pulldown" }).points).toEqual([]);
  });
});

describe("amrapReps", () => {
  it("is the reps of the T1 AMRAP set per workout", () => {
    const squat = computeMetric("amrapReps", training, { exerciseId: "squat" });
    expect(values(squat)).toEqual([5, 6]);
    expect(squat.points.map((p) => p.refId)).toEqual(["w1", "w3"]);
    expect(squat.points.map((p) => p.label)).toEqual(["190 x 5", "195 x 6"]);
    expect(values(computeMetric("amrapReps", training, { exerciseId: "bench" }))).toEqual([4]);
    // T3 AMRAP sets do not count.
    expect(computeMetric("amrapReps", training, { exerciseId: "lat_pulldown" }).points).toEqual([]);
  });
});

describe("avgRpe", () => {
  it("averages the RPE of non-warm-up sets and skips workouts with none", () => {
    const squat = computeMetric("avgRpe", training, { exerciseId: "squat" });
    expect(squat.points).toHaveLength(2);
    expect(squat.points[0].v).toBeCloseTo(8.2, 10);
    expect(squat.points[1].v).toBe(9);
    expect(squat.points.map((p) => p.refId)).toEqual(["w1", "w3"]);
    const bench = computeMetric("avgRpe", training, { exerciseId: "bench" });
    expect(bench.points).toHaveLength(1);
    expect(bench.points[0].v).toBeCloseTo(22 / 3, 10);
  });
});

describe("liftVolume", () => {
  it("sums weight x reps over the lift's non-warm-up sets per workout", () => {
    expect(values(computeMetric("liftVolume", training, { exerciseId: "squat" }))).toEqual([
      190 * 17,
      135 * 30,
      75 * 18,
    ]);
    expect(values(computeMetric("liftVolume", training, { exerciseId: "lat_pulldown" }))).toEqual([90 * 50]);
  });
});

// ---------------------------------------------------------------------------
// Weekly training metrics
// ---------------------------------------------------------------------------

const WEEK_OCT_5 = new Date(2026, 9, 5).getTime();
const WEEK_OCT_12 = new Date(2026, 9, 12).getTime();
const WEEK_OCT_19 = new Date(2026, 9, 19).getTime();

describe("weeklySets", () => {
  it("counts direct sets for the display group per Monday week, zero for untrained weeks", () => {
    const quads = computeMetric("weeklySets", training, { muscleGroup: "Quads" });
    expect(times(quads)).toEqual([WEEK_OCT_5, WEEK_OCT_12, WEEK_OCT_19]);
    expect(values(quads)).toEqual([8, 0, 5]);
    expect(values(computeMetric("weeklySets", training, { muscleGroup: "Chest" }))).toEqual([8, 0, 0]);
    expect(values(computeMetric("weeklySets", training, { muscleGroup: "Back" }))).toEqual([3, 0, 0]);
  });

  it("does not count indirect sets in the value but reports them in the label", () => {
    const triceps = computeMetric("weeklySets", training, { muscleGroup: "Triceps" });
    expect(values(triceps)).toEqual([0, 0, 0]);
    expect(triceps.points[0].label).toBe("0 direct, 8 indirect");
  });

  it("is empty for an unknown or missing group", () => {
    expect(computeMetric("weeklySets", training, { muscleGroup: "Wings" }).points).toEqual([]);
    expect(computeMetric("weeklySets", training, { muscleGroup: "toString" }).points).toEqual([]);
    expect(computeMetric("weeklySets", training).points).toEqual([]);
  });

  it("puts Sunday in the week that started the Monday before", () => {
    const sunday = workout("sun", new Date(2026, 9, 11, 23, 30), sets("bench", "T1", 145, [3, 3]));
    const monday = workout("mon", new Date(2026, 9, 12, 0, 15), sets("bench", "T1", 145, [3]));
    const s = computeMetric("weeklySets", source({ workouts: [sunday, monday] }), { muscleGroup: "Chest" });
    expect(s.points.map((p) => [p.t, p.v])).toEqual([
      [WEEK_OCT_5, 2],
      [WEEK_OCT_12, 1],
    ]);
  });
});

describe("sessionsPerWeek", () => {
  it("counts workouts per calendar week, with zero for a missed week in between", () => {
    const s = computeMetric("sessionsPerWeek", training);
    expect(times(s)).toEqual([WEEK_OCT_5, WEEK_OCT_12, WEEK_OCT_19]);
    expect(values(s)).toEqual([2, 0, 1]);
  });
});

describe("tonnage", () => {
  it("sums weight x reps over all non-warm-up sets per calendar week", () => {
    const s = computeMetric("tonnage", training);
    const week1 = 190 * 17 + 100 * 30 + 90 * 50 + 145 * 16 + 135 * 30;
    expect(week1).toBe(17100);
    expect(values(s)).toEqual([17100, 0, 1350]);
    expect(times(s)).toEqual([WEEK_OCT_5, WEEK_OCT_12, WEEK_OCT_19]);
  });
});

// ---------------------------------------------------------------------------
// Bodyweight
// ---------------------------------------------------------------------------

describe("bodyweight", () => {
  it("emits one point per entry, oldest first, tolerating ISO-string dates", () => {
    const shuffled = [weighIns[2], { ...weighIns[0], date: weighIns[0].date.toISOString() as unknown as Date }, weighIns[1]];
    const s = computeMetric("bodyweight", source({ bodyweight: shuffled }));
    expect(s.points).toEqual([
      { t: weighIns[0].date.getTime(), v: 230, refId: "bw-0" },
      { t: weighIns[1].date.getTime(), v: 229.8, refId: "bw-1" },
      { t: weighIns[2].date.getTime(), v: 229.6, refId: "bw-2" },
    ]);
    expect(s.unit).toBe("lbs");
  });

  it("takes its direction from the training phase", () => {
    for (const id of ["bodyweight", "bodyweight7d"] as MetricId[]) {
      expect(computeMetric(id, source({ bodyweight: weighIns })).better).toBe("none");
      expect(computeMetric(id, source({ bodyweight: weighIns, settings: settings("cutting") })).better).toBe("down");
      expect(computeMetric(id, source({ bodyweight: weighIns, settings: settings("bulking") })).better).toBe("up");
      expect(computeMetric(id, source({ bodyweight: weighIns, settings: settings("maintaining") })).better).toBe("none");
    }
  });
});

describe("bodyweight7d", () => {
  it("is the mean of the entries on the entry's day and the six days before", () => {
    const s = computeMetric("bodyweight7d", source({ bodyweight: weighIns }));
    expect(s.points).toHaveLength(21);
    expect(s.points[0].v).toBe(230);
    expect(s.points[1].v).toBeCloseTo(229.9, 10);
    expect(s.points[6].v).toBeCloseTo(229.4, 10); // days 0..6
    expect(s.points[10].v).toBeCloseTo(228.6, 10); // days 4..10
    expect(s.points[10].label).toBe("7 entries");
    expect(s.points[10].t).toBe(weighIns[10].date.getTime());
  });

  it("averages only the entries that exist when days are missing", () => {
    const sparse = [weighIns[0], weighIns[3], weighIns[9]];
    const s = computeMetric("bodyweight7d", source({ bodyweight: sparse }));
    expect(s.points[1].v).toBeCloseTo((230 + 229.4) / 2, 10);
    expect(s.points[2].v).toBeCloseTo((229.4 + 228.2) / 2, 10); // day 0 is 9 days back
    expect(s.points[2].label).toBe("2 entries");
  });
});

describe("lossRate", () => {
  it("has no points before two weeks of data", () => {
    expect(computeMetric("lossRate", source({ bodyweight: weighIns.slice(0, 13) })).points).toEqual([]);
  });

  it("emits one signed lbs/week point per week from the second week on", () => {
    const s = computeMetric("lossRate", source({ bodyweight: weighIns }));
    expect(times(s)).toEqual([weighIns[13].date.getTime(), weighIns[20].date.getTime()]);
    expect(s.points[0].v).toBeCloseTo(-1.4, 10); // losing 0.2 lb a day
    expect(s.points[1].v).toBeCloseTo(-1.31, 2);
    expect(s.points[0].refId).toBe("bw-13");
    expect(s.points[0].label).toMatch(/^-0\.61% of bodyweight$/);
    expect(s.unit).toBe("lbs/week");
  });

  it("is positive when gaining and formats with a sign", () => {
    const gaining = weighIns.map((e, i) => ({ ...e, weight: 200 + 0.1 * i }));
    const s = computeMetric("lossRate", source({ bodyweight: gaining }));
    expect(s.points[0].v).toBeCloseTo(0.7, 10);
    expect(METRICS.lossRate.format(0.7)).toBe("+0.7");
    expect(METRICS.lossRate.format(-1.31)).toBe("-1.31");
    expect(METRICS.lossRate.format(0)).toBe("0");
    expect(METRICS.lossRate.format(-0.001)).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

describe("run metrics", () => {
  const runs = [
    run("r3", new Date(2026, 9, 9, 7), 10, 0, 1),
    run("r1", new Date(2026, 9, 5, 7), 30, 3, 2),
    run("r2", new Date(2026, 9, 7, 7), 20, null, 5),
  ];
  const src = source({ runs });

  it("runDistance skips runs with no distance", () => {
    const s = computeMetric("runDistance", src);
    expect(values(s)).toEqual([3, 0]);
    expect(s.points.map((p) => p.refId)).toEqual(["r1", "r3"]);
  });

  it("runDuration and runEffort emit every run, oldest first", () => {
    expect(values(computeMetric("runDuration", src))).toEqual([30, 20, 10]);
    expect(values(computeMetric("runEffort", src))).toEqual([2, 5, 1]);
  });

  it("runPace is minutes per mile for runs with a positive distance", () => {
    const s = computeMetric("runPace", src);
    expect(s.points).toEqual([
      { t: new Date(2026, 9, 5, 7).getTime(), v: 10, label: "3 mi in 30 min", refId: "r1" },
    ]);
    expect(METRICS.runPace.format(9.5)).toBe("9:30");
    expect(METRICS.runPace.format(10)).toBe("10:00");
  });
});

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

describe("sleep and stress", () => {
  const logs = [
    readiness("b", new Date(2026, 9, 7, 18).toISOString(), "7+", "good"),
    readiness("a", new Date(2026, 9, 5, 18), "<5", "low"),
    readiness("c", new Date(2026, 9, 9, 18), "5-7", "normal"),
  ];
  const src = source({ readiness: logs });

  it("map the answers to ordered levels, one point per log", () => {
    const sleep = computeMetric("sleep", src);
    expect(values(sleep)).toEqual([1, 3, 2]);
    expect(sleep.points.map((p) => p.label)).toEqual(["<5 h", "7+ h", "5-7 h"]);
    expect(sleep.points.map((p) => p.refId)).toEqual(["session-a", "session-b", "session-c"]);
    const stress = computeMetric("stress", src);
    expect(values(stress)).toEqual([1, 3, 2]);
    expect(stress.points.map((p) => p.label)).toEqual(["Low", "Good", "Normal"]);
  });

  it("format a level (or an average of levels) as its word", () => {
    expect([1, 2, 3].map(METRICS.sleep.format)).toEqual(["<5 h", "5-7 h", "7+ h"]);
    expect([1, 2, 3].map(METRICS.stress.format)).toEqual(["Low", "Normal", "Good"]);
    expect(METRICS.sleep.format(2.6)).toBe("7+ h");
    expect(METRICS.stress.format(0)).toBe("Low");
  });

  it("drop logs with an unrecognised answer", () => {
    const odd = readiness("z", new Date(2026, 9, 10), "8+" as ReadinessLog["sleepHours"], "good");
    expect(computeMetric("sleep", source({ readiness: [odd] })).points).toEqual([]);
    expect(computeMetric("stress", source({ readiness: [odd] })).points).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// inRange / summarize / bucket
// ---------------------------------------------------------------------------

describe("inRange", () => {
  const now = new Date(2026, 10, 11, 12).getTime();
  const at = (daysAgo: number, extraMs = 0) => ({ t: now - daysAgo * DAY + extraMs, v: daysAgo });
  const s = series([at(400), at(365), at(92), at(91), at(28, -1), at(28), at(1), at(0), at(-1)]);

  it("keeps 28, 91 and 365 days back from now, inclusive, and nothing after now", () => {
    expect(values(inRange(s, "4w", now))).toEqual([28, 1, 0]);
    expect(values(inRange(s, "3m", now))).toEqual([91, 28, 28, 1, 0]);
    expect(values(inRange(s, "1y", now))).toEqual([365, 92, 91, 28, 28, 1, 0]);
  });

  it("returns the series unchanged for all, and keeps the metadata otherwise", () => {
    expect(inRange(s, "all", now)).toBe(s);
    const cut = inRange(s, "4w", now);
    expect(cut).toMatchObject({ metric: "bodyweight", unit: "lbs", better: "down", params: {} });
    expect(s.points).toHaveLength(9);
  });

  it("handles an empty series", () => {
    expect(inRange(series([]), "4w", now).points).toEqual([]);
  });
});

describe("summarize", () => {
  it("is all null for an empty series", () => {
    expect(summarize(series([]))).toEqual({
      first: null,
      latest: null,
      change: null,
      changePct: null,
      min: null,
      max: null,
    });
  });

  it("has no change for a single point", () => {
    const p = { t: 1, v: 5 };
    expect(summarize(series([p]))).toEqual({
      first: p,
      latest: p,
      change: null,
      changePct: null,
      min: p,
      max: p,
    });
  });

  it("reports change, fractional change, min and max", () => {
    const points = [
      { t: 1, v: 200 },
      { t: 2, v: 180 },
      { t: 3, v: 230 },
      { t: 4, v: 230 },
      { t: 5, v: 210 },
    ];
    const summary = summarize(series(points));
    expect(summary.first).toBe(points[0]);
    expect(summary.latest).toBe(points[4]);
    expect(summary.change).toBe(10);
    expect(summary.changePct).toBeCloseTo(0.05, 10);
    expect(summary.min).toBe(points[1]);
    expect(summary.max).toBe(points[2]); // earliest of a tie
  });

  it("has a null changePct when the first value is zero", () => {
    const summary = summarize(series([{ t: 1, v: 0 }, { t: 2, v: 4 }]));
    expect(summary.change).toBe(4);
    expect(summary.changePct).toBeNull();
  });

  it("reports a negative change", () => {
    const summary = summarize(series([{ t: 1, v: 232 }, { t: 2, v: 226.2 }]));
    expect(summary.change).toBeCloseTo(-5.8, 10);
    expect(summary.changePct).toBeCloseTo(-0.025, 10);
  });
});

describe("bucket", () => {
  const sunLate = new Date(2026, 9, 11, 23, 59).getTime();
  const monEarly = new Date(2026, 9, 12, 0, 0).getTime();
  const wed = new Date(2026, 9, 14, 12, 0).getTime();
  const nov1 = new Date(2026, 10, 1, 0, 0).getTime();
  const oct31 = new Date(2026, 9, 31, 23, 59).getTime();
  const s = series([
    { t: sunLate, v: 1, label: "a", refId: "a" },
    { t: monEarly, v: 2, label: "b", refId: "b" },
    { t: wed, v: 4, label: "c", refId: "c" },
    { t: oct31, v: 8, label: "d", refId: "d" },
    { t: nov1, v: 16, label: "e", refId: "e" },
  ]);

  it("groups by Monday-start week and omits empty weeks", () => {
    const weekly = bucket(s, "week", "sum");
    expect(weekly.points.map((p) => [p.t, p.v])).toEqual([
      [WEEK_OCT_5, 1],
      [WEEK_OCT_12, 6],
      [new Date(2026, 9, 26).getTime(), 24], // Sat Oct 31 and Sun Nov 1 share a week
    ]);
    expect(weekly).toMatchObject({ metric: "bodyweight", unit: "lbs", better: "down" });
  });

  it("averages with mean", () => {
    expect(values(bucket(s, "week", "mean"))).toEqual([1, 3, 12]);
  });

  it("keeps the latest point's value, label and refId with last", () => {
    expect(bucket(s, "week", "last").points).toEqual([
      { t: WEEK_OCT_5, v: 1, label: "a", refId: "a" },
      { t: WEEK_OCT_12, v: 4, label: "c", refId: "c" },
      { t: new Date(2026, 9, 26).getTime(), v: 16, label: "e", refId: "e" },
    ]);
  });

  it("groups by calendar month", () => {
    const monthly = bucket(s, "month", "sum");
    expect(monthly.points.map((p) => [p.t, p.v])).toEqual([
      [new Date(2026, 9, 1).getTime(), 15],
      [nov1, 16],
    ]);
    expect(values(bucket(s, "month", "last"))).toEqual([8, 16]);
  });

  it("handles empty and single-point series and does not mutate its input", () => {
    expect(bucket(series([]), "week", "sum").points).toEqual([]);
    expect(bucket(series([{ t: wed, v: 3 }]), "month", "mean").points).toEqual([
      { t: new Date(2026, 9, 1).getTime(), v: 3, label: "1 point" },
    ]);
    expect(s.points).toHaveLength(5);
    expect(s.points[0].t).toBe(sunLate);
  });
});

// ---------------------------------------------------------------------------
// Demo data pass
// ---------------------------------------------------------------------------

describe("every metric over the demo data", () => {
  const NOW = new Date(2026, 10, 11, 12, 0);
  const demo = generateDemoData(NOW);
  const src: MetricSource = {
    // Newest first, as useCompletedWorkouts returns them.
    workouts: [...demo.workouts].reverse(),
    e1rms: demo.estimated1RMs,
    bodyweight: demo.bodyweight,
    runs: [...demo.runs].reverse(),
    readiness: demo.readinessLogs,
    pain: demo.painEntries,
    liftStates: demo.liftStates,
    settings: DEFAULT_USER_PROFILE.settings,
  };

  function expectHealthy(s: Series) {
    expect(s.points.length).toBeGreaterThan(0);
    for (let i = 0; i < s.points.length; i++) {
      expect(Number.isFinite(s.points[i].v)).toBe(true);
      expect(Number.isFinite(s.points[i].t)).toBe(true);
      expect(s.points[i].t).toBeLessThanOrEqual(NOW.getTime());
      if (i > 0) expect(s.points[i].t).toBeGreaterThanOrEqual(s.points[i - 1].t);
    }
  }

  for (const exerciseId of ["squat", "bench", "deadlift", "ohp"]) {
    for (const id of ["e1rm", "workingWeight", "amrapReps", "avgRpe", "liftVolume"] as MetricId[]) {
      it(`${id} for ${exerciseId}`, () => {
        expectHealthy(computeMetric(id, src, { exerciseId }));
      });
    }
  }

  it("the lift series have the expected sizes", () => {
    expect(computeMetric("e1rm", src, { exerciseId: "squat" }).points).toHaveLength(6);
    expect(computeMetric("workingWeight", src, { exerciseId: "squat" }).points).toHaveLength(6);
    expect(computeMetric("amrapReps", src, { exerciseId: "squat" }).points).toHaveLength(6);
    // Home sessions plot at the barbell-equivalent weight, so T1 squat never dips.
    const t1 = computeMetric("workingWeight", src, { exerciseId: "squat" }).points.filter((p) =>
      p.label?.startsWith("T1")
    );
    for (let i = 1; i < t1.length; i++) expect(t1[i].v).toBeGreaterThan(t1[i - 1].v);
  });

  for (const muscleGroup of MUSCLE_GROUP_ORDER) {
    it(`weeklySets for ${muscleGroup}`, () => {
      expectHealthy(computeMetric("weeklySets", src, { muscleGroup }));
    });
  }

  it("weeklySets has real volume for the trained groups", () => {
    for (const muscleGroup of ["Chest", "Back", "Quads", "Shoulders"]) {
      const s = computeMetric("weeklySets", src, { muscleGroup });
      expect(Math.max(...values(s))).toBeGreaterThan(0);
    }
  });

  for (const id of [
    "bodyweight",
    "bodyweight7d",
    "lossRate",
    "sessionsPerWeek",
    "tonnage",
    "runDistance",
    "runDuration",
    "runPace",
    "runEffort",
    "sleep",
    "stress",
  ] as MetricId[]) {
    it(id, () => {
      expectHealthy(computeMetric(id, src));
    });
  }

  it("the global series have the expected sizes and directions", () => {
    expect(computeMetric("bodyweight", src).points).toHaveLength(demo.bodyweight.length);
    expect(computeMetric("bodyweight", src).better).toBe("down");
    expect(computeMetric("runDuration", src).points).toHaveLength(6);
    expect(computeMetric("runDistance", src).points).toHaveLength(5);
    expect(computeMetric("runPace", src).points).toHaveLength(5);
    expect(computeMetric("sleep", src).points).toHaveLength(demo.readinessLogs.length);
    const sessions = computeMetric("sessionsPerWeek", src);
    expect(values(sessions).reduce((a, b) => a + b, 0)).toBe(24);
    const loss = computeMetric("lossRate", src);
    expect(loss.points.length).toBeGreaterThanOrEqual(6);
    for (const p of loss.points) expect(p.v).toBeLessThan(0);
    const summary = summarize(inRange(computeMetric("bodyweight7d", src), "4w", NOW.getTime()));
    expect(summary.change).toBeLessThan(0);
  });

  it("does not mutate the source", () => {
    const before = JSON.stringify(src);
    for (const id of ALL_IDS) computeMetric(id, src, { exerciseId: "squat", muscleGroup: "Quads" });
    expect(JSON.stringify(src)).toBe(before);
  });
});
