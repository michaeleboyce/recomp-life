import { buildWorkoutPlan } from "@/lib/workout/buildPlan";
import { favoriteFromSetup } from "@/lib/favorites";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { EQUIPMENT, seedLiftStates } from "@/lib/workout/testFixtures";
import type { FavoriteWorkout } from "@/types";

/** A favourite built the way the app builds one, for component tests. */
export function testFavorite(
  id: string,
  name: string,
  options: { templateId?: string; lastUsedAt?: Date; createdAt?: Date } = {}
): FavoriteWorkout {
  const templateId = options.templateId ?? "A1";
  const plan = buildWorkoutPlan({
    template: WORKOUT_TEMPLATES[templateId],
    liftStates: seedLiftStates(),
    location: "gym",
    equipment: EQUIPMENT,
    includeWarmUps: false,
    selectedAccessories: [],
  });
  const favorite = favoriteFromSetup(
    { id, clientId: `${id}-client`, name, now: options.createdAt ?? new Date(2026, 10, 1) },
    {
      templateId,
      location: "gym",
      includeWarmUps: false,
      selectedAccessories: [],
      substitutes: {},
      edits: [],
      plan,
    }
  );
  return { ...favorite, lastUsedAt: options.lastUsedAt };
}
