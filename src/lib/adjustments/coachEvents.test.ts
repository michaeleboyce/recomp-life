// Stored coach events: the changes that cannot be worked out from the rest of the data.
import { describe, expect, it } from "vitest";
import { coachEventEntries } from "./coachEvents";
import { makeCoachEvent } from "./testHelpers";

const entriesOf = (...args: Parameters<typeof coachEventEntries>) =>
  coachEventEntries(...args).map((ranked) => ranked.entry);

describe("coachEventEntries", () => {
  it("shows a settings change as it was stored, with its rule and a link to settings", () => {
    const event = makeCoachEvent();
    expect(entriesOf([event])).toEqual([
      {
        id: `coachEvent:${event.id}`,
        at: event.at,
        source: "coachEvent",
        title: "Rest after heavy sets 3:00 → 3:30",
        detail: "You set your phase to cutting.",
        ruleId: "rest-cut-bonus",
        href: "/settings",
      },
    ]);
  });

  it("an advisory links to its rule", () => {
    const entries = entriesOf([
      makeCoachEvent({ id: "ce-2", kind: "advisoryDismissed", ruleId: "run-interference" }),
      makeCoachEvent({ id: "ce-3", kind: "advisoryAccepted", ruleId: undefined }),
    ]);
    expect(entries[0].href).toBe("/research?rule=run-interference#run-interference");
    expect(entries[1].href).toBeUndefined();
    expect(entries[1].ruleId).toBeUndefined();
  });

  it("drops a rule id that is not a real rule", () => {
    const entries = entriesOf([makeCoachEvent({ ruleId: "made-up-rule" })]);
    expect(entries[0].ruleId).toBeUndefined();
    expect(entries[0].href).toBe("/settings");
  });

  it("takes the before and after values from the event's data when both are there", () => {
    const entries = entriesOf([
      makeCoachEvent({ id: "a", data: { from: "3:00", to: "3:30" } }),
      makeCoachEvent({ id: "b", data: { from: 2, to: 3 } }),
      makeCoachEvent({ id: "c", data: { from: "3:00" } }),
    ]);
    expect(entries[0].change).toEqual({ from: "3:00", to: "3:30" });
    expect(entries[1].change).toEqual({ from: "2", to: "3" });
    expect(entries[2].change).toBeUndefined();
  });

  it("reads a date stored as text, and skips a deleted or undated event", () => {
    const text = { ...makeCoachEvent(), at: "2026-11-10T12:02:00.000Z" as unknown as Date };
    expect(entriesOf([text])[0].at).toEqual(new Date("2026-11-10T12:02:00Z"));
    expect(entriesOf([makeCoachEvent({ deletedAt: 9 })])).toEqual([]);
    expect(entriesOf([{ ...makeCoachEvent(), at: "not a date" as unknown as Date }])).toEqual([]);
  });

  it("never offers an undo", () => {
    expect(entriesOf([makeCoachEvent()])[0].undo).toBeUndefined();
  });
});
