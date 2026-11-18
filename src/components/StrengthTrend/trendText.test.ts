import { describe, expect, it } from "vitest";
import { strengthTimeline, type TimelineSource } from "@/lib/strength";
import { day, t1Session } from "@/lib/strength/testHelpers";
import { formatTrendValue, reasonText, smoothingText, sourceDetail } from "./trendText";

const timeline = strengthTimeline("bench", t1Session({ sessionId: "w", exerciseId: "bench", weight: 185, amrapReps: 5, day: 0 }), {
  now: day(3).getTime(),
});

describe("trend text", () => {
  it("states a related exercise's ratio and where it comes from", () => {
    const learned = { id: "db_bench", kind: "related", exerciseId: "db_bench", weight: 0.4, ratio: { ratio: 0.886, pairs: 20, basis: "learned" } } as unknown as TimelineSource;
    const prior = { id: "x", kind: "related", exerciseId: "x", weight: 0.4, ratio: { ratio: 0.83, pairs: 0, basis: "prior" } } as unknown as TimelineSource;
    expect(sourceDetail(learned)).toBe("÷ 0.89, from 20 pairs, counts 40%");
    expect(sourceDetail(prior)).toBe("÷ 0.83, starting ratio, counts 40%");
    expect(sourceDetail({ id: "e", kind: "exercise", exerciseId: "e", weight: 0.5, role: "secondary" })).toBe(
      "helping muscle, counts 50%"
    );
  });

  it("says nothing when the line and the plan agree, and why when they do not", () => {
    expect(reasonText({ kind: "match" }, timeline)).toBeNull();
    expect(reasonText({ kind: "older-sessions", ownBefore: 3, relatedBefore: 1, line: 182, anchor: 186 }, timeline)).toBe(
      "The line reads 182 lbs today: it still averages 3 older bench sessions and 1 earlier related session, each halving every 14 days. The plan starts from your latest bench session and adds only the related sessions after it."
    );
  });

  it("names the smoothing with its half-life", () => {
    expect(smoothingText("standard")).toBe("Standard smoothing: a session's weight halves every 14 days, as the plan does.");
    expect(formatTrendValue(104.25, "index")).toBe("104.3");
    expect(formatTrendValue(185.4, "lbs")).toBe("185");
  });
});
