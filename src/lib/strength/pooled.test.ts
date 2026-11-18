import { describe, it, expect } from "vitest";
import { calculateE1RM } from "@/lib/e1rm";
import { e1rmsForWorkout, sortE1RMs } from "@/lib/rebuild/e1rm";
import type { RepsInReserve, SetLog, Tier, WorkoutSession } from "@/types";
import { STRENGTH_POOLING, TARGET_EVIDENCE, TRANSFER_PRIORS } from "./coefficients";
import { sessionEstimates, targetEstimates } from "./estimate";
import { pooledLiftEstimate } from "./pooled";
import { learnTransferRatio } from "./ratio";
import { day, makeStrengthSet, makeT1Session } from "./testHelpers";
import type { StrengthSet, TransferRatio } from "./types";

// ---------------------------------------------------------------------------
// H4: with barbell-only history the pooled estimate is what the app shows today
// ---------------------------------------------------------------------------

/** A stored set, as the app logs it today. */
function logged(
  workoutId: string,
  n: number,
  exerciseId: string,
  tier: Tier,
  weight: number,
  targetReps: number,
  actualReps: number,
  isAMRAP: boolean,
  dayIndex: number,
  repsInReserve?: RepsInReserve
): SetLog {
  return {
    id: `${workoutId}-${n}`,
    clientId: `${workoutId}-${n}`,
    exerciseId,
    tier,
    setNumber: n,
    targetReps,
    actualReps,
    weight,
    isAMRAP,
    completedAt: day(dayIndex, n),
    restAfterSeconds: 120,
    status: actualReps >= targetReps ? "completed" : "failed",
    isSubstituted: false,
    repsInReserve,
    location: "gym",
    synced: true,
  };
}

/** How the wiring package will map a stored barbell set onto the model's input. */
function toStrengthSet(workoutId: string, s: SetLog): StrengthSet {
  return {
    id: s.id,
    sessionId: workoutId,
    exerciseId: s.substituteExerciseId || s.exerciseId,
    weight: s.weight,
    perHand: false,
    reps: s.actualReps,
    repsInReserve: s.repsInReserve ?? null,
    role: s.tier === "warmup" ? "warmup" : "working",
    tier: s.tier,
    isAMRAP: s.isAMRAP,
    date: s.completedAt,
  };
}

/** Twelve weeks of a barbell-only GZCLP log with the awkward cases in it. */
function barbellHistory(): WorkoutSession[] {
  const workouts: WorkoutSession[] = [];
  const add = (id: string, dayIndex: number, sets: SetLog[]) =>
    workouts.push({ id, startedAt: day(dayIndex), completedAt: day(dayIndex, 60), sets } as unknown as WorkoutSession);
  let squat = 185;
  let bench = 135;
  for (let week = 0; week < 12; week++) {
    const d = week * 7;
    const reps = 3 + ((week * 5) % 6); // 3..8 on the last set
    const sets: SetLog[] = [
      logged(`a${week}`, 0, "squat", "warmup", 95, 5, 5, false, d),
      ...[1, 2, 3, 4].map((n) => logged(`a${week}`, n, "squat", "T1", squat, 3, 3, false, d)),
      // Week 4 logs reps left; week 7 fails the last set with 2 reps; week 9 grinds 1 rep.
      logged(
        `a${week}`,
        5,
        "squat",
        "T1",
        squat,
        3,
        week === 7 ? 2 : week === 9 ? 1 : reps,
        true,
        d,
        week === 4 ? "1-2" : undefined
      ),
      ...[6, 7, 8].map((n) => logged(`a${week}`, n, "bench", "T2", bench - 30, 10, 10, false, d)),
      ...[9, 10].map((n) => logged(`a${week}`, n, "lat_pulldown", "T3", 100, 15, 15, false, d)),
      logged(`a${week}`, 11, "lat_pulldown", "T3", 100, 15, 22, true, d),
    ];
    add(`a${week}`, d, sets);
    const benchSets = [
      ...[0, 1, 2, 3].map((n) => logged(`b${week}`, n, "bench", "T1", bench, 3, 3, false, d + 3)),
      logged(`b${week}`, 4, "bench", "T1", bench, 3, 12 - reps, true, d + 3, week === 2 ? "1-2" : undefined),
      // A T2 squat day with reps left logged: not an estimate today, so not one here.
      ...[5, 6, 7].map((n) => logged(`b${week}`, n, "squat", "T2", squat - 50, 10, 10, false, d + 3, "1-2")),
    ];
    add(`b${week}`, d + 3, benchSets);
    squat += 10;
    bench += 5;
  }
  return workouts;
}

describe("H4: pooled estimate with barbell-only history", () => {
  it("equals the app's latest estimated 1RM for each lift, after every workout", () => {
    const history = barbellHistory();
    for (let k = 1; k <= history.length; k++) {
      const prefix = history.slice(0, k);
      const rows = sortE1RMs(prefix.flatMap(e1rmsForWorkout));
      const sets = prefix.flatMap((w) => w.sets.map((s) => toStrengthSet(w.id, s)));
      for (const lift of ["squat", "bench", "lat_pulldown"]) {
        const liftRows = rows.filter((r) => r.exerciseId === lift);
        const pooled = pooledLiftEstimate(lift, sets);
        if (liftRows.length === 0) {
          expect(pooled, `${lift} after ${k}`).toBeNull();
          continue;
        }
        const latest = liftRows[liftRows.length - 1];
        expect(pooled?.value, `${lift} after ${k} workouts`).toBe(latest.estimated1RM);
        expect(pooled?.basis).toBe("own");
        expect(pooled?.related).toEqual([]);
      }
    }
  });

  it("uses the logged effort, the reps cap and the T1 rule exactly as the stored rows do", () => {
    const history = barbellHistory();
    const sets = history.flatMap((w) => w.sets.map((s) => toStrengthSet(w.id, s)));
    // Week 9 squat logged 1 rep: no row, so week 8 stands until week 10.
    const upToWeek9 = history.slice(0, 20);
    const rows = sortE1RMs(upToWeek9.flatMap(e1rmsForWorkout)).filter((r) => r.exerciseId === "squat");
    expect(rows[rows.length - 1].workoutSessionId).toBe("a8");
    expect(pooledLiftEstimate("squat", upToWeek9.flatMap((w) => w.sets.map((s) => toStrengthSet(w.id, s))))?.own?.sessionId).toBe("a8");
    expect(pooledLiftEstimate("squat", sets)?.own?.sessionId).toBe("a11");
  });
});

// ---------------------------------------------------------------------------
// Pooling home sessions
// ---------------------------------------------------------------------------

const BSS = "bulgarian_split_squat";

function fixedRatio(ratio: number, logSd = 0.05, pairs = 4): TransferRatio {
  return {
    liftId: "squat",
    exerciseId: BSS,
    ratio,
    sd: ratio * logSd,
    logSd,
    pairs,
    prior: TRANSFER_PRIORS.squat.bulgarian_split_squat.ratio,
    grade: "limited",
    basis: "learned",
    pairList: [],
  };
}

/** A gym squat on day 0 (e1RM 240), then home BSS sessions. */
function gymThenHome(homeDays: number[], homeLoadTotal: number): StrengthSet[] {
  return [
    ...makeT1Session({ sessionId: "gym", exerciseId: "squat", weight: 200, amrapReps: 6, day: 0 }),
    ...homeDays.flatMap((d, i) =>
      makeT1Session({
        sessionId: `home${i}`,
        exerciseId: BSS,
        weight: homeLoadTotal / 2,
        perHand: true,
        amrapReps: 8,
        day: d,
      })
    ),
  ];
}

describe("pooledLiftEstimate with home sessions", () => {
  const gymMax = calculateE1RM(200, 6)!; // 240
  const homeMax = calculateE1RM(130, 8)!; // 165 total

  it("translates home sessions through the ratio and down-weights them", () => {
    const ratio = fixedRatio(0.5);
    const pooled = pooledLiftEstimate("squat", gymThenHome([2], 130), { ratios: { [BSS]: ratio } })!;
    const liftEquivalent = homeMax / 0.5; // 330
    const decay = 0.5 ** (2 / STRENGTH_POOLING.evidenceHalfLifeDays);
    const w = STRENGTH_POOLING.transferWeight;
    expect(pooled.basis).toBe("pooled");
    expect(pooled.related).toHaveLength(1);
    expect(pooled.related[0].liftEquivalent).toBeCloseTo(liftEquivalent, 6);
    expect(pooled.related[0].weight).toBeCloseTo(w, 6);
    expect(pooled.ownWeight).toBeCloseTo(decay, 6);
    expect(pooled.value).toBe(Math.round((decay * gymMax + w * liftEquivalent) / (decay + w)));
  });

  it("lets a run of home sessions move the estimate more than one", () => {
    const ratio = { [BSS]: fixedRatio(0.6) };
    const one = pooledLiftEstimate("squat", gymThenHome([3], 130), { ratios: ratio })!;
    const four = pooledLiftEstimate("squat", gymThenHome([3, 6, 9, 12], 130), { ratios: ratio })!;
    expect(one.value).toBeGreaterThan(gymMax);
    expect(four.value).toBeGreaterThan(one.value);
    expect(four.value).toBeLessThan(homeMax / 0.6);
  });

  it("ignores home sessions before the latest barbell session, and in the same workout", () => {
    const sets = [
      ...makeT1Session({ sessionId: "early", exerciseId: BSS, weight: 90, perHand: true, amrapReps: 8, day: -5 }),
      ...makeT1Session({ sessionId: "gym", exerciseId: "squat", weight: 200, amrapReps: 6, day: 0 }),
      ...makeT1Session({ sessionId: "gym", exerciseId: BSS, weight: 90, perHand: true, amrapReps: 8, day: 0 }).map((s) => ({
        ...s,
        date: day(0, 50),
      })),
    ];
    const pooled = pooledLiftEstimate("squat", sets, { ratios: { [BSS]: fixedRatio(0.5) } })!;
    expect(pooled.basis).toBe("own");
    expect(pooled.value).toBe(gymMax);
  });

  it("starts from home sessions alone when the lift has never been done", () => {
    const sets = gymThenHome([2, 4], 130).filter((s) => s.exerciseId === BSS);
    const pooled = pooledLiftEstimate("squat", sets, { ratios: { [BSS]: fixedRatio(0.5) } })!;
    expect(pooled.basis).toBe("related");
    expect(pooled.own).toBeNull();
    expect(pooled.value).toBe(Math.round(homeMax / 0.5));
  });

  it("is wider with home evidence than a barbell session alone, and wider still with an unsure ratio", () => {
    const own = pooledLiftEstimate("squat", gymThenHome([], 130))!;
    expect(own.sd).toBeCloseTo(gymMax * STRENGTH_POOLING.sessionSdFraction, 1);
    const homeOnly = (logSd: number) =>
      pooledLiftEstimate("squat", gymThenHome([2], 130).filter((s) => s.exerciseId === BSS), {
        ratios: { [BSS]: fixedRatio(0.5, logSd) },
      })!;
    const sure = homeOnly(0.03);
    const unsure = homeOnly(0.2);
    expect(sure.sd / sure.value).toBeGreaterThan(own.sd / own.value);
    expect(unsure.sd).toBeGreaterThan(sure.sd);
  });

  it("learns the ratio from the same sets by default", () => {
    const sets = gymThenHome([2], 130);
    const pooled = pooledLiftEstimate("squat", sets)!;
    const learned = learnTransferRatio("squat", BSS, sets)!;
    expect(pooled.related[0].ratio.ratio).toBeCloseTo(learned.ratio, 10);
    // The home session two days after the gym one forms a pair.
    expect(pooled.related[0].ratio.pairs).toBe(1);
  });

  it("only pools exercises that have a ratio for the lift", () => {
    const sets = [
      ...makeT1Session({ sessionId: "gym", exerciseId: "squat", weight: 200, amrapReps: 6, day: 0 }),
      ...makeT1Session({ sessionId: "home", exerciseId: "db_bench", weight: 50, perHand: true, amrapReps: 8, day: 2 }),
    ];
    expect(pooledLiftEstimate("squat", sets)?.basis).toBe("own");
  });

  it("returns null with no evidence and ignores drops-only sessions", () => {
    expect(pooledLiftEstimate("squat", [])).toBeNull();
    const dropOnly = [makeStrengthSet({ role: "drop", dropOf: "missing" })];
    expect(pooledLiftEstimate("squat", dropOnly)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A weight set by hand and not lifted yet: provisional evidence
// ---------------------------------------------------------------------------

describe("pooledLiftEstimate with a target set by hand", () => {
  const gym = () => makeT1Session({ sessionId: "gym", exerciseId: "squat", weight: 200, amrapReps: 6, day: 0 });
  const gymMax = calculateE1RM(200, 6)!;
  /** BSS 70 a hand for 3 reps, set by hand on day `d`. */
  const target = (d: number, weight = 70) =>
    makeStrengthSet({ id: `target-${d}`, sessionId: `target:${d}`, exerciseId: BSS, weight, perHand: true, reps: 3, date: day(d), provisional: true });
  const ratios = { [BSS]: fixedRatio(0.5) };

  it("counts at TARGET_EVIDENCE.weight of a logged home session", () => {
    const pooled = pooledLiftEstimate("squat", [...gym(), target(2)], { ratios })!;
    expect(pooled.related).toHaveLength(1);
    expect(pooled.related[0].provisional).toBe(true);
    expect(pooled.related[0].weight).toBeCloseTo(STRENGTH_POOLING.transferWeight * TARGET_EVIDENCE.weight, 6);
    const equivalent = calculateE1RM(140, 3)! / 0.5;
    expect(pooled.related[0].liftEquivalent).toBeCloseTo(equivalent, 6);
    expect(pooled.value).toBeGreaterThan(gymMax);
  });

  it("moves the estimate less than a logged session at the same weight and reps", () => {
    const fromTarget = pooledLiftEstimate("squat", [...gym(), target(2)], { ratios })!;
    const lifted = makeT1Session({ sessionId: "home", exerciseId: BSS, weight: 70, perHand: true, amrapReps: 3, day: 2 });
    const fromSession = pooledLiftEstimate("squat", [...gym(), ...lifted], { ratios })!;
    expect(fromTarget.value - gymMax).toBeGreaterThan(0);
    expect(fromTarget.value - gymMax).toBeLessThan(fromSession.value - gymMax);
  });

  it("stops counting once the exercise is logged after it", () => {
    const lifted = makeT1Session({ sessionId: "home", exerciseId: BSS, weight: 60, perHand: true, amrapReps: 5, day: 4 });
    const pooled = pooledLiftEstimate("squat", [...gym(), target(2), ...lifted], { ratios })!;
    expect(pooled.related.map((r) => r.sessionId)).toEqual(["home"]);
  });

  it("is ignored when older than the latest barbell session", () => {
    const later = makeT1Session({ sessionId: "gym2", exerciseId: "squat", weight: 205, amrapReps: 5, day: 5 });
    const pooled = pooledLiftEstimate("squat", [...gym(), target(2), ...later], { ratios })!;
    expect(pooled.basis).toBe("own");
  });

  it("never makes an estimated max or a ratio pair", () => {
    const sets = [...gym(), target(2)];
    expect(sessionEstimates(sets, BSS)).toEqual([]);
    expect(targetEstimates(sets, BSS)).toHaveLength(1);
    expect(learnTransferRatio("squat", BSS, sets)?.pairs).toBe(0);
  });
});
