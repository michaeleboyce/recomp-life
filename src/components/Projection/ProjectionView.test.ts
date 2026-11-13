import { describe, expect, it } from "vitest";
import type { Projection } from "@/lib/projection";
import { plainSummary } from "./ProjectionView";

function projection(end: number, status: Projection["status"] = "ok"): Projection {
  return { status, points: [{ t: 0, v: 200 }, { t: 1, v: end }] } as unknown as Projection;
}

const SUMMARY = "With 2 squat sessions a week instead of 1.5, about 252 in 12 weeks. On your current trend, about 252.";

describe("plainSummary", () => {
  it("says the change is too small to tell apart when both round to the same number", () => {
    expect(plainSummary(SUMMARY, projection(252.3), projection(251.8))).toBe(
      "With 2 squat sessions a week instead of 1.5, about 252 in 12 weeks, about the same as your current trend: within the range, this change is too small to tell apart."
    );
  });

  it("keeps the summary when the numbers differ, or the scenario is not an ok projection", () => {
    expect(plainSummary(SUMMARY, projection(258), projection(252))).toBe(SUMMARY);
    expect(plainSummary(SUMMARY, projection(252, "flat-trend"), projection(252))).toBe(SUMMARY);
    const current = "On your current trend, about 252 in 12 weeks.";
    expect(plainSummary(current, projection(252), projection(252))).toBe(current);
  });
});
