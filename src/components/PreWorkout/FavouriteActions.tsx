"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { FavoritePickerSheet } from "@/components/Favorites/FavoritePickerSheet";
import { SaveFavoriteDialog } from "@/components/Favorites/SaveFavoriteDialog";
import { templateTitle } from "@/lib/workoutNames";
import { useFavoriteWorkouts } from "@/hooks";
import { saveFavoriteFromSetup } from "@/lib/data/favorites";
import type { FavoriteMode } from "@/lib/favorites";
import type { WorkoutSetup } from "./useWorkoutSetup";

/** The home substitutes the plan actually uses: template exercise id -> chosen substitute id. */
function chosenSubstitutes(setup: WorkoutSetup): Record<string, string> {
  const substitutes: Record<string, string> = {};
  for (const { templateExercise, chosenExerciseId } of setup.homeAdaptations) {
    if (chosenExerciseId) substitutes[templateExercise.exerciseId] = chosenExerciseId;
  }
  return substitutes;
}

/**
 * "Favourites" opens the saved workouts; "Save as favourite" keeps this set-up (day,
 * location, warm-ups, accessories, substitutes, edits and the plan as previewed).
 * `appliedName` is the favourite this screen was started from, if any.
 */
export function FavouriteActions({
  setup,
  appliedName,
}: {
  setup: WorkoutSetup;
  appliedName?: string;
}) {
  const router = useRouter();
  const favorites = useFavoriteWorkouts();
  const [now] = useState(() => new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const start = (favoriteId: string, mode: FavoriteMode) => {
    setPickerOpen(false);
    router.replace(`/workout/configure?favorite=${encodeURIComponent(favoriteId)}&mode=${mode}`);
  };

  const save = async (name: string) => {
    if (!setup.templateId) return;
    try {
      await saveFavoriteFromSetup(name, {
        templateId: setup.templateId,
        location: setup.location,
        includeWarmUps: setup.warmUps,
        selectedAccessories: setup.selectedAccessories,
        substitutes: chosenSubstitutes(setup),
        edits: setup.edits,
        plan: setup.plan,
      });
      setSaveOpen(false);
      toast({ message: "Saved to favourites" });
    } catch {
      toast({ message: "Could not save the favourite. Try again." });
    }
  };

  return (
    <div className="flex gap-2">
      <Button variant="secondary" className="min-h-11 flex-1" onClick={() => setPickerOpen(true)}>
        <Star className="size-4" aria-hidden="true" />
        Favourites
      </Button>
      <Button variant="secondary" className="min-h-11 flex-1" onClick={() => setSaveOpen(true)}>
        <BookmarkPlus className="size-4" aria-hidden="true" />
        Save as favourite
      </Button>

      <FavoritePickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        favorites={favorites ?? []}
        now={now}
        onStart={(favorite, mode) => start(favorite.id, mode)}
      />
      <SaveFavoriteDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        defaultName={appliedName ?? (setup.templateId ? templateTitle(setup.templateId) : "")}
        onSave={save}
      />
    </div>
  );
}
