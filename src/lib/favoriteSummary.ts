import { templateTitle } from "@/lib/workoutNames";
import { EXERCISES } from "@/lib/exercises";
import type { FavoriteWorkout, Tier } from "@/types";

export interface FavoriteExerciseSummary {
  name: string;
  tier: Tier;
  tierLabel: string;
  /** "5×3 · 190 lbs" */
  text: string;
}

export interface FavoriteSummary {
  dayLabel: string;
  locationLabel: "Gym" | "Home";
  exercises: FavoriteExerciseSummary[];
  exerciseCount: number;
  lastUsedText: string;
}

/** Days after which "N days ago" gives way to a calendar date. */
const RELATIVE_DAYS_LIMIT = 14;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function lastUsedText(lastUsedAt: Date | undefined, now: Date): string {
  if (!lastUsedAt) return "Never used";
  const days = Math.round((startOfDay(now) - startOfDay(new Date(lastUsedAt))) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= RELATIVE_DAYS_LIMIT) return `${days} days ago`;
  return new Date(lastUsedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Plain display data for a favourite. `now` is passed in so this stays pure. */
export function summariseFavorite(favorite: FavoriteWorkout, now: Date): FavoriteSummary {
  const exercises = favorite.snapshot.map((entry) => {
    // A saved exercise the catalogue no longer has still shows, by id, rather than crashing.
    const exercise = EXERCISES[entry.exerciseId];
    const weight =
      entry.weight === 0 && exercise?.type === "bodyweight" ? "bodyweight" : `${entry.weight} lbs`;
    return {
      name: exercise?.name ?? entry.exerciseId,
      tier: entry.tier,
      tierLabel: entry.tier,
      text: `${entry.sets}×${entry.reps}${entry.isAMRAP ? "+" : ""} · ${weight}`,
    };
  });
  return {
    dayLabel: templateTitle(favorite.templateId),
    locationLabel: favorite.location === "gym" ? "Gym" : "Home",
    exercises,
    exerciseCount: exercises.length,
    lastUsedText: lastUsedText(favorite.lastUsedAt, now),
  };
}
