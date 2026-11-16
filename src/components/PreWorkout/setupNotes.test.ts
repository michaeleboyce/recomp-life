import { describe, expect, it } from "vitest";
import { lighterWeight, notesToWrite, queueNote, type PendingNote } from "./setupNotes";

const equipment = { dumbbellIncrementLbs: 5 };

describe("lighterWeight", () => {
  it("takes 10% off a barbell weight, to the nearest 5", () => {
    expect(lighterWeight({ weight: 190 }, equipment)).toBe(170);
    expect(lighterWeight({ weight: 100 }, equipment)).toBe(90);
  });

  it("moves a home dumbbell in the dumbbell increment", () => {
    expect(lighterWeight({ weight: 50, substituteExerciseId: "db_bench" }, equipment)).toBe(45);
    expect(lighterWeight({ weight: 50, substituteExerciseId: "db_bench" }, { dumbbellIncrementLbs: 2.5 })).toBe(45);
  });

  it("is null when 10% rounds back to the same weight or to nothing", () => {
    // 25 x 0.9 = 22.5, which rounds to 25: no change.
    expect(lighterWeight({ weight: 25, substituteExerciseId: "goblet_squat" }, equipment)).toBeNull();
    expect(lighterWeight({ weight: 5 }, equipment)).toBeNull();
    expect(lighterWeight({ weight: 0 }, equipment)).toBeNull();
  });
});

const note = (key: string, overrides: Partial<PendingNote> = {}): PendingNote => ({
  key,
  templateId: "A1",
  input: { kind: "advisoryAccepted", title: key, detail: "", data: { advisory: key } },
  ...overrides,
});

describe("queueNote and notesToWrite", () => {
  it("keeps the latest choice per advisory and adds the session id", () => {
    let notes = queueNote([], note("run", { input: { kind: "advisoryDismissed", title: "first", detail: "" } }));
    notes = queueNote(notes, note("run"));
    notes = queueNote(notes, note("activity"));
    expect(notesToWrite(notes, { sessionId: "s1", templateId: "A1", edits: [] })).toEqual([
      { kind: "advisoryAccepted", title: "run", detail: "", data: { advisory: "run", sessionId: "s1" } },
      { kind: "advisoryAccepted", title: "activity", detail: "", data: { advisory: "activity", sessionId: "s1" } },
    ]);
  });

  it("drops a note for another day, or whose weight edit is gone", () => {
    const notes = [
      note("other-day", { templateId: "B1" }),
      note("reduced", { requires: { exerciseId: "squat", tier: "T1", weight: 170 } }),
      note("changed", { requires: { exerciseId: "bench", tier: "T1", weight: 90 } }),
    ];
    const titles = notesToWrite(notes, {
      sessionId: "s1",
      templateId: "A1",
      edits: [
        { kind: "weight", exerciseId: "squat", tier: "T1", weight: 170 },
        { kind: "weight", exerciseId: "bench", tier: "T1", weight: 95 },
      ],
    }).map((n) => n.title);
    expect(titles).toEqual(["reduced"]);
  });
});
