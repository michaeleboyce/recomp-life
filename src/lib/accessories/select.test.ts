import { describe, expect, it } from "vitest";
import { STRENGTH_POOLING, type StrengthSet } from "@/lib/strength";
import { ACCESSORY_RECOMMENDATIONS } from "@/lib/workoutTemplates";
import {
  ACCESSORY_DAY_FIT_WEIGHT,
  ACCESSORY_HABIT_WEIGHT,
  ACCESSORY_PIN_SCORE,
  ACCESSORY_PREFERRED_WEIGHT,
  ACCESSORY_RECOVERY_PENALTY,
  ACCESSORY_SHORTFALL_FULL_SETS,
  ACCESSORY_SHORTFALL_WEIGHT,
  ACCESSORY_SPREAD_PENALTY,
  WEEKLY_SET_TARGET,
  chooseAccessories,
  type ChooseAccessoriesInput,
} from "./select";

// Made-up history only.

const NOW = new Date("2026-06-15T12:00:00Z");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

let n = 0;
function s(exerciseId: string, sessionId: string, ago: number, over: Partial<StrengthSet> = {}): StrengthSet {
  n += 1;
  return {
    id: `x${n}`,
    sessionId,
    exerciseId,
    weight: 20,
    perHand: false,
    reps: 12,
    repsInReserve: null,
    role: "working",
    tier: "accessory",
    isAMRAP: false,
    date: daysAgo(ago),
    ...over,
  };
}

const A1_MAIN = [
  { exerciseId: "squat", sets: 5 },
  { exerciseId: "bench", sets: 3 },
  { exerciseId: "lat_pulldown", sets: 3 },
];

/** A week where every muscle is at the target, so shortfall says nothing unless a test sets it. */
const FULL_WEEK = Object.fromEntries(
  ["chest", "front_delts", "side_delts", "rear_delts", "biceps", "triceps", "mid_back", "lats", "lower_back", "abs", "glutes", "quads", "hamstrings", "calves"].map(
    (m) => [m, WEEKLY_SET_TARGET]
  )
);

function input(over: Partial<ChooseAccessoriesInput> = {}): ChooseAccessoriesInput {
  return {
    templateId: "A1",
    mainLifts: A1_MAIN,
    location: "gym",
    phase: { mode: "maintaining" },
    history: [s("bicep_curls", "old", 200)],
    weekSetsSoFar: FULL_WEEK,
    now: NOW,
    ...over,
  };
}

const all = (r: ReturnType<typeof chooseAccessories>) => [...r.picks, ...r.others];
const find = (r: ReturnType<typeof chooseAccessories>, id: string) => all(r).find((c) => c.exerciseId === id);

describe("chooseAccessories: score parts", () => {
  it("a. pins are always in, in pin order, even past the cap", () => {
    const r = chooseAccessories(input({ pins: ["calf_raises", "hack_squat", "face_pulls", "reverse_fly"] }));
    expect(r.picks.map((p) => p.exerciseId)).toEqual(["calf_raises", "hack_squat", "face_pulls", "reverse_fly"]);
    expect(r.picks[0].parts.pinned).toBe(ACCESSORY_PIN_SCORE);
    expect(r.picks[0].reasons[0]).toBe("Always on this day");
  });

  it("b. a preferred exercise gets the preferred weight and a reason", () => {
    const r = chooseAccessories(input({ preferences: { reverse_fly: "preferred" } }));
    const c = find(r, "reverse_fly")!;
    expect(c.parts.preferred).toBe(ACCESSORY_PREFERRED_WEIGHT);
    expect(c.reasons).toContain("You marked this preferred");
    expect(r.picks.map((p) => p.exerciseId)).toContain("reverse_fly");
  });

  it("b. a preference at this location counts; one for the other location does not", () => {
    const r = chooseAccessories(input({ preferencesByLocation: { home: { reverse_fly: "preferred" } } }));
    expect(find(r, "reverse_fly")!.parts.preferred).toBe(0);
  });

  it("c. habit grows with sessions and halves with age", () => {
    const recent = chooseAccessories(input({ history: [s("hammer_curls", "h1", 0)] }));
    const old = chooseAccessories(input({ history: [s("hammer_curls", "h1", STRENGTH_POOLING.evidenceHalfLifeDays)] }));
    const many = chooseAccessories(input({ history: [s("hammer_curls", "h1", 0), s("hammer_curls", "h2", 1), s("hammer_curls", "h3", 2)] }));
    const r = find(recent, "hammer_curls")!.parts.habit;
    const o = find(old, "hammer_curls")!.parts.habit;
    const m = find(many, "hammer_curls")!.parts.habit;
    expect(o).toBeGreaterThan(0);
    expect(o).toBeLessThan(r);
    expect(m).toBeGreaterThan(r);
    expect(m).toBeLessThanOrEqual(ACCESSORY_HABIT_WEIGHT);
    expect(find(recent, "face_pulls")!.parts.habit).toBe(0);
  });

  it("c. habit on this kind of day counts more and says so", () => {
    const onSquatDays = [0, 4, 8].flatMap((ago, i) => [s("squat", `d${i}`, ago, { tier: "T1" }), s("hammer_curls", `d${i}`, ago)]);
    const onOtherDays = [0, 4, 8].flatMap((ago, i) => [s("deadlift", `d${i}`, ago, { tier: "T1" }), s("hammer_curls", `d${i}`, ago)]);
    const day = find(chooseAccessories(input({ history: onSquatDays })), "hammer_curls")!;
    const other = find(chooseAccessories(input({ history: onOtherDays })), "hammer_curls")!;
    expect(day.parts.habit).toBeGreaterThan(other.parts.habit);
    expect(day.reasons).toContain("You usually do this on squat days");
    expect(other.reasons).toContain("You did this 3 times in the last 4 weeks");
  });

  it("d. shortfall is measured against the weekly target and named in sets", () => {
    const r = chooseAccessories(input({ weekSetsSoFar: { ...FULL_WEEK, side_delts: WEEKLY_SET_TARGET - 4 } }));
    const c = find(r, "lateral_raises")!;
    expect(c.parts.shortfall).toBeCloseTo(ACCESSORY_SHORTFALL_WEIGHT * (4 / ACCESSORY_SHORTFALL_FULL_SETS), 2);
    expect(c.reasons).toContain("Side delts are 4 sets short this week");
    expect(find(r, "bicep_curls")!.parts.shortfall).toBe(0);
  });

  it("d. shortfall counts the sets today's main lifts will add", () => {
    const week = { ...FULL_WEEK, quads: 4 };
    const withLifts = find(chooseAccessories(input({ weekSetsSoFar: week })), "leg_extensions")!;
    const without = find(chooseAccessories(input({ weekSetsSoFar: week, mainLifts: [] })), "leg_extensions")!;
    // The squat's 5 sets leave the quads 1 set short instead of 6.
    expect(withLifts.parts.shortfall).toBeCloseTo(ACCESSORY_SHORTFALL_WEIGHT * (1 / ACCESSORY_SHORTFALL_FULL_SETS), 2);
    expect(without.parts.shortfall).toBe(ACCESSORY_SHORTFALL_WEIGHT);
  });

  it("e. day fit favours muscles today's main lifts leave alone", () => {
    const r = chooseAccessories(input());
    expect(find(r, "leg_extensions")!.parts.dayFit).toBe(0);
    expect(find(r, "leg_extensions")!.reasons).toContain("Today's main lifts already work the quads");
    expect(find(r, "calf_raises")!.parts.dayFit).toBe(ACCESSORY_DAY_FIT_WEIGHT);
    // Lat pulldown works the biceps as a secondary muscle: 1.5 sets of 3.
    expect(find(r, "bicep_curls")!.parts.dayFit).toBeCloseTo(ACCESSORY_DAY_FIT_WEIGHT / 2, 2);
  });

  it("f. a muscle still recovering is passed over", () => {
    const fresh = chooseAccessories(input({ preferences: { reverse_fly: "preferred", lateral_raises: "preferred" } }));
    const tired = chooseAccessories(
      input({ preferences: { reverse_fly: "preferred", lateral_raises: "preferred" }, recovery: { side_delts: "recovering" } })
    );
    const c = find(tired, "lateral_raises")!;
    expect(c.parts.recovery).toBe(-ACCESSORY_RECOVERY_PENALTY);
    expect(c.reasons).toContain("Side delts are still recovering");
    expect(c.score).toBeLessThan(find(fresh, "lateral_raises")!.score);
  });

  it("g. spread: no second pick with the same primary muscle unless it is short", () => {
    const prefs = { lateral_raises: "preferred", seated_lateral_raises: "preferred" } as const;
    const r = chooseAccessories(input({ preferences: prefs }));
    const ids = r.picks.map((p) => p.exerciseId);
    expect(ids).toContain("lateral_raises");
    expect(ids).not.toContain("seated_lateral_raises");
    const second = find(r, "seated_lateral_raises")!;
    expect(second.parts.spread).toBe(-ACCESSORY_SPREAD_PENALTY);
    expect(second.reasons).toContain("Another pick already works the side delts");

    const short = chooseAccessories(input({ preferences: prefs, weekSetsSoFar: { ...FULL_WEEK, side_delts: 0 } }));
    expect(short.picks.map((p) => p.exerciseId)).toEqual(expect.arrayContaining(["lateral_raises", "seated_lateral_raises"]));
    expect(find(short, "seated_lateral_raises")!.parts.spread).toBe(0);
  });

  it("orders the parts by weight: preferred beats a strong habit", () => {
    const history = [0, 2, 4, 6, 8].map((ago) => s("hammer_curls", `h${ago}`, ago));
    const r = chooseAccessories(input({ history, preferences: { reverse_fly: "preferred" } }));
    expect(find(r, "reverse_fly")!.score).toBeGreaterThan(find(r, "hammer_curls")!.score);
  });
});

describe("chooseAccessories: rules", () => {
  it("never offers a blocked exercise, pinned or not", () => {
    const r = chooseAccessories(
      input({ pins: ["face_pulls"], preferences: { face_pulls: "blocked", calf_raises: "blocked" }, history: [] })
    );
    expect(all(r).map((c) => c.exerciseId)).not.toContain("face_pulls");
    expect(all(r).map((c) => c.exerciseId)).not.toContain("calf_raises");
  });

  it("holds the phase's cap", () => {
    expect(chooseAccessories(input()).picks).toHaveLength(3);
    expect(chooseAccessories(input({ phase: { mode: "bulking" } })).picks).toHaveLength(4);
    expect(chooseAccessories(input({ phase: { mode: "cutting" } })).picks).toHaveLength(3);
  });

  it("at home replaces a gym-only exercise with its home alternative, or leaves it out", () => {
    const r = chooseAccessories(input({ location: "home", pins: ["hack_squat", "barbell_rdl"], mainLifts: [{ exerciseId: "goblet_squat", sets: 5 }] }));
    const ids = all(r).map((c) => c.exerciseId);
    expect(r.picks[0].exerciseId).toBe("db_lunge");
    expect(r.picks[0].reasons).toContain("At home instead of Hack Squat");
    expect(ids).not.toContain("barbell_rdl");
    expect(ids).not.toContain("hack_squat");
    expect(ids).not.toContain("face_pulls");
  });

  it("at home with no bench leaves out bench exercises", () => {
    const r = chooseAccessories(input({ location: "home", equipment: { hasBench: false } }));
    expect(all(r).map((c) => c.exerciseId)).not.toContain("incline_db_curl");
    const withBench = chooseAccessories(input({ location: "home", equipment: { hasBench: true } }));
    expect(all(withBench).map((c) => c.exerciseId)).toContain("incline_db_curl");
  });

  it("never offers today's main lifts", () => {
    const r = chooseAccessories(input({ location: "home", mainLifts: [{ exerciseId: "db_lunge", sets: 5 }] }));
    expect(all(r).map((c) => c.exerciseId)).not.toContain("db_lunge");
  });

  it("is deterministic: the same input, in any history order, gives the same output", () => {
    const history = [s("hammer_curls", "a", 1), s("face_pulls", "b", 3), s("squat", "a", 1, { tier: "T1" }), s("leg_curls", "c", 9)];
    const a = chooseAccessories(input({ history }));
    const b = chooseAccessories(input({ history: [...history].reverse() }));
    expect(b).toEqual(a);
    expect(chooseAccessories(input({ history }))).toEqual(a);
  });

  it("gives every row its parts, a score that adds them up, and at least one reason", () => {
    const r = chooseAccessories(input({ history: [s("hammer_curls", "a", 1)] }));
    for (const c of all(r)) {
      const p = c.parts;
      expect(c.score).toBeCloseTo(p.pinned + p.preferred + p.habit + p.shortfall + p.dayFit + p.recovery + p.spread, 1);
      expect(c.reasons.length, c.exerciseId).toBeGreaterThan(0);
    }
    for (let i = 1; i < r.others.length; i += 1) expect(r.others[i - 1].score).toBeGreaterThanOrEqual(r.others[i].score);
  });
});

describe("chooseAccessories: no history", () => {
  it("falls back to the day's fixed list, so a new lifter sees what they saw", () => {
    for (const templateId of ["A1", "B1", "A2", "B2"]) {
      const r = chooseAccessories(input({ templateId, history: [], weekSetsSoFar: {} }));
      expect(r.fromDayList).toBe(true);
      expect(r.picks.map((p) => p.exerciseId)).toEqual(ACCESSORY_RECOMMENDATIONS[templateId].slice(0, 3));
      expect(r.picks[0].reasons).toContain("Suggested for this day");
    }
  });

  it("puts preferred ones and pins first, then the day's list", () => {
    const r = chooseAccessories(input({ history: [], pins: ["calf_raises"], preferences: { reverse_fly: "preferred" } }));
    expect(r.picks.map((p) => p.exerciseId)).toEqual(["calf_raises", "reverse_fly", "face_pulls"]);
  });

  it("at home uses the day's list with the home alternatives, as the picker does", () => {
    const r = chooseAccessories(input({ history: [], location: "home" }));
    expect(r.picks.map((p) => p.exerciseId)).toEqual(["lateral_raises", "hip_thrust", "ab_rollout"]);
  });

  it("main-lift history alone is not accessory history", () => {
    const r = chooseAccessories(input({ history: [s("squat", "a", 1, { tier: "T1" })] }));
    expect(r.fromDayList).toBe(true);
  });
});
