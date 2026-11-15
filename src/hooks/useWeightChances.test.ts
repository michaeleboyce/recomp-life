import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/local";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import { nextWorkoutFrom, readLedgerRecords } from "@/lib/data/forecasts";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { todayForecastFrom } from "./useTodayForecast";
import { weightChancesFrom } from "./useWeightChances";

beforeEach(clearDb);

async function seedDemo() {
  const demo = generateDemoData(new Date());
  await db.workouts.bulkPut(demo.workouts);
  await db.estimated1RMs.bulkPut(demo.estimated1RMs);
  await db.liftStates.bulkPut(demo.liftStates);
  await db.userProfile.put(makeProfile());
}

describe("weightChancesFrom", () => {
  it("gives the plan the same chance Today shows, and a chance for each other weight", async () => {
    await seedDemo();
    const records = await readLedgerRecords();
    const t1 = nextWorkoutFrom(records, "gym").plan.find((e) => e.tier === "T1" && !e.isWarmUp)!;
    const today = todayForecastFrom(records, "gym");
    expect(today.newBest).not.toBeNull();

    const weights = [t1.weight - 10, t1.weight, t1.weight + 10];
    const chances = weightChancesFrom(records, {
      exerciseId: t1.exerciseId,
      tier: "T1",
      weights,
      location: "gym",
    });
    expect(chances.get(t1.weight)).toBeCloseTo(today.newBest!.probability!, 10);
    for (const weight of weights) {
      const chance = chances.get(weight);
      expect(chance).toBeGreaterThanOrEqual(0);
      expect(chance).toBeLessThanOrEqual(1);
    }
  });

  it("gives no chance for a lift that is not a main lift or has no best", async () => {
    const records = await readLedgerRecords();
    const plan = nextWorkoutFrom(records, "gym").plan;
    const t2 = plan.find((e) => e.tier === "T2" && !e.isWarmUp)!;
    expect(
      weightChancesFrom(records, { exerciseId: t2.exerciseId, tier: "T2", weights: [t2.weight] }).size
    ).toBe(0);
    const t1 = plan.find((e) => e.tier === "T1" && !e.isWarmUp)!;
    expect(
      weightChancesFrom(records, { exerciseId: t1.exerciseId, tier: "T1", weights: [t1.weight] }).size
    ).toBe(0);
  });
});
