"use client";

import { useState } from "react";
import { useCompletedWorkouts, useFavoriteWorkouts } from "@/hooks";
import {
  lastLoggedWeights,
  resolveFavorite,
  type FavoriteMode,
  type ResolvedFavorite,
} from "@/lib/favorites";

export type FavoriteFromUrl =
  /** The favourite list (or the history it needs) has not loaded yet. */
  | { status: "loading" }
  /** The URL names no favourite. */
  | { status: "none" }
  /** The URL names a favourite that does not exist or was deleted. */
  | { status: "missing" }
  | { status: "applied"; name: string; mode: FavoriteMode; resolved: ResolvedFavorite };

const NONE: FavoriteFromUrl = { status: "none" };
const LOADING: FavoriteFromUrl = { status: "loading" };

export function parseFavoriteMode(value: string | null | undefined): FavoriteMode {
  return value === "as-saved" ? "as-saved" : "current";
}

/**
 * The favourite named by `?favorite=<id>&mode=...`, resolved for its mode.
 *
 * The resolved object is computed once per id and mode and then kept, so the setup hook
 * (which re-seeds whenever it gets a different object) is not reset by the list or the
 * workout history changing while the screen is open, for example after a rename.
 */
export function useFavoriteFromUrl(
  favoriteId: string | null | undefined,
  modeParam: string | null | undefined
): FavoriteFromUrl {
  const mode = parseFavoriteMode(modeParam);
  const favorites = useFavoriteWorkouts();
  const completed = useCompletedWorkouts();
  const key = favoriteId ? `${favoriteId}:${mode}` : null;
  const [kept, setKept] = useState<{ key: string; value: FavoriteFromUrl } | null>(null);

  if (!favoriteId || !key) return NONE;
  if (kept?.key === key) return kept.value;
  if (favorites === undefined || completed === undefined) return LOADING;

  const favorite = favorites.find((f) => f.id === favoriteId && f.deletedAt == null);
  const value: FavoriteFromUrl = favorite
    ? {
        status: "applied",
        name: favorite.name,
        mode,
        resolved: resolveFavorite(favorite, mode, lastLoggedWeights(completed)),
      }
    : { status: "missing" };
  setKept({ key, value });
  return value;
}
