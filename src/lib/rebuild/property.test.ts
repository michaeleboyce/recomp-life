// E2: finishing a workout incrementally and rebuilding from the log give the same lift
// states, after every workout of a random log.
import { describe, expect, it } from "vitest";
import { roundToNearest5 } from "@/lib/progression";
import { SETTINGS } from "@/lib/workout/testFixtures";
import type { UserSettings } from "@/types";
import { diffDerived, rebuildDerived } from "./index";
import {
  type Sim,
  type TierOutcome,
  adjust,
  nextStart,
  progressionView,
  rebuildInput,
  runSession,
  startSim,
} from "./testHelpers";

/** mulberry32: a small seeded generator, so a failing seed can be replayed. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SESSIONS = 40;
const SEEDS = [1, 2, 3, 7, 42, 2026, 90210, 123456789];

function randomRpe(rand: () => number): number | null {
  return rand() < 0.3 ? null : 6 + Math.floor(rand() * 9) / 2;
}

function randomOutcome(rand: () => number, tier: "T1" | "T2" | "T3"): TierOutcome {
  const roll = rand();
  const rpe = randomRpe(rand);
  if (tier === "T3") {
    if (roll < 0.1) return { sets: 1 + Math.floor(rand() * 2), rpe };
    return { lastReps: 12 + Math.floor(rand() * 17), rpe };
  }
  if (roll < 0.05) return { sets: 0 };
  if (roll < 0.17) return { sets: 1 + Math.floor(rand() * 2), rpe };
  if (roll < 0.42) {
    // A miss somewhere in the first three sets, or on the last one.
    if (rand() < 0.5) return { lastReps: -1, rpe };
    const reps: (number | undefined)[] = [];
    reps[Math.floor(rand() * 3)] = 0;
    return { reps, rpe };
  }
  if (tier === "T2" && roll < 0.55) return { drop: true, rpe };
  // A clean pass. The caller adds extra reps to a T1 AMRAP set.
  return { rpe };
}

function settingsAt(index: number): UserSettings {
  if (index < 12) return SETTINGS;
  if (index < 25) {
    return {
      ...SETTINGS,
      trainingPhase: { ...SETTINGS.trainingPhase, mode: "bulking" },
      equipment: { ...SETTINGS.equipment, gymBarbellIncrementLbs: 2.5 },
    };
  }
  return {
    ...SETTINGS,
    trainingPhase: { ...SETTINGS.trainingPhase, mode: "maintaining" },
    equipment: { ...SETTINGS.equipment, gymBarbellIncrementLbs: 10, dumbbellIncrementLbs: 2.5 },
  };
}

function simulate(seed: number, afterEach: (sim: Sim, index: number) => void): Sim {
  const rand = prng(seed);
  const sim = startSim();
  for (let i = 0; i < SESSIONS; i++) {
    sim.settings = settingsAt(i);

    // Now and then a weight is changed by hand before the workout.
    if (rand() < 0.12) {
      const lift = ["squat", "bench", "deadlift", "ohp"][Math.floor(rand() * 4)];
      const current = sim.states.find((ls) => ls.exerciseId === lift)!;
      const at = new Date(nextStart(sim).getTime() - 3_600_000);
      if (rand() < 0.5) {
        adjust(sim, lift, { t1Weight: roundToNearest5(current.t1Weight * 0.9) }, at);
      } else {
        adjust(sim, lift, { t2Weight: current.t2Weight + 10, t2Stage: "3x8", t2FailCount: 1 }, at);
      }
    }

    const t1 = randomOutcome(rand, "T1");
    // Extra reps on the AMRAP set of a clean T1 pass.
    const extra = Math.floor(rand() * 5);
    const cleanPass = t1.sets === undefined && t1.reps === undefined && t1.lastReps === undefined;
    const stageReps = { "5x3": 3, "6x2": 2, "10x1": 1 } as const;
    const template = (["A1", "B1", "A2", "B2"] as const)[i % 4];
    const t1Lift = { A1: "squat", B1: "ohp", A2: "bench", B2: "deadlift" }[template];
    const stage = sim.states.find((ls) => ls.exerciseId === t1Lift)!.t1Stage;

    runSession(sim, {
      location: rand() < 0.15 ? "home" : "gym",
      t1: cleanPass ? { ...t1, lastReps: stageReps[stage] + extra } : t1,
      t2: randomOutcome(rand, "T2"),
      t3: randomOutcome(rand, "T3"),
    });
    afterEach(sim, i);
  }
  return sim;
}

describe("finish equals rebuild (E2)", () => {
  it.each(SEEDS)("seed %i: every workout's incremental state equals a full rebuild", (seed) => {
    // The rebuild always runs with the latest settings: each workout must be replayed
    // with the context stored on it, not with these.
    const finalSettings = settingsAt(SESSIONS - 1);
    const sim = simulate(seed, (s, index) => {
      const result = rebuildDerived(rebuildInput(s, finalSettings));
      expect(progressionView(result.liftStates), `seed ${seed}, workout ${index + 1}`).toEqual(
        progressionView(s.states)
      );
      const last = s.workouts[s.workouts.length - 1];
      expect(progressionView(result.snapshots.get(last.id)!)).toEqual(progressionView(s.states));
      // The same estimates the live path wrote while logging.
      expect(result.e1rms.map((row) => [row.setId, row.exerciseId, row.estimated1RM, row.date])).toEqual(
        s.e1rms.map((row) => [row.id.replace("live-", ""), row.exerciseId, row.estimated1RM, row.date])
      );
    });
    expect(sim.workouts).toHaveLength(SESSIONS);
    expect(rebuildDerived(rebuildInput(sim)).snapshots.size).toBe(SESSIONS);
  });

  it("covers every kind of outcome across the seeds", () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const sim = simulate(seed, () => {});
      for (const w of sim.workouts) {
        seen.add(w.location);
        for (const set of w.sets) seen.add(set.status);
      }
      for (const ls of sim.states) {
        if (ls.t1LastResetWeight != null) seen.add("t1-reset");
        if (ls.t2LastResetWeight != null) seen.add("t2-reset");
      }
      if (sim.adjustments.some((a) => a.source === "manual")) seen.add("adjustment");
    }
    expect([...seen].sort()).toEqual(
      [
        "adjustment",
        "autoregulated_load_drop",
        "completed",
        "failed",
        "gym",
        "home",
        "t1-reset",
        "t2-reset",
      ].sort()
    );
  });

  it.each(SEEDS.slice(0, 3))("seed %i: rebuild is idempotent and leaves nothing to write", (seed) => {
    const sim = simulate(seed, () => {});
    const first = rebuildDerived(rebuildInput(sim));
    const second = rebuildDerived(rebuildInput(sim));
    expect(second).toEqual(first);
    expect([...second.snapshots.entries()]).toEqual([...first.snapshots.entries()]);

    const diff = diffDerived(first, second);
    expect(diff).toEqual({
      liftStatesToPut: [],
      liftStateIdsToDelete: [],
      e1rmsToPut: [],
      e1rmIdsToDelete: [],
      consistent: true,
    });

    // Input order does not matter either.
    const shuffled = rebuildDerived({
      ...rebuildInput(sim),
      workouts: [...sim.workouts].reverse(),
      adjustments: [...sim.adjustments].reverse(),
    });
    expect(shuffled).toEqual(first);
  });

  it("does not mutate its input", () => {
    const sim = simulate(5, () => {});
    const input = rebuildInput(sim);
    const before = JSON.stringify(input);
    rebuildDerived(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
