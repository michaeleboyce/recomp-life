import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCoachEvents, useForecasts } from "./index";
import { writeForecasts } from "@/lib/data/forecasts";
import { recordCoachEvent } from "@/lib/data/coachEvents";
import { clearDb } from "@/lib/data/testUtils";
import type { Forecast } from "@/types";

beforeEach(clearDb);

const forecast = (id: string, madeAt: string): Forecast => ({
  id, clientId: id, slot: id, kind: "sessionLength", madeAt: new Date(madeAt), dueAt: new Date(madeAt),
  event: { type: "durationSeconds" }, prediction: { point: 3000, unit: "s" }, basis: "prior",
  inputs: {}, modelVersion: "t", updatedAt: 0, deletedAt: null, synced: false,
});

describe("useForecasts and useCoachEvents", () => {
  it("return rows live, forecasts oldest first and events newest first", async () => {
    const forecasts = renderHook(() => useForecasts());
    const events = renderHook(() => useCoachEvents());
    await waitFor(() => expect(forecasts.result.current).toEqual([]));
    await act(async () => {
      await writeForecasts([forecast("b", "2026-11-14"), forecast("a", "2026-11-10")]);
      await recordCoachEvent({ kind: "settingsChange", title: "one", detail: "", at: new Date("2026-11-01") });
      await recordCoachEvent({ kind: "settingsChange", title: "two", detail: "", at: new Date("2026-11-02") });
    });
    await waitFor(() => expect(forecasts.result.current?.map((f) => f.id)).toEqual(["a", "b"]));
    await waitFor(() => expect(events.result.current?.map((e) => e.title)).toEqual(["two", "one"]));
  });
});
