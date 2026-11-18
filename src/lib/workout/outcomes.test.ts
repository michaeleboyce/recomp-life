import { describe, expect, it } from "vitest";
import { makeOutcome } from "@/lib/progression";
import { rebuildDerived } from "@/lib/rebuild";
import { FAIL, PARTIAL, rebuildInput, runSession, startSim } from "@/lib/rebuild/testHelpers";
import type { ProgressionOutcome, SetLog } from "@/types";
import { describeOutcome, describeOutcomes } from "./outcomes";
import { makeSession, makeSets } from "./testFixtures";

const T1 = { weight: 190, stage: "5x3" };
const T2 = { weight: 135, stage: "3x10" };
const T3 = { weight: 90 };

/** Three T3 sets of 15 with `last` reps on the final one. */
const t3Sets = (last: number): SetLog[] =>
  makeSets("lat_pulldown", "T3", 3, 15).map((s, i) => (i === 2 ? { ...s, actualReps: last } : s));

const text = (outcomes: ProgressionOutcome[], sets: SetLog[] = []) =>
  describeOutcomes(makeSession({ sets }), outcomes).map((o) => `${o.exerciseId} ${o.text}`);

describe("describeOutcomes", () => {
  it("passed T1 and T2, T3 last set reached the target", () => {
    expect(
      text([
        makeOutcome("squat", "T1", "passed", T1, { weight: 195, stage: "5x3" }),
        makeOutcome("bench", "T2", "passed", T2, { weight: 140, stage: "3x10" }),
        makeOutcome("lat_pulldown", "T3", "t3Up", T3, { weight: 95 }, "lastSet"),
      ])
    ).toEqual([
      "squat passed: next 195 lbs 5x3",
      "bench passed: next 140 lbs 3x10",
      "lat_pulldown last set reached 18: next 95 lbs",
    ]);
  });

  it("missed T1 moves stage; a partial lift does not change; T3 short of the target stays", () => {
    expect(
      text(
        [
          makeOutcome("squat", "T1", "stageDown", T1, { weight: 190, stage: "6x2" }),
          makeOutcome("bench", "T2", "partial", T2),
          makeOutcome("lat_pulldown", "T3", "t3Same", T3, T3, "lastSet"),
        ],
        t3Sets(17)
      )
    ).toEqual([
      "squat missed: moves to 6x2 at 190 lbs",
      "bench partly done: no change",
      "lat_pulldown 17 reps on the last set, needed 18: stays at 90 lbs",
    ]);
  });

  it("a miss at the last stage is a reset", () => {
    expect(
      text([makeOutcome("squat", "T1", "reset", { weight: 200, stage: "10x1" }, { weight: 170, stage: "5x3" })])
    ).toEqual(["squat missed: resets to 170 lbs 5x3"]);
  });

  it("a held lift and a lift that was not done say so, whatever the reason", () => {
    expect(
      text([
        makeOutcome("squat", "T1", "held", T1, T1, "pain"),
        makeOutcome("bench", "T2", "held", T2, T2, "loadDrop"),
        makeOutcome("lat_pulldown", "T3", "notDone", T3),
      ])
    ).toEqual(["squat held: no change", "bench held: no change", "lat_pulldown not done: stays at 90 lbs"]);
    expect(
      text([
        makeOutcome("squat", "T1", "notDone", T1),
        makeOutcome("lat_pulldown", "T3", "held", T3, T3, "run"),
        makeOutcome("db_row", "T3", "partial", { weight: 35 }),
      ])
    ).toEqual([
      "squat not done: no change",
      "lat_pulldown held: stays at 90 lbs",
      "db_row partly done: stays at 35 lbs",
    ]);
  });

  it("a lift changed from the plan is only logged", () => {
    expect(
      text([
        makeOutcome("squat", "T1", "loggedOnly", T1, T1, "edited"),
        makeOutcome("lat_pulldown", "T3", "loggedOnly", T3, T3, "edited"),
      ])
    ).toEqual(["squat only logged: no change", "lat_pulldown only logged: stays at 90 lbs"]);
  });

  it("a lift done heavier: a pass reads as a pass, a miss holds, and a T3 says why it went up", () => {
    expect(
      text([
        makeOutcome("squat", "T1", "passed", T1, { weight: 210, stage: "5x3" }, "heavier"),
        makeOutcome("bench", "T2", "held", T2, T2, "heavier"),
        makeOutcome("lat_pulldown", "T3", "t3Up", T3, { weight: 100 }, "heavier"),
      ])
    ).toEqual([
      "squat passed: next 210 lbs 5x3",
      "bench held: no change",
      "lat_pulldown done heavier: next 100 lbs",
    ]);
  });

  it("a lift held at a heavier weight than prescribed names the weight it carries on from", () => {
    expect(
      text([
        makeOutcome("squat", "T1", "held", T1, { weight: 200, stage: "5x3" }, "pain"),
        makeOutcome("lat_pulldown", "T3", "held", T3, { weight: 100 }, "pain"),
      ])
    ).toEqual(["squat held: next 200 lbs 5x3", "lat_pulldown held: next 100 lbs"]);
  });

  it("writes half-pound weights with one decimal and whole ones without", () => {
    expect(
      text([makeOutcome("ohp", "T1", "passed", { weight: 85, stage: "5x3" }, { weight: 87.5, stage: "5x3" })])
    ).toEqual(["ohp passed: next 87.5 lbs 5x3"]);
  });

  it("keeps the outcome's own fields beside the text", () => {
    const outcome = makeOutcome("squat", "T1", "held", T1, T1, "pain");
    expect(describeOutcomes(makeSession(), [outcome])).toEqual([{ ...outcome, text: "held: no change" }]);
  });

  it("says nothing without outcomes", () => {
    expect(describeOutcomes(makeSession(), undefined)).toEqual([]);
    expect(describeOutcomes(makeSession(), [])).toEqual([]);
  });
});

describe("describeOutcome", () => {
  it("leaves the rep count out when it is not given the sets", () => {
    expect(describeOutcome(makeOutcome("lat_pulldown", "T3", "t3Same", T3, T3, "lastSet"))).toBe("stays at 90 lbs");
    expect(describeOutcome(makeOutcome("lat_pulldown", "T3", "t3Same", T3, T3, "lastSet"), t3Sets(17))).toBe(
      "17 reps on the last set, needed 18: stays at 90 lbs"
    );
  });
});

describe("a T3's line uses the threshold its own weight asked for", () => {
  it("a 50 lb T3: 20 of 20 goes up, 19 of 20 stays", () => {
    const at50 = { weight: 50 };
    expect(describeOutcome(makeOutcome("db_row", "T3", "t3Up", at50, { weight: 55 }, "lastSet"), t3Sets(20))).toBe(
      "20 reps on the last set, needed 20: next 55 lbs"
    );
    expect(describeOutcome(makeOutcome("db_row", "T3", "t3Same", at50, at50, "lastSet"), t3Sets(19))).toBe(
      "19 reps on the last set, needed 20: stays at 50 lbs"
    );
  });
});

describe("describeOutcomes on a rebuilt log", () => {
  it("reads the rebuild's outcomes for a workout", () => {
    const sim = startSim();
    const first = runSession(sim, { templateId: "A1", t3: { lastReps: 26 } });
    const second = runSession(sim, { templateId: "A1", t1: FAIL, t2: PARTIAL, t3: { lastReps: 17 } });
    const { outcomes } = rebuildDerived(rebuildInput(sim));
    expect(describeOutcomes(first, outcomes.get(first.id)).map((o) => o.text)).toEqual([
      "passed: next 200 lbs 5x3",
      "passed: next 105 lbs 3x10",
      "26 reps on the last set, needed 18: next 95 lbs",
    ]);
    expect(describeOutcomes(second, outcomes.get(second.id)).map((o) => `${o.kind}|${o.text}`)).toEqual([
      "stageDown|missed: moves to 6x2 at 200 lbs",
      "partial|partly done: no change",
      "t3Same|17 reps on the last set, needed 18: stays at 95 lbs",
    ]);
  });
});
