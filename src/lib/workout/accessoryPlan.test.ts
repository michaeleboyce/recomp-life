import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import type { StrengthSet } from "@/lib/strength";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState, PlanEdit, UserSettings } from "@/types";
import {
  accessoryAddEdit,
  accessoryDay,
  accessoryMinutes,
  accessoryRowsOf,
  accessoryWeekSets,
  planAccessories,
  prescribeAccessory,
  type AccessorySource,
} from "./accessoryPlan";
import { estimateSetSeconds } from "./duration";
import { planWorkoutStart } from "./startPlan";

// Made-up history only.

const NOW = new Date(2026, 5, 17, 9, 30); // a Wednesday, local time
/** A wall-clock time `daysAgo` calendar days before NOW, at `hour` local time. */
const at = (daysAgo: number, hour = 18) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d;
};

let n = 0;
function set(exerciseId: string, sessionId: string, date: Date, over: Partial<StrengthSet> = {}): StrengthSet {
  n += 1;
  return {
    id: `s${n}`,
    sessionId,
    exerciseId,
    weight: 25,
    perHand: false,
    reps: 15,
    rpe: null,
    role: "working",
    tier: "accessory",
    isAMRAP: true,
    date,
    ...over,
  };
}

/** Three sessions of curls, all sets at the top of 12-15 last time. */
const HISTORY: StrengthSet[] = [
  ...[14, 7, 2].flatMap((d) => [0, 1, 2].map(() => set("bicep_curls", `w${d}`, at(d)))),
  ...[14, 7].flatMap((d) => [0, 1, 2].map(() => set("lateral_raises", `w${d}`, at(d), { weight: 15, reps: 14 }))),
];

/** Curls pinned to A1, so they are always among its picks. */
const SETTINGS: UserSettings = { ...DEFAULT_USER_PROFILE.settings, accessoryPins: { A1: ["bicep_curls"] } };
const source = (over: Partial<AccessorySource> = {}): AccessorySource => ({
  settings: SETTINGS,
  strengthSets: HISTORY,
  now: NOW,
  ...over,
});
const A1_MAIN = [
  { exerciseId: "squat", sets: 5 },
  { exerciseId: "bench", sets: 3 },
  { exerciseId: "lat_pulldown", sets: 3 },
];
const planA1 = (over: Partial<AccessorySource> = {}, selected?: string[]) =>
  planAccessories({ templateId: "A1", mainLifts: A1_MAIN, location: "gym", source: source(over), selected });

describe("accessoryDay", () => {
  it("works the choice out at local noon and the prescriptions at the end of the day", () => {
    const { choose, prescribe } = accessoryDay(NOW);
    expect([choose.getHours(), choose.getDate()]).toEqual([12, NOW.getDate()]);
    expect([prescribe.getHours(), prescribe.getMinutes(), prescribe.getDate()]).toEqual([23, 59, NOW.getDate()]);
  });
});

describe("accessoryWeekSets", () => {
  it("counts this week's sets, primary 1 and secondary 0.5, without warm-ups or last week", () => {
    const monday = at(2, 10); // Monday of NOW's week
    const sets = [
      set("bicep_curls", "a", monday),
      set("bicep_curls", "a", monday),
      set("bicep_curls", "a", monday, { role: "warmup" }),
      set("bicep_curls", "b", at(9)),
      set("bench", "c", monday, { tier: "T1" }),
    ];
    const load = accessoryWeekSets(sets, NOW);
    expect(load.biceps).toBe(2);
    expect(load.chest).toBe(1);
    expect(load.triceps).toBe(0.5);
  });
});

describe("planAccessories", () => {
  it("with mode auto (the default) plans the picks, each at its prescription, as add edits", () => {
    const plan = planA1();
    expect(plan.mode).toBe("auto");
    expect(plan.planned.map((p) => p.exerciseId)).toEqual(plan.choice.picks.map((p) => p.exerciseId));
    expect(plan.planned.map((p) => p.exerciseId)).toContain("bicep_curls");
    const curls = plan.planned.find((p) => p.exerciseId === "bicep_curls")!;
    // Every set at 15 last time: up one 5 lb step.
    expect(curls.prescription).toMatchObject({ weight: 30, basis: "progression", verdict: "up" });
    expect(plan.edits).toContainEqual({ kind: "add", exerciseId: "bicep_curls", sets: 3, reps: 15, weight: 30, isAMRAP: true });
    expect(plan.edits).toHaveLength(plan.planned.length);
  });

  it("plans none with ask or none, but still ranks them for the sheet", () => {
    for (const accessories of ["ask", "none"] as const) {
      const plan = planA1({ settings: { ...SETTINGS, accessories } });
      expect(plan.planned).toEqual([]);
      expect(plan.edits).toEqual([]);
      expect(plan.choice.picks.length).toBeGreaterThan(0);
    }
  });

  it("plans accessories named outright instead of the choice, whatever the mode", () => {
    const plan = planA1({ settings: { ...SETTINGS, accessories: "none" } }, ["face_pulls", "face_pulls", "nonsense"]);
    expect(plan.planned.map((p) => p.exerciseId)).toEqual(["face_pulls"]);
  });

  it("gives the same picks and weights at any time of the same day", () => {
    const morning = planA1({ now: new Date(2026, 5, 17, 6, 0) });
    const night = planA1({ now: new Date(2026, 5, 17, 22, 45) });
    expect(night.planned).toEqual(morning.planned);
    expect(night.edits).toEqual(morning.edits);
  });

  it("a weight set by hand is planned, with the plan's beside it", () => {
    const plan = planA1({
      settings: { ...SETTINGS, accessoryWeights: { bicep_curls: { weight: 35, setAt: at(1).getTime() } } },
    });
    const curls = plan.planned.find((p) => p.exerciseId === "bicep_curls")!;
    expect(curls.prescription).toMatchObject({ weight: 35, planWeight: 30, basis: "hand" });
  });
});

describe("accessoryAddEdit and accessoryMinutes", () => {
  it("adds at the top of the range, 0 lb when there is no weight yet", () => {
    const p = prescribeAccessory("leg_curls", source({ strengthSets: [] }));
    expect(accessoryAddEdit(p)).toEqual({ kind: "add", exerciseId: "leg_curls", sets: 3, reps: 15, weight: 0, isAMRAP: true });
  });

  it("counts each set with the rest after it", () => {
    expect(accessoryMinutes(3)).toBe(Math.round((3 * estimateSetSeconds("accessory")) / 60));
  });
});

describe("planWorkoutStart with accessories (A6)", () => {
  const liftStates: LiftState[] = [];
  const start = (accessories?: AccessorySource, edits: PlanEdit[] = []) =>
    planWorkoutStart({
      template: WORKOUT_TEMPLATES.A1,
      liftStates,
      location: "gym",
      equipment: SETTINGS.equipment,
      includeWarmUps: true,
      selectedAccessories: [],
      edits,
      ...(accessories ? { accessories } : {}),
    });

  it("appends the accessories after the program's lifts and leaves the lifts and prescription as they were", () => {
    const without = start();
    const withAccessories = start(source());
    const program = (plan: typeof without.plan) => plan.filter((e) => e.tier !== "accessory");
    expect(program(withAccessories.plan)).toEqual(without.plan);
    expect(withAccessories.prescribed).toEqual(without.prescribed);
    const added = withAccessories.plan.filter((e) => e.tier === "accessory").map((e) => e.exerciseId);
    expect(added).toEqual(withAccessories.accessories!.planned.map((p) => p.exerciseId));
    expect(withAccessories.accessoryEdits).toEqual(withAccessories.accessories!.edits);
    expect(without.accessories).toBeNull();
    expect(without.accessoryEdits).toEqual([]);
  });

  it("lets the user's edits win over the choice", () => {
    const chosen = start(source()).accessories!.planned[0].exerciseId;
    const removed = start(source(), [{ kind: "remove", exerciseId: chosen, tier: "accessory" }]);
    expect(removed.plan.some((e) => e.exerciseId === chosen)).toBe(false);
    // The rows say what each entry is, and that the user's own addition was not chosen.
    const added = start(source(), [{ kind: "add", exerciseId: "face_pulls", sets: 2, reps: 20, weight: 20, isAMRAP: true }]);
    const rows = accessoryRowsOf(added.plan, added.accessories, source());
    const face = rows.find((r) => r.exerciseId === "face_pulls")!;
    expect(face.entry).toMatchObject({ targetSets: 2, targetReps: 20, weight: 20 });
    expect(face.chosen).toBe(added.accessories!.planned.some((p) => p.exerciseId === "face_pulls"));
    expect(rows.every((r) => r.prescription.exerciseId === r.exerciseId)).toBe(true);
  });
});
