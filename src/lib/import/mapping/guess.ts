/**
 * A muscle guess for an exported exercise name the table does not know, read from
 * its words ("curl" trains the biceps, "fly" the chest). Pure.
 *
 * The guess is only ever muscles: it never names a library exercise, so an unknown
 * name can never be counted as a program lift. The import screen lists every guess
 * for the user to confirm or change.
 */
import type { MuscleId } from "@/types";
import { nameTokens } from "./normalise";
import type { MuscleSet } from "./types";

export interface GuessRule {
  /** Every one of these words must be in the name. */
  all?: string[];
  /** At least one of these words must be in the name. */
  any?: string[];
  primary: MuscleId[];
  secondary?: MuscleId[];
}

const CHEST_PRESS = ["bench", "chest", "floor", "squeeze", "incline", "decline", "cable"];
const SHOULDER_PRESS = ["shoulder", "overhead", "military", "arnold", "push"];
const CORE = ["crunch", "plank", "rollout", "hollow", "scissor", "flutter", "abdominal", "ab", "abs"];

/** Read in order; the first rule that fits wins, so specific phrases come first. */
export const GUESS_RULES: readonly GuessRule[] = [
  // Two movements in one
  { all: ["squat", "press"], primary: ["quads", "glutes", "front_delts"], secondary: ["triceps"] },
  { all: ["curl", "press"], primary: ["biceps", "front_delts"], secondary: ["triceps"] },

  // Calves and curls
  { any: ["calf"], primary: ["calves"] },
  { all: ["curl"], any: ["leg", "hamstring"], primary: ["hamstrings"], secondary: ["calves"] },
  { all: ["curl", "wrist"], primary: ["forearms"] },
  { all: ["curl", "reverse"], primary: ["forearms"], secondary: ["biceps"] },
  { all: ["curl", "hammer"], primary: ["biceps", "forearms"] },
  { all: ["curl"], primary: ["biceps"], secondary: ["forearms"] },

  // Triceps
  { all: ["close", "grip", "bench"], primary: ["triceps", "chest"], secondary: ["front_delts"] },
  { any: ["tricep", "skullcrusher", "pushdown", "tate"], primary: ["triceps"] },
  { all: ["kickback"], any: ["glute", "leg", "hip", "donkey"], primary: ["glutes"], secondary: ["hamstrings"] },
  { all: ["kickback"], primary: ["triceps"] },
  { any: ["dip"], primary: ["triceps"], secondary: ["chest", "front_delts"] },

  // Shoulders and upper back
  { all: ["rear"], any: ["delt", "fly", "raise"], primary: ["rear_delts"], secondary: ["mid_back"] },
  { all: ["fly"], any: ["reverse", "back"], primary: ["rear_delts"], secondary: ["mid_back"] },
  { all: ["face", "pull"], primary: ["rear_delts"], secondary: ["mid_back", "rotator_cuff"] },
  { all: ["upright", "row"], primary: ["side_delts", "upper_traps"] },

  // Raises: legs and hips before shoulders
  { all: ["side", "leg"], primary: ["glutes"] },
  { all: ["raise"], any: ["leg", "knee"], primary: ["abs"], secondary: ["obliques"] },
  { all: ["raise"], any: ["hip"], primary: ["glutes"], secondary: ["hamstrings"] },
  { all: ["raise"], any: ["front", "forward"], primary: ["front_delts"], secondary: ["side_delts"] },
  { all: ["raise"], any: ["lateral"], primary: ["side_delts"], secondary: ["upper_traps"] },
  { any: ["raise"], primary: ["side_delts"], secondary: ["front_delts"] },

  // Push
  { all: ["push", "up"], any: ["pike"], primary: ["front_delts"], secondary: ["triceps"] },
  { all: ["push", "up"], primary: ["chest"], secondary: ["triceps", "front_delts"] },
  { all: ["press", "leg"], primary: ["quads", "glutes"], secondary: ["hamstrings"] },
  { all: ["press"], any: SHOULDER_PRESS, primary: ["front_delts"], secondary: ["side_delts", "triceps"] },
  { all: ["press"], any: CHEST_PRESS, primary: ["chest"], secondary: ["front_delts", "triceps"] },
  { any: ["fly", "pec"], primary: ["chest"], secondary: ["front_delts"] },

  // Pull
  { any: ["pulldown", "chin"], primary: ["lats"], secondary: ["biceps", "mid_back"] },
  { all: ["pull", "up"], primary: ["lats"], secondary: ["biceps", "mid_back"] },
  { any: ["pullover"], primary: ["lats"], secondary: ["chest"] },

  // Hinges and hips (before rows, so "deadlift to row" reads as a hinge)
  { all: ["good", "morning"], primary: ["hamstrings", "lower_back"], secondary: ["glutes"] },
  { all: ["deadlift"], any: ["romanian", "stiff", "single"], primary: ["hamstrings", "glutes"], secondary: ["lower_back"] },
  { any: ["deadlift"], primary: ["glutes", "hamstrings", "lower_back"], secondary: ["quads", "forearms"] },
  { any: ["shrug"], primary: ["upper_traps"] },
  { any: ["farmer", "carry"], primary: ["forearms", "upper_traps"], secondary: ["abs"] },
  { any: ["swing"], primary: ["glutes", "hamstrings"], secondary: ["lower_back"] },
  { all: ["pull", "through"], primary: ["glutes", "hamstrings"] },
  { all: ["side", "bridge"], primary: ["obliques"], secondary: ["abs"] },
  { any: ["thrust", "bridge"], primary: ["glutes"], secondary: ["hamstrings"] },
  { any: ["clam", "abduction", "abductor"], primary: ["glutes"] },
  { all: ["kick", "rear"], primary: ["glutes"], secondary: ["hamstrings"] },
  { any: ["adduction", "adductor"], primary: ["adductors"] },
  { any: ["row"], primary: ["mid_back", "lats"], secondary: ["biceps", "rear_delts"] },

  // Legs
  { all: ["leg", "extension"], primary: ["quads"] },
  { all: ["wall", "sit"], primary: ["quads"] },
  { any: ["squat", "lunge"], primary: ["quads", "glutes"], secondary: ["adductors", "hamstrings"] },
  { all: ["step", "up"], primary: ["quads", "glutes"], secondary: ["hamstrings"] },

  // Lower back and core
  { all: ["back", "extension"], primary: ["lower_back"], secondary: ["glutes", "hamstrings"] },
  { any: ["hyperextension", "superman"], primary: ["lower_back"], secondary: ["glutes"] },
  { any: ["oblique", "twist", "woodchop", "bicycle"], primary: ["obliques"], secondary: ["abs"] },
  { all: ["sit", "up"], primary: ["abs"], secondary: ["obliques"] },
  { all: ["dead", "bug"], primary: ["abs"] },
  { all: ["pull", "in"], primary: ["abs"] },
  { any: CORE, primary: ["abs"], secondary: ["obliques"] },
];

function fits(rule: GuessRule, words: ReadonlySet<string>): boolean {
  if (rule.all && !rule.all.every((w) => words.has(w))) return false;
  if (rule.any && !rule.any.some((w) => words.has(w))) return false;
  return true;
}

/** The muscles the name's words suggest, or null when no word is recognised. */
export function guessMuscles(name: string): MuscleSet | null {
  const words = new Set(nameTokens(name));
  if (words.size === 0) return null;
  const rule = GUESS_RULES.find((r) => fits(r, words));
  if (!rule) return null;
  const primary = [...rule.primary];
  const secondary = (rule.secondary ?? []).filter((m) => !primary.includes(m));
  return { primary, secondary };
}
