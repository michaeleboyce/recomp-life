"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { FavoriteMode } from "@/lib/favorites";
import type { FavoriteWorkout } from "@/types";
import { FavoriteList } from "./FavoriteList";

/** Pick a saved workout and how to start it. Start only: managing favourites is elsewhere. */
export function FavoritePickerSheet({
  open,
  onOpenChange,
  favorites,
  now,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  favorites: FavoriteWorkout[];
  now: Date;
  onStart: (favorite: FavoriteWorkout, mode: FavoriteMode) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "mx-auto flex max-h-[85dvh] max-w-lg flex-col gap-0 overflow-y-auto rounded-t-3xl border-border bg-card px-5 pt-5",
          "pb-[calc(env(safe-area-inset-bottom)+20px)]"
        )}
      >
        <SheetTitle className="pr-8 text-lg">Favourites</SheetTitle>
        <SheetDescription className="mb-3 text-sm text-muted-foreground">
          Start a saved workout.
        </SheetDescription>
        <FavoriteList
          favorites={favorites}
          now={now}
          onStart={(favoriteId, mode) => {
            const favorite = favorites.find((f) => f.id === favoriteId);
            if (favorite) onStart(favorite, mode);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
