import { describe, expect, it } from "vitest";
import { WEEKLY_SESSION_TARGET } from "@/components/Today/GlanceTiles";
import type { Insight } from "@/lib/insights";
import { buildWeeklyReview } from "./weeklyReview";
import { AFTER, LATER, OPTS, WEEK, fixture } from "./testFixture";

describe("takeaways", () => {
  const deload: Insight = {
    id: "deload:bench", kind: "deload", severity: "warning",
    title: "Fatigue sign on Bench Press", body: "Estimated 1RM has dropped.", evidenceId: "fatigue-detection",
  };
  const onPace: Insight = {
    id: "loss-rate", kind: "loss-rate", severity: "positive",
    title: "Weight loss on pace", body: "Losing 1.4 lbs a week.", evidenceId: "rate-of-loss",
  };
  const unrelated: Insight = { id: "weigh-in-due", kind: "weigh-in-due", severity: "action", title: "Weigh in", body: "" };

  it("puts warnings first, then the PR, then sessions, capped at three", () => {
    const t = buildWeeklyReview(fixture(), [unrelated, deload, onPace], WEEK, AFTER, OPTS).takeaways;
    expect(t.map((x) => x.id)).toEqual(["insight:deload:bench", "prs", "sessions"]);
    expect(t[0]).toMatchObject({ tone: "warn", text: "Fatigue sign on Bench Press.", href: "/progress/lift/bench", evidenceId: "fatigue-detection" });
    expect(t[1]).toMatchObject({ tone: "good", text: "New best estimated 1RM on squat.", href: "/progress/lift/squat", evidenceId: "e1rm-estimate" });
    expect(t[2]).toMatchObject({ tone: "info", text: `3 of ${WEEKLY_SESSION_TARGET} sessions (1 the week before).`, href: "/log" });
  });

  it("adds positive insights after the measured sentences", () => {
    const t = buildWeeklyReview(fixture(), [onPace], WEEK, AFTER, OPTS).takeaways;
    expect(t.map((x) => x.id)).toEqual(["prs", "sessions", "insight:loss-rate"]);
    expect(t[2]).toMatchObject({ tone: "good", href: "/progress/body", evidenceId: "rate-of-loss" });
  });

  it("ignores insights for an older week and uses the pace word while cutting", () => {
    const t = buildWeeklyReview(fixture(), [deload], WEEK, LATER, OPTS).takeaways;
    expect(t.map((x) => x.id)).toEqual(["prs", "sessions", "pace"]);
    expect(t[2]).toMatchObject({ text: "Weight loss was on pace.", evidenceId: "rate-of-loss" });
    const maintaining = buildWeeklyReview(fixture("maintaining"), [], WEEK, LATER, OPTS).takeaways;
    expect(maintaining.map((x) => x.id)).toEqual(["prs", "sessions"]);
  });

  it("says the target was hit, and 'so far' on the current week", () => {
    const hit = buildWeeklyReview(fixture(), [], WEEK, AFTER, { sessionTarget: 3 }).takeaways;
    expect(hit.find((x) => x.id === "sessions")?.text).toBe("Hit the target: 3 of 3 sessions.");
    const current = buildWeeklyReview(fixture(), [], new Date(2026, 10, 9), AFTER, OPTS).takeaways;
    expect(current.find((x) => x.id === "sessions")?.text).toBe(`1 of ${WEEKLY_SESSION_TARGET} sessions so far (3 the week before).`);
  });

  it("writes no sessions sentence without a target", () => {
    const t = buildWeeklyReview(fixture(), [], WEEK, AFTER).takeaways;
    expect(t.some((x) => x.id === "sessions")).toBe(false);
  });

  it("only cites active evidence rules", () => {
    const planned: Insight = { ...deload, id: "deload:squat", evidenceId: "deload" };
    const t = buildWeeklyReview(fixture(), [planned], WEEK, AFTER, OPTS).takeaways;
    expect(t[0].evidenceId).toBeUndefined();
  });
});

