// The merged adjustment log: every source in one list, newest first, with stable ids.
import { describe, expect, it } from "vitest";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { getChangelog, getRule, isRuleId } from "@/lib/evidence";
import { replayForecasts } from "@/lib/forecast";
import { SETTINGS, makeForecast } from "@/lib/forecast/testHelpers";
import { rebuildDerived } from "@/lib/rebuild";
import { FAIL, adjust, runSession, startSim, type Sim } from "@/lib/rebuild/testHelpers";
import type { AdjustmentEntry, AdjustmentSource, Forecast } from "@/types";
import { buildAdjustmentFeed, entryGrade } from "./feed";
import { FEED_GROUPS, filterFeed, groupsOf } from "./filter";
import { adjustFrom, bySource, makeCoachEvent, feedInput, textOf } from "./testHelpers";
import type { AdjustmentFeedInput } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const ALL_SOURCES: AdjustmentSource[] = [
  "progression",
  "liftAdjustment",
  "ruleChange",
  "forecastRevision",
  "selfCorrection",
  "override",
  "coachEvent",
];

function horizonRow(n: number, point: number, madeAt: Date, sdScale = 1): Forecast {
  const id = `h-squat-${n}`;
  return makeForecast({
    id,
    clientId: id,
    slot: `e1rm4w|squat|2026-W0${n}`,
    kind: "e1rm4w",
    workoutId: undefined,
    tier: undefined,
    madeAt,
    dueAt: new Date(madeAt.getTime() + 28 * DAY),
    event: { type: "e1rmLevel", windowDays: 7 },
    prediction: { point, low: point - 8, high: point + 8, unit: "lb" },
    inputs: { sdScale, sampleSize: 4 + n },
    modelVersion: "e1rm-1",
  });
}

/** A log in which every source of the feed has something to say. */
function busyLog(): { sim: Sim; input: AdjustmentFeedInput } {
  const sim = startSim();
  const first = runSession(sim, { templateId: "A1" });
  runSession(sim, { templateId: "B1", t1: FAIL });
  adjust(sim, "bench", { t1Weight: 135 }, new Date(sim.workouts[1].completedAt!.getTime() + 60_000));
  adjustFrom(
    sim,
    "decay",
    "deadlift",
    { t1Weight: 200 },
    new Date(sim.workouts[1].completedAt!.getTime() + 120_000)
  );
  const third = runSession(sim, { templateId: "A2" });

  // The user lifted 140 on the bench instead of the planned 135.
  const workouts = sim.workouts.map((workout) =>
    workout.id === third.id
      ? {
          ...workout,
          sets: workout.sets.map((set) =>
            set.exerciseId === "bench" ? { ...set, weight: 140 } : set
          ),
        }
      : workout
  );
  const rebuild = rebuildDerived({ workouts, adjustments: sim.adjustments, settings: sim.settings });
  const forecasts = [
    horizonRow(1, 250, new Date(first.startedAt.getTime())),
    horizonRow(2, 262, new Date(first.startedAt.getTime() + 7 * DAY), 1.15),
  ];
  const coachEvents = [makeCoachEvent({ at: new Date(first.completedAt!.getTime() + DAY) })];
  return {
    sim,
    input: feedInput(sim, { workouts, rebuild, forecasts, coachEvents, changelog: undefined }),
  };
}

describe("buildAdjustmentFeed", () => {
  it("an empty history gives an empty feed", () => {
    const empty: AdjustmentFeedInput = {
      workouts: [],
      adjustments: [],
      rebuild: rebuildDerived({ workouts: [], adjustments: [], settings: SETTINGS }),
      forecasts: [],
      coachEvents: [],
      changelog: [],
    };
    expect(buildAdjustmentFeed(empty)).toEqual([]);
  });

  it("an empty history still shows the app's own rule changes unless told otherwise", () => {
    const feed = buildAdjustmentFeed({
      workouts: [],
      adjustments: [],
      rebuild: rebuildDerived({ workouts: [], adjustments: [], settings: SETTINGS }),
      forecasts: [],
      coachEvents: [],
    });
    expect(feed).toHaveLength(getChangelog().length);
    expect(feed.every((entry) => entry.source === "ruleChange")).toBe(true);
  });

  it("merges every source", () => {
    const feed = buildAdjustmentFeed(busyLog().input);
    for (const source of ALL_SOURCES) {
      expect(bySource(feed, source).length, source).toBeGreaterThan(0);
    }
  });

  it("is newest first", () => {
    const feed = buildAdjustmentFeed(busyLog().input);
    for (let i = 1; i < feed.length; i++) {
      expect(feed[i - 1].at.getTime(), feed[i].title).toBeGreaterThanOrEqual(feed[i].at.getTime());
    }
  });

  it("entries of one workout stay together: the day's line, then each lift, then overrides", () => {
    const { sim, input } = busyLog();
    const feed = buildAdjustmentFeed({ ...input, changelog: [] });
    const second = sim.workouts[1];
    const third = sim.workouts[2];
    const idsAt = (at: Date) =>
      feed.filter((entry) => entry.at.getTime() === at.getTime()).map((entry) => entry.id);

    expect(idsAt(second.completedAt!)).toEqual([
      `progression:${second.id}`,
      `progression:${second.id}:ohp:T1`,
    ]);
    expect(idsAt(third.completedAt!)).toEqual([
      `progression:${third.id}`,
      `override:${third.id}:bench:T1`,
    ]);
  });

  it("gives the same entries whatever order the rows arrive in, with unique ids", () => {
    const { input } = busyLog();
    const feed = buildAdjustmentFeed(input);
    const reversed = buildAdjustmentFeed({
      ...input,
      workouts: [...input.workouts].reverse(),
      adjustments: [...input.adjustments].reverse(),
      forecasts: [...input.forecasts].reverse(),
      coachEvents: [...input.coachEvents].reverse(),
      changelog: [...getChangelog()].reverse(),
    });
    expect(reversed).toEqual(feed);
    expect(buildAdjustmentFeed(input)).toEqual(feed);
    expect(new Set(feed.map((entry) => entry.id)).size).toBe(feed.length);
  });

  it("an entry keeps its id when later history is added", () => {
    const { sim, input } = busyLog();
    const before = new Map(buildAdjustmentFeed(input).map((entry) => [entry.id, entry]));
    runSession(sim, { templateId: "B2" });
    const after = buildAdjustmentFeed(
      feedInput(sim, {
        workouts: [...input.workouts, sim.workouts[3]],
        rebuild: rebuildDerived({
          workouts: [...input.workouts, sim.workouts[3]],
          adjustments: sim.adjustments,
          settings: sim.settings,
        }),
        forecasts: input.forecasts,
        coachEvents: input.coachEvents,
        changelog: undefined,
      })
    );
    const afterIds = new Set(after.map((entry) => entry.id));
    for (const id of before.keys()) expect(afterIds.has(id), id).toBe(true);
    expect(after.length).toBeGreaterThan(before.size);
  });

  it("every rule id is a real rule, and overrides cite none", () => {
    const feed = buildAdjustmentFeed(busyLog().input);
    for (const entry of feed) {
      if (entry.ruleId !== undefined) expect(isRuleId(entry.ruleId), entry.title).toBe(true);
    }
    for (const entry of bySource(feed, "override")) expect(entry.ruleId).toBeUndefined();
    for (const entry of bySource(feed, "selfCorrection")) {
      expect(entry.ruleId).toBe("forecast-calibration");
    }
    for (const source of ["progression", "ruleChange", "forecastRevision"] as const) {
      for (const entry of bySource(feed, source)) expect(entry.ruleId, entry.title).toBeDefined();
    }
  });

  it("offers an undo only on a change by hand or after time off", () => {
    const feed = buildAdjustmentFeed(busyLog().input);
    const withUndo = feed.filter((entry) => entry.undo);
    // The bench change was trained on since (A2), the deadlift reduction was not.
    expect(withUndo.map((entry) => entry.title)).toEqual(["Deadlift T1 220 → 200"]);
    expect(withUndo[0].undo).toEqual({ kind: "liftAdjustment", adjustmentId: "decay-8" });
    expect(withUndo.every((entry) => entry.source === "liftAdjustment")).toBe(true);
  });

  it("uses plain words: no entry says AMRAP, and every entry has a title and a reason", () => {
    const feed = buildAdjustmentFeed(busyLog().input);
    for (const entry of feed) {
      // A rule change quotes the changelog's own sentence, which this package does not write.
      if (entry.source !== "ruleChange") expect(textOf(entry)).not.toMatch(/amrap|e1rm|\brpe\b|\brir\b/i);
      expect(entry.title.trim().length, entry.id).toBeGreaterThan(0);
      expect(entry.detail.trim().length, entry.id).toBeGreaterThan(0);
      expect(entry.detail.trim()).toMatch(/[.?!]$/);
    }
  });

  it("does not change its input", () => {
    const { input } = busyLog();
    const snapshot = JSON.stringify({
      workouts: input.workouts,
      adjustments: input.adjustments,
      forecasts: input.forecasts,
      coachEvents: input.coachEvents,
    });
    buildAdjustmentFeed(input);
    expect(
      JSON.stringify({
        workouts: input.workouts,
        adjustments: input.adjustments,
        forecasts: input.forecasts,
        coachEvents: input.coachEvents,
      })
    ).toBe(snapshot);
  });

  it("the demo history reads as a log: one line per ordinary workout and real rules throughout", () => {
    const now = new Date("2026-11-15T20:00:00Z");
    const demo = generateDemoData(now);
    const rebuild = rebuildDerived({
      workouts: demo.workouts,
      adjustments: demo.liftAdjustments,
      settings: SETTINGS,
    });
    const { forecasts } = replayForecasts({
      workouts: demo.workouts,
      adjustments: demo.liftAdjustments,
      bodyweight: demo.bodyweight,
      settings: SETTINGS,
      now,
    });
    const feed = buildAdjustmentFeed({
      workouts: demo.workouts,
      adjustments: demo.liftAdjustments,
      rebuild,
      forecasts,
      coachEvents: [],
    });

    // Every finished workout with a pass has exactly one line of its own.
    const dayLines = feed.filter((entry) => /^progression:[^:]+$/.test(entry.id));
    const withPass = demo.workouts.filter((workout) =>
      (rebuild.outcomes.get(workout.id) ?? []).some((outcome) => outcome.kind === "passed")
    );
    expect(dayLines).toHaveLength(withPass.length);
    expect(bySource(feed, "liftAdjustment")).toHaveLength(1); // the starting weights
    expect(bySource(feed, "ruleChange")).toHaveLength(getChangelog().length);
    expect(new Set(feed.map((entry) => entry.id)).size).toBe(feed.length);
    for (const entry of feed) {
      if (entry.ruleId !== undefined) expect(isRuleId(entry.ruleId), entry.title).toBe(true);
      expect(textOf(entry)).not.toMatch(/undefined|NaN/);
      if (entry.source !== "ruleChange") expect(textOf(entry)).not.toMatch(/amrap/i);
    }
    for (let i = 1; i < feed.length; i++) {
      expect(feed[i - 1].at.getTime()).toBeGreaterThanOrEqual(feed[i].at.getTime());
    }
  });
});

describe("entryGrade", () => {
  it("is the strength of the entry's rule, or null without one", () => {
    const entry: AdjustmentEntry = {
      id: "x",
      at: new Date(0),
      source: "progression",
      title: "t",
      detail: "d",
      ruleId: "gzclp-progression",
    };
    expect(entryGrade(entry)).toBe(getRule("gzclp-progression").strength);
    expect(entryGrade({ ...entry, ruleId: undefined })).toBeNull();
    expect(entryGrade({ ...entry, ruleId: "no-such-rule" })).toBeNull();
  });
});

describe("filterFeed", () => {
  it("lists the groups of the log's filter row", () => {
    expect(FEED_GROUPS.map((group) => group.label)).toEqual([
      "All",
      "Weights",
      "Rest",
      "Forecasts",
      "Rules",
    ]);
  });

  it("All is the whole feed, in the same order", () => {
    const feed = buildAdjustmentFeed(busyLog().input);
    expect(filterFeed(feed, "all")).toEqual(feed);
  });

  it("Weights holds progression, changes to a lift and overrides", () => {
    const feed = buildAdjustmentFeed({ ...busyLog().input, changelog: [] });
    const weights = filterFeed(feed, "weights");
    expect(new Set(weights.map((entry) => entry.source))).toEqual(
      new Set(["progression", "liftAdjustment", "override"])
    );
    expect(weights).toHaveLength(
      bySource(feed, "progression").length +
        bySource(feed, "liftAdjustment").length +
        bySource(feed, "override").length
    );
  });

  it("Forecasts holds revisions and self-corrections", () => {
    const feed = buildAdjustmentFeed({ ...busyLog().input, changelog: [] });
    expect(new Set(filterFeed(feed, "forecasts").map((entry) => entry.source))).toEqual(
      new Set(["forecastRevision", "selfCorrection"])
    );
  });

  it("Rules holds every rule change", () => {
    const feed = buildAdjustmentFeed(busyLog().input);
    expect(filterFeed(feed, "rules")).toEqual(bySource(feed, "ruleChange"));
  });

  it("Rest holds whatever cites a rest rule: a settings change and a rule change", () => {
    const feed = buildAdjustmentFeed(busyLog().input);
    const rest = filterFeed(feed, "rest");
    expect(rest.length).toBeGreaterThan(0);
    for (const entry of rest) expect(getRule(entry.ruleId as "rest-light").area).toBe("rest");
    expect(new Set(rest.map((entry) => entry.source))).toEqual(new Set(["coachEvent", "ruleChange"]));
  });

  it("a rule change also shows under the topic of its rule", () => {
    const feed = buildAdjustmentFeed(busyLog().input);
    const t3 = feed.find((entry) => entry.source === "ruleChange" && entry.ruleId === "t3-progression")!;
    expect(groupsOf(t3)).toEqual(["all", "rules", "weights"]);
    const projection = feed.find(
      (entry) => entry.source === "ruleChange" && entry.ruleId === "projection-rate-of-gain"
    )!;
    expect(groupsOf(projection)).toEqual(["all", "rules", "forecasts"]);
    const other = feed.find((entry) => entry.source === "ruleChange" && entry.ruleId === "time-off")!;
    expect(groupsOf(other)).toEqual(["all", "rules"]);
  });

  it("a coach event with no rule shows only under All", () => {
    const feed = buildAdjustmentFeed({
      ...busyLog().input,
      coachEvents: [makeCoachEvent({ ruleId: undefined })],
      changelog: [],
    });
    const event = bySource(feed, "coachEvent")[0];
    expect(groupsOf(event)).toEqual(["all"]);
  });
});
