"use client";

import { Star } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { listFavorites, type FavoriteMode } from "@/lib/favorites";
import type { FavoriteWorkout } from "@/types";
import { FavoriteCard } from "./FavoriteCard";

/** Saved workouts, most recently used first. Callbacks receive the favourite's id. */
export function FavoriteList({
  favorites,
  now,
  onStart,
  onRename,
  onDelete,
}: {
  favorites: FavoriteWorkout[];
  now: Date;
  onStart: (favoriteId: string, mode: FavoriteMode) => void;
  onRename?: (favoriteId: string, name: string) => void;
  onDelete?: (favoriteId: string) => void;
}) {
  const visible = listFavorites(favorites);

  if (visible.length === 0) {
    return (
      <EmptyState
        icon={<Star />}
        title="No favourites yet"
        body="Save a workout from the start screen, or star a finished one, and it will show up here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {visible.map((favorite) => (
        <li key={favorite.id}>
          <FavoriteCard
            favorite={favorite}
            now={now}
            onStart={(mode) => onStart(favorite.id, mode)}
            onRename={onRename && ((name) => onRename(favorite.id, name))}
            onDelete={onDelete && (() => onDelete(favorite.id))}
          />
        </li>
      ))}
    </ul>
  );
}
