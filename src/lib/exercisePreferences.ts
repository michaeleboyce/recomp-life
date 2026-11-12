import type {
  ExercisePreference,
  ExercisePreferences,
  LocationExercisePreferences,
  PreferenceScope,
  WorkoutLocation,
} from "@/types";

/** Returns the preference for an exercise, defaulting to "normal". */
export function getPreference(
  preferences: ExercisePreferences | undefined,
  exerciseId: string
): ExercisePreference {
  return preferences?.[exerciseId] ?? "normal";
}

// ─── Scoped preferences ──────────────────────────────────────────────────────
//
// A preference (blocked / normal / preferred) can be set overall, or for the
// gym or home only. A location entry overrides the overall one, including an
// explicit "normal" that switches an overall preference off at that location.

/** The preferences in effect at a location: overall, with that location's overrides applied. */
export function resolvePreferences(
  overall: ExercisePreferences | undefined,
  byLocation: LocationExercisePreferences | undefined,
  location: WorkoutLocation
): ExercisePreferences {
  return { ...(overall ?? {}), ...(byLocation?.[location] ?? {}) };
}

/** The preference shown for a scope: the overall one for "all", else the one in effect there. */
export function getScopedPreference(
  overall: ExercisePreferences | undefined,
  byLocation: LocationExercisePreferences | undefined,
  scope: PreferenceScope,
  exerciseId: string
): ExercisePreference {
  if (scope === "all") return getPreference(overall, exerciseId);
  return getPreference(resolvePreferences(overall, byLocation, scope), exerciseId);
}

/** True when a location has its own setting for the exercise. */
export function isLocationOverride(
  byLocation: LocationExercisePreferences | undefined,
  location: WorkoutLocation,
  exerciseId: string
): boolean {
  return byLocation?.[location]?.[exerciseId] !== undefined;
}

/**
 * Set a preference in a scope. Returns new objects; inputs are not modified.
 *
 * - Scope "all" edits the overall set ("normal" is stored as absence).
 * - A location scope stores an override, unless the chosen value is what the
 *   overall preference already gives, in which case any override is removed.
 */
export function setScopedPreference(
  overall: ExercisePreferences | undefined,
  byLocation: LocationExercisePreferences | undefined,
  scope: PreferenceScope,
  exerciseId: string,
  preference: ExercisePreference
): { overall: ExercisePreferences; byLocation: LocationExercisePreferences } {
  const nextOverall: ExercisePreferences = { ...(overall ?? {}) };
  const nextByLocation: LocationExercisePreferences = {
    ...(byLocation?.gym ? { gym: { ...byLocation.gym } } : {}),
    ...(byLocation?.home ? { home: { ...byLocation.home } } : {}),
  };

  if (scope === "all") {
    if (preference === "normal") delete nextOverall[exerciseId];
    else nextOverall[exerciseId] = preference;
    return { overall: nextOverall, byLocation: nextByLocation };
  }

  const forLocation: ExercisePreferences = { ...(nextByLocation[scope] ?? {}) };
  if (preference === getPreference(nextOverall, exerciseId)) {
    delete forLocation[exerciseId];
  } else {
    forLocation[exerciseId] = preference;
  }
  if (Object.keys(forLocation).length > 0) nextByLocation[scope] = forLocation;
  else delete nextByLocation[scope];
  return { overall: nextOverall, byLocation: nextByLocation };
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

/**
 * The accessories offered for a workout: every accessory marked "preferred"
 * (whether or not it is on the day's recommended list), followed by the rest
 * of the day's recommendations. Blocked exercises are dropped.
 *
 * Without this, an accessory that is not one of a day's fixed recommendations
 * could never be added to a workout.
 */
export function withPreferredAccessories(
  recommendationIds: string[],
  preferences: ExercisePreferences | undefined,
  accessoryIds: string[]
): string[] {
  if (!preferences) return recommendationIds;

  const onDay = new Set(recommendationIds);
  const preferred = [
    // Preferred recommendations keep the day's order; extras follow in
    // catalogue order.
    ...recommendationIds.filter((id) => getPreference(preferences, id) === "preferred"),
    ...accessoryIds.filter(
      (id) => !onDay.has(id) && getPreference(preferences, id) === "preferred"
    ),
  ];
  const rest = recommendationIds.filter(
    (id) => getPreference(preferences, id) === "normal"
  );
  return [...preferred, ...rest];
}
