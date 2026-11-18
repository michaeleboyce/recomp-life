import { describe, expect, it } from "vitest";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { describeUpcomingWorkout, type DescribeUpcomingInput } from "@/lib/workout/upcoming";
import { EQUIPMENT, SETTINGS, seedLiftStates } from "@/lib/workout/testFixtures";
import { buildLiftRows } from "@/components/Today/LiftRows";
import {
  assumptionLine,
  lengthLine,
  parseLocation,
  parsePosition,
  positionLabel,
  setBlocks,
  setText,
  startAction,
  upcomingLiftRows,
  whatWouldChange,
} from "./upcomingView";

function detail(position: number, overrides: Partial<DescribeUpcomingInput> = {}) {
  return describeUpcomingWorkout({
    completedWorkouts: [],
    templates: WORKOUT_TEMPLATES,
    liftStates: seedLiftStates(),
    location: "gym",
    equipment: EQUIPMENT,
    includeWarmUps: true,
    settings: SETTINGS,
    now: new Date(0),
    reentry: true,
    position,
    ...overrides,
  })!;
}

describe("address values", () => {
  it("reads a position from 0 to the furthest planned, and a location", () => {
    expect(parsePosition("0")).toBe(0);
    expect(parsePosition("7")).toBe(7);
    expect(parsePosition("8")).toBeNull();
    expect(parsePosition("-1")).toBeNull();
    expect(parsePosition("1.5")).toBeNull();
    expect(parsePosition(null)).toBeNull();
    expect(parseLocation("home")).toBe("home");
    expect(parseLocation("office")).toBeNull();
  });
});

describe("words", () => {
  it("places the workout in the sequence, not on a date", () => {
    expect(positionLabel(0, "A1")).toBe("Next · A1");
    expect(positionLabel(1, "B1")).toBe("2nd up · B1");
    expect(positionLabel(2, "A2")).toBe("3rd up · A2");
    expect(positionLabel(4, "A1")).toBe("5th up · A1");
  });

  it("gives the length against the target", () => {
    expect(lengthLine(58, 60)).toBe("About 58 of 60 min");
    expect(lengthLine(58, null)).toBe("About 58 min");
    expect(lengthLine(null, 60)).toBeNull();
  });

  it("states a later lift's assumption, naming the day", () => {
    const again = detail(4);
    expect(assumptionLine(again.lifts[0], 4)).toBe("Assumes you complete every set on Squat day (A1) before this.");
    expect(assumptionLine(detail(2).lifts[0], 2)).toBe("No day before this one changes it.");
    expect(assumptionLine(detail(0).lifts[0], 0)).toBeNull();
  });

  it("writes sets short, the last one with + when it asks for as many as you can", () => {
    expect(setText({ weight: 190, reps: 3 })).toBe("190×3");
    expect(setText({ weight: 190, reps: 3 }, true, true)).toBe("190×3+");
    expect(setText({ weight: 0, reps: 10 })).toBe("BW×10");
    expect(setText({ weight: 22.5, reps: 8 })).toBe("22.5×8");
  });
});

describe("upcomingLiftRows", () => {
  it("is Today's rows for the next workout", () => {
    const next = detail(0);
    expect(upcomingLiftRows(next, [])).toEqual(buildLiftRows(next.lifts.map((l) => l.entry), []));
  });

  it("gives a lift that depends on an earlier day the step from that day's weight", () => {
    const [squat] = upcomingLiftRows(detail(4), []);
    expect(squat.reason).toEqual({ kind: "up", change: 10, from: 190 });
    const [bench] = upcomingLiftRows(detail(2), []);
    expect(bench.reason).toEqual({ kind: "first" });
  });
});

describe("setBlocks", () => {
  it("puts each lift's warm-ups with it, in plan order", () => {
    const blocks = setBlocks(detail(0).plan);
    expect(blocks.map((b) => b.tier)).toEqual(["T1", "T2", "T3"]);
    expect(blocks[0].warmUps.length).toBeGreaterThan(0);
    expect(blocks[0].sets).toHaveLength(5);
    expect(blocks[0].isAMRAP).toBe(true);
  });
});

describe("startAction", () => {
  it("starts the next workout as Today does", () => {
    expect(startAction(detail(0))).toEqual({ label: "Start", href: "/workout/configure?location=gym", note: null });
  });

  it("does a later day today on the Ready screen; the due day stays next", () => {
    expect(startAction(detail(2, { location: "home" }))).toEqual({
      label: "Do this one today",
      href: "/workout/configure?templateId=A2&location=home",
      note: "Squat day stays next.",
    });
  });

  it("says when doing it today plans from where the lifts are now", () => {
    // The second squat day after one more lap: the B1 after next.
    const later = detail(5);
    expect(later.templateId).toBe("B1");
    expect(later.sameIfDoneToday).toBe(false);
    expect(startAction(later).note).toBe("Squat day stays next. Done today, it starts from where your lifts are now.");
  });

  it("starts the due day when a later position is that day again", () => {
    expect(startAction(detail(4))).toMatchObject({ label: "Start", href: "/workout/configure?location=gym" });
  });
});

describe("whatWouldChange", () => {
  it("names a missed set, a skipped day and the other location", () => {
    const items = whatWouldChange(detail(1), "today");
    expect(items.map((i) => i.key)).toEqual(["missed", "skipped", "location"]);
    expect(items[2]).toMatchObject({
      text: "Home instead: dumbbell versions at their own weights.",
      href: "/progress/upcoming/workout?n=1&location=home&from=today",
    });
    expect(whatWouldChange(detail(0, { location: "home" }))[2].text).toBe(
      "The gym instead: the barbell lifts at their own weights."
    );
  });
});
