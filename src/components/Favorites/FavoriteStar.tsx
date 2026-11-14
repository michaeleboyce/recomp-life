"use client";

import { toast } from "@/components/ui/toast";
import { useFavoriteWorkouts, useWorkout } from "@/hooks";
import { deleteFavorite, saveFavoriteFromSession } from "@/lib/data/favorites";
import { favoriteForSession } from "@/lib/favorites";
import { FavoriteStarButton } from "./FavoriteStarButton";

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** "A1 · 10 Nov": the day and the date it was done. */
function defaultName(templateId: string, when: Date | string): string {
  return `${templateId} · ${DAY_MONTH.format(new Date(when))}`;
}

/**
 * Star toggle for a finished workout: on saves it as a favourite, off removes that
 * favourite. Shows nothing for a workout that is missing, deleted or not finished.
 */
export function FavoriteStar({ sessionId, className }: { sessionId: string; className?: string }) {
  const session = useWorkout(sessionId);
  const favorites = useFavoriteWorkouts();

  if (!session || session.completedAt == null || favorites === undefined) return null;
  const saved = favoriteForSession(favorites, session.id);

  const toggle = async () => {
    try {
      if (saved) {
        await deleteFavorite(saved.id);
        toast({ message: "Removed from favourites" });
      } else {
        await saveFavoriteFromSession(session, defaultName(session.templateId, session.completedAt!));
        toast({ message: "Saved to favourites" });
      }
    } catch {
      toast({ message: "Could not update favourites. Try again." });
    }
  };

  return <FavoriteStarButton active={Boolean(saved)} onToggle={() => void toggle()} className={className} />;
}
