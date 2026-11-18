import { describe, expect, it } from "vitest";
import type { AccessoryCandidate } from "@/lib/accessories/index";
import { EXERCISES } from "@/lib/exercises";
import {
  FOR_TODAY_COUNT,
  SWAP_ALTERNATIVES,
  addLists,
  mainMuscleOf,
  muscleChip,
  pickReasonLines,
  searchCandidates,
  swapAlternatives,
} from "./accessorySheetModel";

const ZERO = { pinned: 0, preferred: 0, habit: 0, shortfall: 0, dayFit: 0, recovery: 0, spread: 0 };
const c = (exerciseId: string, habit = 0): AccessoryCandidate => ({
  exerciseId,
  score: habit,
  parts: { ...ZERO, habit },
  reasons: [`Reason for ${exerciseId}`],
});

const RANKED = [
  c("bicep_curls", 20),
  c("hammer_curls", 5),
  c("lateral_raises"),
  c("face_pulls", 12),
  c("tricep_pushdowns"),
  c("leg_curls"),
  c("calf_raises"),
  c("leg_extensions"),
].filter((x) => EXERCISES[x.exerciseId]);

describe("accessory sheet lists", () => {
  it("offers alternatives for the same main muscle first, none already in the workout", () => {
    const alts = swapAlternatives("bicep_curls", RANKED, ["face_pulls"]);
    expect(alts.length).toBeLessThanOrEqual(SWAP_ALTERNATIVES);
    expect(alts.map((a) => a.exerciseId)).not.toContain("bicep_curls");
    expect(alts.map((a) => a.exerciseId)).not.toContain("face_pulls");
    if (RANKED.some((x) => x.exerciseId === "hammer_curls")) {
      expect(mainMuscleOf(alts[0].exerciseId)).toBe(mainMuscleOf("bicep_curls"));
    }
  });

  it("lists for today, your usual by habit, and every one by muscle", () => {
    const lists = addLists(RANKED, ["bicep_curls"]);
    expect(lists.forToday.length).toBeLessThanOrEqual(FOR_TODAY_COUNT);
    expect(lists.forToday.map((x) => x.exerciseId)).not.toContain("bicep_curls");
    expect(lists.usual.map((x) => x.exerciseId)[0]).toBe("face_pulls");
    expect(lists.usual.every((x) => x.parts.habit > 0)).toBe(true);
    const grouped = lists.byMuscle.flatMap((g) => g.items.map((i) => i.exerciseId)).sort();
    expect(grouped).toEqual(RANKED.map((x) => x.exerciseId).filter((id) => id !== "bicep_curls").sort());
    for (const group of lists.byMuscle) expect(group.label).toBe(muscleChip(group.muscle));
  });

  it("searches by name and muscle, every word", () => {
    expect(searchCandidates(RANKED, [], "curl").map((x) => x.exerciseId)).toEqual(
      RANKED.filter((x) => EXERCISES[x.exerciseId].name.toLowerCase().includes("curl")).map((x) => x.exerciseId)
    );
    expect(searchCandidates(RANKED, [], "   ")).toEqual([]);
    expect(searchCandidates(RANKED, ["face_pulls"], "face")).toEqual([]);
  });

  it("a pick's row: the reason it earned, then a quieter note for the gym exercise it replaces at home", () => {
    const fly: AccessoryCandidate = {
      ...c("db_fly", 10),
      reasons: ["Always on this day", "You usually do this on bench days", "At home instead of Machine Chest Fly"],
      insteadOf: "machine_chest_fly",
    };
    expect(pickReasonLines(fly, { pinShown: true })).toEqual({
      reason: "You usually do this on bench days",
      note: "At home instead of Machine Chest Fly",
    });
    expect(pickReasonLines(fly, { pinShown: false }).reason).toBe("Always on this day");
    expect(pickReasonLines(c("bicep_curls"), { pinShown: true })).toEqual({ reason: "Reason for bicep_curls", note: null });
    const onlyHome: AccessoryCandidate = { ...c("db_fly"), reasons: ["At home instead of Machine Chest Fly"], insteadOf: "machine_chest_fly" };
    expect(pickReasonLines(onlyHome, { pinShown: true })).toEqual({ reason: null, note: "At home instead of Machine Chest Fly" });
  });
});
