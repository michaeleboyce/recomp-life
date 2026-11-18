import { describe, expect, it } from "vitest";
import type { StrengthSet } from "@/lib/strength";
import { OWN_HISTORY_WINDOW_WEEKS } from "@/lib/workout/strength";
import {
  OWN_HISTORY_FIRST_WEIGHT,
  accessoryLoadStep,
  accessoryPrescription,
  activeHandSetWeight,
  handSetAccessoryWeight,
  ownHistoryFirstWeight,
} from "./prescription";

// Made-up sets only.

const NOW = new Date("2026-06-15T12:00:00Z");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const EQUIPMENT = { dumbbellIncrementLbs: 2.5 };

let n = 0;
function set(exerciseId: string, sessionId: string, ago: number, weight: number, reps: number, over: Partial<StrengthSet> = {}): StrengthSet {
  n += 1;
  return {
    id: `p${n}`,
    sessionId,
    exerciseId,
    weight,
    perHand: false,
    reps,
    repsInReserve: null,
    role: "working",
    tier: "accessory",
    isAMRAP: false,
    date: new Date(daysAgo(ago).getTime() + n * 1000),
    ...over,
  };
}
/** An app session of an accessory: one set per reps value at `weight`. */
const session = (exerciseId: string, id: string, ago: number, weight: number, reps: number[]) =>
  reps.map((r) => set(exerciseId, id, ago, weight, r));

describe("the own-history window counts back from the date planned for", () => {
  it("is the same window as a home exercise's first weight", () => {
    expect(OWN_HISTORY_FIRST_WEIGHT.recentDays).toBe(OWN_HISTORY_WINDOW_WEEKS * 7);
  });

  it("history older than the window gives no first weight, and says when it was last done", () => {
    // Imported (history, not app accessory sessions), fourteen months before.
    const old = [12, 12, 11].map((r) => set("hack_squat", "old", 420, 140, r, { imported: true }));
    expect(ownHistoryFirstWeight(old, "hack_squat", { min: 8, max: 12 }, 5, NOW)).toBeNull();
    // The newest set's clock would read the same sets as recent.
    expect(ownHistoryFirstWeight(old, "hack_squat", { min: 8, max: 12 }, 5)).not.toBeNull();
    const p = accessoryPrescription({ exerciseId: "hack_squat", sets: old, equipment: EQUIPMENT, handSetWeight: null, now: NOW });
    expect(p.weight).toBeNull();
    expect(p.basis).toBe("none");
    expect(p.note).toMatch(/^Last done .+: too long ago to set its weight, enter one$/);
    // Recent history from the date planned for still counts.
    const recent = [12, 12, 12].map((r) => set("hack_squat", "new", 10, 140, r, { imported: true }));
    expect(accessoryPrescription({ exerciseId: "hack_squat", sets: [...old, ...recent], equipment: EQUIPMENT, handSetWeight: null, now: NOW }).basis).toBe("history");
  });
});

describe("accessoryPrescription: double progression", () => {
  it("gives sets and reps from the exercise's range", () => {
    const p = accessoryPrescription({ exerciseId: "hack_squat", sets: [], equipment: EQUIPMENT, now: NOW });
    expect(p.sets).toBe(3);
    expect(p.reps).toEqual({ min: 8, max: 12 });
  });

  it("all sets at the top of the range: up one step (5 lb on a machine)", () => {
    const p = accessoryPrescription({
      exerciseId: "leg_curls",
      sets: session("leg_curls", "w1", 3, 70, [15, 15, 16]),
      equipment: EQUIPMENT,
      now: NOW,
    });
    expect(p).toMatchObject({ weight: 75, basis: "progression", verdict: "up", planWeight: null, setAt: null });
    expect(p.last).toMatchObject({ weight: 70, reps: [15, 15, 16] });
    expect(p.note).toBe("Every set reached 15 last time: up 5 lb");
  });

  it("dumbbell work goes up by the dumbbell increment", () => {
    expect(accessoryLoadStep("bicep_curls", EQUIPMENT)).toBe(2.5);
    expect(accessoryLoadStep("machine_row", EQUIPMENT)).toBe(5);
    const p = accessoryPrescription({
      exerciseId: "bicep_curls",
      sets: session("bicep_curls", "w1", 3, 25, [15, 15, 15]),
      equipment: EQUIPMENT,
      now: NOW,
    });
    expect(p.weight).toBe(27.5);
  });

  it("short of the top: the same weight", () => {
    const p = accessoryPrescription({
      exerciseId: "leg_curls",
      sets: session("leg_curls", "w1", 3, 70, [15, 13, 12]),
      equipment: EQUIPMENT,
      now: NOW,
    });
    expect(p).toMatchObject({ weight: 70, verdict: "same" });
  });

  it("stuck three sessions at one weight: down to 90%", () => {
    const sets = [
      ...session("leg_curls", "w1", 9, 70, [13, 12, 12]),
      ...session("leg_curls", "w2", 6, 70, [14, 12, 12]),
      ...session("leg_curls", "w3", 3, 70, [14, 13, 12]),
    ];
    const p = accessoryPrescription({ exerciseId: "leg_curls", sets, equipment: EQUIPMENT, now: NOW });
    expect(p).toMatchObject({ weight: 65, verdict: "down", basis: "progression" });
    expect(p.note).toContain("for 3 sessions");
  });

  it("a last session older than the own-history window adds nothing: same weight, says when", () => {
    // Every set at the top fourteen months (420 days) before the date planned for.
    const old = session("leg_curls", "w1", 420, 70, [15, 15, 15]);
    const p = accessoryPrescription({ exerciseId: "leg_curls", sets: old, equipment: EQUIPMENT, now: NOW });
    expect(p).toMatchObject({ weight: 70, basis: "progression", verdict: "same" });
    expect(p.note).toBe("Last done 14 months ago: same weight to start");
    // Just inside the window, the same session still moves it up.
    const inside = session("leg_curls", "w1", OWN_HISTORY_FIRST_WEIGHT.recentDays - 1, 70, [15, 15, 15]);
    expect(accessoryPrescription({ exerciseId: "leg_curls", sets: inside, equipment: EQUIPMENT, now: NOW }).weight).toBe(75);
    // Just outside, weeks.
    const outside = session("leg_curls", "w1", OWN_HISTORY_FIRST_WEIGHT.recentDays + 1, 70, [15, 15, 15]);
    expect(accessoryPrescription({ exerciseId: "leg_curls", sets: outside, equipment: EQUIPMENT, now: NOW }).note).toBe(
      "Last done 8 weeks ago: same weight to start"
    );
  });

  it("stuck sessions long ago start the count again: no drop from them", () => {
    const sets = [
      ...session("leg_curls", "w1", 409, 70, [13, 12, 12]),
      ...session("leg_curls", "w2", 406, 70, [14, 12, 12]),
      ...session("leg_curls", "w3", 403, 70, [14, 13, 12]),
    ];
    const p = accessoryPrescription({ exerciseId: "leg_curls", sets, equipment: EQUIPMENT, now: NOW });
    expect(p).toMatchObject({ weight: 70, verdict: "same" });
    // One stuck session after the break is the first of a new count, not the fourth.
    const after = [...sets, ...session("leg_curls", "w4", 3, 70, [13, 12, 12])];
    expect(accessoryPrescription({ exerciseId: "leg_curls", sets: after, equipment: EQUIPMENT, now: NOW })).toMatchObject({
      weight: 70,
      verdict: "same",
    });
  });

  it("reads only the app's sessions as an accessory, not imported ones or warm-ups", () => {
    const sets = [
      ...session("leg_curls", "w1", 10, 70, [15, 15, 15]),
      set("leg_curls", "w2", 3, 30, 15, { role: "warmup" }),
      set("leg_curls", "imp", 1, 200, 15, { imported: true, tier: "T1", isAMRAP: true }),
    ];
    const p = accessoryPrescription({ exerciseId: "leg_curls", sets, equipment: EQUIPMENT, now: NOW });
    expect(p.weight).toBe(75);
  });
});

describe("accessoryPrescription: first weight from own history", () => {
  it("imported only: the heaviest weight the top of the range was reached at", () => {
    const sets = [
      set("hack_squat", "i1", 20, 180, 12, { imported: true, tier: "T1", isAMRAP: true }),
      set("hack_squat", "i1", 20, 200, 8, { imported: true, tier: "T1", isAMRAP: true }),
    ];
    const p = accessoryPrescription({ exerciseId: "hack_squat", sets, equipment: EQUIPMENT, now: NOW });
    expect(p).toMatchObject({ weight: 180, basis: "history", planWeight: null });
    expect(p.verdict).toBeUndefined();
    expect(p.note).toContain("from your history");
  });

  it("imported only, never at the top: the estimate's weight for the middle of the range, within the limits", () => {
    const sets = [set("hack_squat", "i1", 5, 203, 8, { imported: true, tier: "T1", isAMRAP: true })];
    const first = ownHistoryFirstWeight(sets, "hack_squat", { min: 8, max: 12 }, 5)!;
    // 203 x (1 + 8/30) = 257.1; for 10 reps 257.1 / (1 + 10/30) = 192.9, down to 190.
    expect(first).toMatchObject({ weight: 190, rule: "estimate", heaviest: 203 });
    expect(first.weight).toBeLessThanOrEqual(first.heaviest + 5);
    expect(first.weight % 5).toBe(0);
  });

  it("never more than the heaviest weight lifted recently plus one step", () => {
    // Top of the range at 60 long ago, but only light work in the recent window.
    const sets = [
      set("machine_row", "old", 200, 120, 12, { imported: true }),
      set("machine_row", "new", 1, 50, 12, { imported: true }),
    ];
    const first = ownHistoryFirstWeight(sets, "machine_row", { min: 10, max: 12 }, 5)!;
    expect(first.weight).toBe(50);
    expect(OWN_HISTORY_FIRST_WEIGHT.stepsAboveHeaviest).toBe(1);
    // The estimate can exceed what was lifted (reps-left credit); the cap holds it to one step above.
    const capped = ownHistoryFirstWeight(
      [set("machine_row", "a", 1, 50, 6, { imported: true, repsInReserve: "3+" })],
      "machine_row",
      { min: 6, max: 8 },
      5
    )!;
    expect(capped.weight).toBeLessThanOrEqual(55);
  });

  it("rounds down to the dumbbell step for dumbbell work", () => {
    const sets = [set("incline_db_curl", "i1", 3, 23, 15, { imported: true, perHand: true })];
    const p = accessoryPrescription({ exerciseId: "incline_db_curl", sets, equipment: EQUIPMENT, now: NOW });
    expect(p.weight).toBe(22.5);
  });

  it("no history: no weight, for the user to enter", () => {
    const p = accessoryPrescription({ exerciseId: "glute_kickback_machine", sets: [], equipment: EQUIPMENT, now: NOW });
    expect(p).toMatchObject({ weight: null, basis: "none", planWeight: null, setAt: null });
    expect(p.note).toBe("No history yet: enter a weight");
  });

  it("ignores other exercises' sets", () => {
    const p = accessoryPrescription({
      exerciseId: "glute_kickback_machine",
      sets: session("leg_curls", "w1", 3, 70, [15, 15, 15]),
      equipment: EQUIPMENT,
      now: NOW,
    });
    expect(p.weight).toBeNull();
  });
});

describe("hand-set accessory weights", () => {
  const log = session("leg_curls", "w1", 10, 70, [15, 15, 15]);
  const setAt = daysAgo(5).getTime();

  it("a hand-set weight wins before the next session, with the plan's weight beside it", () => {
    const p = accessoryPrescription({ exerciseId: "leg_curls", sets: log, equipment: EQUIPMENT, handSetWeight: { weight: 90, setAt }, now: NOW });
    expect(p).toMatchObject({ weight: 90, planWeight: 75, setAt, basis: "hand", verdict: "up" });
    expect(p.note).toBe("Set by hand: the plan says 75 lb");
  });

  it("planWeight is null when it equals the hand-set weight or nothing was set by hand", () => {
    const same = accessoryPrescription({ exerciseId: "leg_curls", sets: log, equipment: EQUIPMENT, handSetWeight: { weight: 75, setAt }, now: NOW });
    expect(same).toMatchObject({ weight: 75, planWeight: null, basis: "hand" });
    const none = accessoryPrescription({ exerciseId: "leg_curls", sets: log, equipment: EQUIPMENT, now: NOW });
    expect(none).toMatchObject({ planWeight: null, setAt: null, basis: "progression" });
  });

  it("works for an exercise with no history (the plan has no weight)", () => {
    const p = accessoryPrescription({ exerciseId: "machine_row", sets: [], equipment: EQUIPMENT, handSetWeight: { weight: 80, setAt }, now: NOW });
    expect(p).toMatchObject({ weight: 80, planWeight: null, basis: "hand" });
  });

  it("progression takes over after a session logged after it was set", () => {
    const later = [...log, ...session("leg_curls", "w2", 2, 90, [12, 12, 11])];
    const p = accessoryPrescription({ exerciseId: "leg_curls", sets: later, equipment: EQUIPMENT, handSetWeight: { weight: 90, setAt }, now: NOW });
    expect(p).toMatchObject({ weight: 90, basis: "progression", verdict: "same", planWeight: null, setAt: null });
    expect(activeHandSetWeight({ weight: 90, setAt }, "leg_curls", later)).toBeNull();
  });

  it("a deleted later session (its sets no longer passed in) brings the hand-set weight back", () => {
    expect(activeHandSetWeight({ weight: 90, setAt }, "leg_curls", log)).toEqual({ weight: 90, setAt });
  });

  it("an imported session or a warm-up after it was set does not end it", () => {
    const sets = [
      ...log,
      set("leg_curls", "imp", 1, 60, 12, { imported: true }),
      set("leg_curls", "w3", 1, 30, 12, { role: "warmup" }),
    ];
    expect(activeHandSetWeight({ weight: 90, setAt }, "leg_curls", sets)).not.toBeNull();
  });

  it("the plan's weight keeps tracking the log while the hand-set weight is in force", () => {
    // A session logged before the hand-set weight changes the plan, not the hand-set weight.
    const more = [...session("leg_curls", "w0", 20, 65, [15, 15, 15]), ...session("leg_curls", "w1", 10, 70, [13, 12, 12])];
    const p = accessoryPrescription({ exerciseId: "leg_curls", sets: more, equipment: EQUIPMENT, handSetWeight: { weight: 90, setAt }, now: NOW });
    expect(p).toMatchObject({ weight: 90, planWeight: 70, verdict: "same" });
  });

  it("reads the stored weight from settings safely", () => {
    expect(handSetAccessoryWeight({ accessoryWeights: { leg_curls: { weight: 90, setAt } } }, "leg_curls", log)).toEqual({ weight: 90, setAt });
    expect(handSetAccessoryWeight({}, "leg_curls", log)).toBeNull();
    expect(handSetAccessoryWeight(null, "leg_curls", log)).toBeNull();
    expect(
      handSetAccessoryWeight({ accessoryWeights: { leg_curls: { weight: "heavy", setAt } } } as never, "leg_curls", log)
    ).toBeNull();
  });
});
