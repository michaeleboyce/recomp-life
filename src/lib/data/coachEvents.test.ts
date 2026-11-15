import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/local";
import { listCoachEvents, recordCoachEvent } from "./coachEvents";
import { clearDb } from "./testUtils";

beforeEach(clearDb);

describe("coach events", () => {
  it("stores an unsynced, stamped row with a client id", async () => {
    const event = await recordCoachEvent(
      { kind: "settingsChange", title: "Phase", detail: "Cutting to maintaining", ruleId: "r1", data: { from: "cut" } },
      7000
    );
    expect(event.clientId).toBe(event.id);
    expect(event).toMatchObject({ updatedAt: 7000, deletedAt: null, synced: false, at: new Date(7000) });
    expect(await db.coachEvents.get(event.id)).toEqual(event);
  });

  it("leaves optional fields absent when not given", async () => {
    const event = await recordCoachEvent({ kind: "advisoryDismissed", title: "t", detail: "d" });
    expect("ruleId" in event).toBe(false);
    expect("data" in event).toBe(false);
  });

  it("lists live events newest first", async () => {
    await recordCoachEvent({ kind: "settingsChange", title: "old", detail: "", at: new Date("2026-11-01") });
    await recordCoachEvent({ kind: "settingsChange", title: "new", detail: "", at: new Date("2026-11-10") });
    const gone = await recordCoachEvent({ kind: "settingsChange", title: "gone", detail: "", at: new Date("2026-11-12") });
    await db.coachEvents.update(gone.id, { deletedAt: 1 });
    expect((await listCoachEvents()).map((e) => e.title)).toEqual(["new", "old"]);
  });
});
