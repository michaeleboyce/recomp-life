/**
 * Remembered choices from the import screen: an exported name mapped to a library
 * exercise, or kept as a custom exercise with muscles the user picked. They are read
 * before the built-in table, so the user always has the final say. Pure.
 *
 * Overrides are keyed by `nameKey`, so a choice made for "Spider Curls" also applies
 * to "spider curl" in the next file. Keys stored under another spelling still work.
 */
import { EXERCISES } from "@/lib/exercises";
import { isMuscleId } from "@/lib/muscles";
import type { MuscleId } from "@/types";
import { nameKey } from "./normalise";
import type { ExerciseMapping, MappingOverride, MappingOverrides } from "./types";

const normalised = new WeakMap<MappingOverrides, Map<string, MappingOverride>>();

/** Overrides by normalised key. A later spelling of the same key replaces an earlier one. */
function byKey(overrides: MappingOverrides): Map<string, MappingOverride> {
  let map = normalised.get(overrides);
  if (!map) {
    map = new Map();
    for (const [name, choice] of Object.entries(overrides)) {
      const key = nameKey(name);
      if (key) map.set(key, choice);
    }
    normalised.set(overrides, map);
  }
  return map;
}

function muscles(list: readonly unknown[] | undefined, exclude: readonly MuscleId[] = []): MuscleId[] {
  const out: MuscleId[] = [];
  for (const m of list ?? []) {
    if (typeof m === "string" && isMuscleId(m) && !exclude.includes(m) && !out.includes(m)) out.push(m);
  }
  return out;
}

/** The mapping a stored choice stands for, or null when it no longer applies (an exercise that left the library). */
export function overrideMapping(choice: MappingOverride): ExerciseMapping | null {
  if (choice.kind === "exercise") {
    return EXERCISES[choice.exerciseId]
      ? { kind: "mapped", exerciseId: choice.exerciseId, confidence: "user" }
      : null;
  }
  if (choice.kind === "custom") {
    const primary = muscles(choice.primary);
    return { kind: "custom", muscles: { primary, secondary: muscles(choice.secondary, primary) }, confidence: "user" };
  }
  return null;
}

/** The user's mapping for a name, or null to fall through to the table. */
export function applyOverrides(name: string, overrides?: MappingOverrides): ExerciseMapping | null {
  if (!overrides) return null;
  const key = nameKey(name);
  if (!key) return null;
  const choice = byKey(overrides).get(key);
  return choice ? overrideMapping(choice) : null;
}

/** A copy of the overrides with this choice stored for the name (replacing any other spelling of it). */
export function rememberMapping(
  overrides: MappingOverrides,
  name: string,
  choice: MappingOverride
): MappingOverrides {
  const key = nameKey(name);
  if (!key) return { ...overrides };
  const next = forgetMapping(overrides, name);
  next[key] = choice;
  return next;
}

/** A copy of the overrides without any choice for the name, in any spelling. */
export function forgetMapping(overrides: MappingOverrides, name: string): MappingOverrides {
  const key = nameKey(name);
  const next: MappingOverrides = {};
  for (const [stored, choice] of Object.entries(overrides)) {
    if (nameKey(stored) !== key) next[stored] = choice;
  }
  return next;
}
