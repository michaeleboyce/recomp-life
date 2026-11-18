import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb } from "@/lib/data/testUtils";
import { importDay, makeImportedSession, makeImportedSet } from "@/lib/import/testRecords";
import { useMuscleStrength } from "./index";

beforeEach(clearDb);

// Made-up history only.

describe("useMuscleStrength", () => {
  it("reads imported sessions too, as the strength evidence is documented to", async () => {
    await db.importedSessions.bulkPut([
      makeImportedSession([makeImportedSet({ weightPerImplementLb: 185, reps: 5 })], { id: "imp-a", startedAt: importDay(0) }),
      makeImportedSession([makeImportedSet({ weightPerImplementLb: 195, reps: 5 })], { id: "imp-b", startedAt: importDay(7) }),
    ]);
    const r = renderHook(() => useMuscleStrength());
    // No workout is logged: every point comes from the imported squats.
    await waitFor(() => expect(r.result.current?.quads?.length ?? 0).toBeGreaterThan(0));
    expect(await db.workouts.count()).toBe(0);
  });
});
