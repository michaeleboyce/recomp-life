import { describe, expect, it } from "vitest";
import { DAY_MS } from "@/lib/dates";
import { weekStartMs } from "@/lib/metrics/helpers";
import { STRENGTH_POOLING, TARGET_EVIDENCE } from "./coefficients";
import { muscleStrengthIndex } from "./muscleIndex";
import { pooledLiftEstimate } from "./pooled";
import { day, set, t1Session } from "./testHelpers";
import {
  TREND_SMOOTHING,
  gridTimes,
  muscleTimeline,
  pointWeightAt,
  sharesAt,
  smoothedEstimate,
  strengthTimeline,
  sumLines,
  weeklyShares,
} from "./timeline";
import type { StrengthSet } from "./types";

const NOW = (n: number) => day(n).getTime();
const standard = { halfLifeDays: TREND_SMOOTHING.standard };

function bench(sessionId: string, d: number, weight: number, amrapReps = 5): StrengthSet[] {
  return t1Session({ sessionId, exerciseId: "bench", weight, amrapReps, day: d });
}
function dbBench(sessionId: string, d: number, perHand: number, amrapReps = 8): StrengthSet[] {
  return t1Session({ sessionId, exerciseId: "db_bench", weight: perHand, perHand: true, amrapReps, day: d });
}
const asImported = (sets: StrengthSet[]) => sets.map((s) => ({ ...s, imported: true as const }));

describe("TREND_SMOOTHING", () => {
  it("is light, the planner's half-life, heavy", () => {
    expect(TREND_SMOOTHING.standard).toBe(STRENGTH_POOLING.evidenceHalfLifeDays);
    expect(TREND_SMOOTHING.light).toBeLessThan(TREND_SMOOTHING.standard);
    expect(TREND_SMOOTHING.heavy).toBeGreaterThan(TREND_SMOOTHING.standard);
  });
});

describe("strengthTimeline (M1)", () => {
  it("lists the lift's own, imported and related sessions by source, oldest first", () => {
    const sets = [
      ...asImported(bench("imp1", 0, 180)),
      ...bench("w1", 10, 185),
      ...dbBench("h1", 14, 70),
    ];
    const tl = strengthTimeline("bench", sets, { now: NOW(20) });
    expect(tl.unit).toBe("lbs");
    expect(tl.points.map((p) => [p.sessionId, p.sourceId, p.imported])).toEqual([
      ["imp1", "imported", true],
      ["w1", "own", false],
      ["h1", "db_bench", false],
    ]);
    expect(tl.sources.map((s) => s.id)).toEqual(["own", "imported", "db_bench"]);
  });

  it("translates a related session through its ratio, with the pair count when learned", () => {
    const sets = [...bench("w1", 0, 185), ...dbBench("h1", 3, 70)];
    const tl = strengthTimeline("bench", sets, { now: NOW(5) });
    const source = tl.sources.find((s) => s.id === "db_bench")!;
    expect(source.ratio!.basis).toBe("learned");
    expect(source.ratio!.pairs).toBe(1);
    const h1 = tl.points.find((p) => p.sessionId === "h1")!;
    expect(h1.value).toBeCloseTo(h1.strength / source.ratio!.ratio, 9);
    expect(h1.weight).toBe(STRENGTH_POOLING.transferWeight);
    // Total load: both dumbbells.
    expect(h1.bestSet.load).toBe(140);
  });

  it("uses the starting ratio for a related exercise without pairs", () => {
    const sets = [...bench("w1", 0, 185), ...dbBench("h1", 40, 70)];
    const source = strengthTimeline("bench", sets, { now: NOW(41) }).sources.find((s) => s.id === "db_bench")!;
    expect(source.ratio!.basis).toBe("prior");
    expect(source.ratio!.pairs).toBe(0);
  });

  it("gives each dot today's weight: source weight halving per standard half-life", () => {
    const sets = [...bench("w1", 0, 185), ...dbBench("h1", 14, 70)];
    const tl = strengthTimeline("bench", sets, { now: NOW(28) });
    const [own, home] = tl.points;
    expect(own.weightToday).toBeCloseTo(0.25, 3);
    expect(home.weightToday).toBeCloseTo(STRENGTH_POOLING.transferWeight * 0.5, 3);
  });

  it("keeps a hand-set target as a ring until the exercise is next logged", () => {
    const target = set({
      id: "t1",
      sessionId: "target:db_bench",
      exerciseId: "db_bench",
      weight: 75,
      perHand: true,
      reps: 8,
      date: day(5),
      provisional: true,
    });
    const sets = [...bench("w1", 0, 185), target, ...dbBench("h1", 9, 70)];
    const tl = strengthTimeline("bench", sets, { now: NOW(12) });
    const ring = tl.points.find((p) => p.provisional)!;
    expect(ring.weight).toBeCloseTo(STRENGTH_POOLING.transferWeight * TARGET_EVIDENCE.weight, 9);
    expect(ring.until).toBe(tl.points.find((p) => p.sessionId === "h1")!.t);
    expect(ring.weightToday).toBe(0);
    expect(pointWeightAt(ring, NOW(7), 14).expired).toBe(false);
    expect(pointWeightAt(ring, NOW(12), 14).expired).toBe(true);
  });

  it("puts a session with drops at its strength, the planner's value", () => {
    const sets = [
      ...bench("w1", 0, 185),
      set({ id: "d1", sessionId: "w1", exerciseId: "bench", weight: 135, reps: 8, role: "drop", dropOf: "w1:bench:4", date: day(0, 20) }),
    ];
    const [p] = strengthTimeline("bench", sets, { now: NOW(1) }).points;
    expect(p.dropsCounted).toBe(1);
    expect(p.value).toBe(p.strength);
    expect(p.value).not.toBe(p.estimatedMax);
  });

  it("anchors on the planner's estimate", () => {
    const sets = [...bench("w1", 0, 185), ...dbBench("h1", 3, 70)];
    const tl = strengthTimeline("bench", sets, { now: NOW(5) });
    expect(tl.anchor!.value).toBe(pooledLiftEstimate("bench", sets)!.value);
  });

  it("is empty with no sets", () => {
    const tl = strengthTimeline("bench", [], { now: NOW(0) });
    expect(tl.points).toEqual([]);
    expect(tl.anchor).toBeNull();
    expect(smoothedEstimate(tl, standard).points).toEqual([]);
  });
});

describe("smoothedEstimate (M2)", () => {
  it("equals the one session with only the lift's own session", () => {
    const sets = bench("w1", 0, 185);
    const tl = strengthTimeline("bench", sets, { now: NOW(30) });
    const line = smoothedEstimate(tl, standard);
    for (const p of line.points) expect(p.v).toBeCloseTo(tl.points[0].value, 9);
    expect(line.today!.t).toBe(NOW(30));
    expect(line.reason).toEqual({ kind: "match" });
  });

  it("equals the planner's estimate and range on the planner's own evidence", () => {
    const sets = [...bench("w1", 0, 185), ...dbBench("h1", 3, 70), ...dbBench("h2", 6, 72)];
    const tl = strengthTimeline("bench", sets, { now: NOW(9) });
    const pooled = pooledLiftEstimate("bench", sets)!;
    const today = smoothedEstimate(tl, standard).today!;
    expect(Math.round(today.v)).toBe(pooled.value);
    expect(Math.round((today.high - today.v) * 10) / 10).toBe(pooled.sd);
  });

  it("explains the difference when older sessions of the lift are still in the line", () => {
    const sets = [...bench("w1", 0, 150), ...bench("w2", 3, 155), ...bench("w3", 6, 200)];
    const tl = strengthTimeline("bench", sets, { now: NOW(7) });
    const line = smoothedEstimate(tl, standard);
    expect(Math.round(line.today!.v)).toBeLessThan(tl.anchor!.value);
    expect(line.reason).toMatchObject({ kind: "older-sessions", ownBefore: 2, relatedBefore: 0, anchor: tl.anchor!.value });
  });

  it("says the settings differ from the planner's when smoothing or sources change", () => {
    const sets = [...bench("w1", 0, 185), ...dbBench("h1", 3, 70)];
    const tl = strengthTimeline("bench", sets, { now: NOW(5) });
    expect(smoothedEstimate(tl, { halfLifeDays: TREND_SMOOTHING.light }).reason).toEqual({ kind: "display" });
    expect(smoothedEstimate(tl, { ...standard, sources: ["own"] }).reason).toEqual({ kind: "display" });
  });

  it("redraws without a source switched off", () => {
    const sets = [...bench("w1", 0, 185), ...dbBench("h1", 3, 90)];
    const tl = strengthTimeline("bench", sets, { now: NOW(5) });
    const own = smoothedEstimate(tl, { ...standard, sources: ["own"] }).today!;
    expect(own.v).toBeCloseTo(tl.points[0].value, 9);
    expect(smoothedEstimate(tl, standard).today!.v).not.toBeCloseTo(own.v, 3);
  });

  it("puts the grid on whole days back from now, starting at the first dot", () => {
    const times = gridTimes(NOW(0) + 3600_000, NOW(3));
    expect(times[0]).toBe(NOW(0) + 3600_000);
    expect(times.slice(1)).toEqual([NOW(1), NOW(2), NOW(3)]);
    expect(gridTimes(NOW(0), NOW(10), 5)).toEqual([NOW(0), NOW(5), NOW(10)]);
  });

  it("drops a target from the line when the exercise is logged", () => {
    const target = set({
      id: "t1",
      sessionId: "target:db_bench",
      exerciseId: "db_bench",
      weight: 100,
      perHand: true,
      reps: 8,
      date: day(2),
      provisional: true,
    });
    const sets = [...bench("w1", 0, 185), target, ...dbBench("h1", 6, 70)];
    const tl = strengthTimeline("bench", sets, { now: NOW(8) });
    const line = smoothedEstimate(tl, standard);
    const before = line.points.find((p) => p.t === NOW(4))!;
    expect(before.v).toBeGreaterThan(tl.points[0].value);
    // After h1: only w1 and h1 count.
    const withoutTarget = smoothedEstimate(
      strengthTimeline("bench", [...bench("w1", 0, 185), ...dbBench("h1", 6, 70)], { now: NOW(8) }),
      standard
    ).today!;
    expect(line.today!.v).toBeCloseTo(withoutTarget.v, 6);
  });

  it("stays inside the range of the dots it averages (property)", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let trial = 0; trial < 25; trial++) {
      const sets: StrengthSet[] = [];
      let d = 0;
      for (let i = 0; i < 12; i++) {
        d += 1 + Math.floor(rand() * 10);
        if (rand() < 0.6) sets.push(...bench(`b${trial}-${i}`, d, 150 + Math.round(rand() * 60)));
        else sets.push(...dbBench(`h${trial}-${i}`, d, 50 + Math.round(rand() * 30)));
      }
      const tl = strengthTimeline("bench", sets, { now: NOW(d + 20) });
      const values = tl.points.map((p) => p.value);
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      for (const key of ["light", "standard", "heavy"] as const) {
        for (const p of smoothedEstimate(tl, { halfLifeDays: TREND_SMOOTHING[key] }).points) {
          expect(p.v).toBeGreaterThanOrEqual(lo - 1e-9);
          expect(p.v).toBeLessThanOrEqual(hi + 1e-9);
        }
      }
    }
  });
});

describe("sharesAt", () => {
  it("splits today's weight between dots", () => {
    const sets = [...bench("w1", 0, 185), ...dbBench("h1", 0, 70)];
    const tl = strengthTimeline("bench", sets, { now: NOW(1) });
    const shares = sharesAt(tl, NOW(1), standard);
    const own = shares.get(tl.points.find((p) => p.sourceId === "own")!.id)!;
    expect(own).toBeCloseTo(1 / (1 + STRENGTH_POOLING.transferWeight), 6);
  });
});

describe("weeklyShares (M3)", () => {
  it("sums to 1 every week and carries the last shares through a week with no session", () => {
    const sets = [...bench("w1", 0, 185), ...dbBench("h1", 2, 70), ...bench("w2", 30, 190)];
    const tl = strengthTimeline("bench", sets, { now: NOW(40) });
    const weeks = weeklyShares(tl, standard);
    expect(weeks[0].weekStart).toBe(weekStartMs(NOW(0)));
    for (const w of weeks) {
      expect(Object.values(w.shares).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 9);
    }
    // Weeks between day 2 and day 30 have no session: their shares stay put.
    const quiet = weeks.filter((w) => w.weekStart > NOW(9) && w.weekStart + 7 * DAY_MS < NOW(30));
    expect(quiet.length).toBeGreaterThan(1);
    for (const w of quiet) {
      expect(w.shares.db_bench).toBeCloseTo(quiet[0].shares.db_bench, 9);
      expect(w.shares.own).toBeCloseTo(quiet[0].shares.own, 9);
    }
    // The lift's new session takes back most of the weight.
    expect(weeks[weeks.length - 1].shares.own).toBeGreaterThan(quiet[0].shares.own);
  });
});

describe("muscleTimeline (M10)", () => {
  const BSS = "bulgarian_split_squat";
  const sets = [
    ...[0, 3, 6].flatMap((d, i) =>
      t1Session({ sessionId: `g${i}`, exerciseId: "squat", weight: 200 + 10 * i, amrapReps: 5, day: d })
    ),
    // A home exercise joins later.
    ...[9, 12].flatMap((d, i) =>
      t1Session({ sessionId: `h${i}`, exerciseId: BSS, weight: 50 + 5 * i, perHand: true, amrapReps: 8, day: d })
    ),
    // An imported leg press.
    ...asImported(
      t1Session({ sessionId: "imp", exerciseId: "leg_press", weight: 300, amrapReps: 8, day: 4 })
    ),
  ];

  it("has a source per exercise, each dot at the relative the index gave it, and the index as anchor", () => {
    const index = muscleStrengthIndex(sets);
    const tl = muscleTimeline("quads", index, sets, { now: NOW(14) });
    expect(tl.unit).toBe("index");
    expect(tl.sources.map((s) => s.id)).toContain("squat");
    expect(tl.sources.map((s) => s.id)).toContain(BSS);
    const readings = index.quads!;
    expect(tl.anchor!.value).toBe(readings[readings.length - 1].index);
    const joined = tl.points.find((p) => p.sessionId === "h0")!;
    // A joining exercise comes in at the trend's level.
    expect(joined.value).toBeCloseTo(readings.find((r) => r.date.getTime() === joined.t)!.index, 0);
    if (tl.points.some((p) => p.exerciseId === "leg_press")) {
      expect(tl.points.find((p) => p.exerciseId === "leg_press")!.imported).toBe(true);
    }
  });

  it("first reading is the base and the line stays inside the dots", () => {
    const tl = muscleTimeline("quads", muscleStrengthIndex(sets), sets, { now: NOW(14) });
    const line = smoothedEstimate(tl, standard);
    expect(line.points[0].v).toBeCloseTo(tl.points[0].value, 9);
    const values = tl.points.map((p) => p.value);
    for (const p of line.points) {
      expect(p.v).toBeGreaterThanOrEqual(Math.min(...values) - 1e-9);
      expect(p.v).toBeLessThanOrEqual(Math.max(...values) + 1e-9);
    }
    expect(["match", "muscle-latest"]).toContain(line.reason!.kind);
  });
});

describe("sumLines", () => {
  it("adds each line's latest value from the instant all have started", () => {
    const a = [{ t: 1, v: 10, low: 0, high: 0 }, { t: 3, v: 12, low: 0, high: 0 }];
    const b = [{ t: 2, v: 5, low: 0, high: 0 }, { t: 4, v: 6, low: 0, high: 0 }];
    expect(sumLines([a, b])).toEqual([
      { t: 2, v: 15 },
      { t: 3, v: 17 },
      { t: 4, v: 18 },
    ]);
    expect(sumLines([a, []])).toEqual([]);
  });
});
