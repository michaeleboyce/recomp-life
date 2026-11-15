import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb } from "@/lib/data/testUtils";
import { writeForecasts } from "@/lib/data/forecasts";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { PERSONAL_MIN_GROUP_SIZE } from "@/lib/evidence/personal";
import { constructedHistory } from "@/lib/evidence/personal/testHelpers";
import { usePersonalEvidence } from "./index";

beforeEach(clearDb);

async function seed(log: ReturnType<typeof constructedHistory>) {
  await db.workouts.bulkPut(log.workouts);
  await writeForecasts(log.forecasts);
  await db.readinessLogs.bulkPut(log.readinessLogs);
  await db.runs.bulkPut(log.runs);
  await db.activities.bulkPut(log.activities);
}

describe("usePersonalEvidence", () => {
  it("is null at once for a rule with no card", () => {
    const { result } = renderHook(() => usePersonalEvidence("rest-light"));
    expect(result.current).toBeNull();
  });

  it("asks for the minimum in each group on an empty database", async () => {
    const { result } = renderHook(() => usePersonalEvidence("readiness"));
    await waitFor(() => expect(result.current).toBeTruthy());
    expect(result.current!.result).toBeNull();
    expect(result.current!.needed).toEqual({
      exposed: PERSONAL_MIN_GROUP_SIZE,
      reference: PERSONAL_MIN_GROUP_SIZE,
    });
  });

  it("reads the log and compares it, for each of the three rules", async () => {
    await seed(constructedHistory(new Date()));
    for (const id of ["rest-heavy", "run-interference", "readiness"] as const) {
      const { result, unmount } = renderHook(() => usePersonalEvidence(id));
      await waitFor(() => expect(result.current?.result).toBeTruthy());
      expect(result.current!.ruleId).toBe(id);
      expect(result.current!.result!.verdict).toBe("agrees");
      unmount();
    }
  });

  it("leaves out deleted workouts", async () => {
    const log = constructedHistory(new Date());
    await seed({ ...log, workouts: log.workouts.map((w) => ({ ...w, deletedAt: 1 })) });
    const { result } = renderHook(() => usePersonalEvidence("readiness"));
    await waitFor(() => expect(result.current).toBeTruthy());
    expect(result.current!.exposed.count + result.current!.reference.count).toBe(0);
  });

  it("works on the demo history", async () => {
    const demo = generateDemoData(new Date());
    await seed({ ...demo, forecasts: [], activities: [] });
    const { result } = renderHook(() => usePersonalEvidence("readiness"));
    await waitFor(() => expect(result.current).toBeTruthy());
    expect(result.current!.exposed.count + result.current!.reference.count).toBeGreaterThan(0);
  });
});
