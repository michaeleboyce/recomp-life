import type { ExercisePreference, ExercisePreferences } from "@/types";

/** Returns the preference for an exercise, defaulting to "normal". */
export function getPreference(
  preferences: ExercisePreferences | undefined,
  exerciseId: string
): ExercisePreference {
  return preferences?.[exerciseId] ?? "normal";
}

/**
 * Filters out blocked exercises and stable-sorts preferred ones to the front.
 *
 * Input:  ["face_pulls", "lateral_raises", "leg_curls", "ab_rollout"]
 * Prefs:  { leg_curls: "blocked", face_pulls: "preferred" }
 * Output: ["face_pulls", "lateral_raises", "ab_rollout"]
 */
export function applyPreferences(
  recommendationIds: string[],
  preferences: ExercisePreferences | undefined
): string[] {
  if (!preferences) return recommendationIds;

  const filtered = recommendationIds.filter(
    (id) => getPreference(preferences, id) !== "blocked"
  );

  // Stable sort: preferred first, then normal (preserving original order within each group)
  return filtered.sort((a, b) => {
    const aPref = getPreference(preferences, a) === "preferred" ? 0 : 1;
    const bPref = getPreference(preferences, b) === "preferred" ? 0 : 1;
    return aPref - bPref;
  });
}
