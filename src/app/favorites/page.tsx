"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { SkeletonCard } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { FavoriteList } from "@/components/Favorites/FavoriteList";
import { useFavoriteWorkouts } from "@/hooks";
import { deleteFavorite, renameFavorite, restoreFavorite } from "@/lib/data/favorites";
import type { FavoriteMode } from "@/lib/favorites";

/** Saved workouts: start one (today's weights or exactly as saved), rename it, delete it. */
export default function FavoritesPage() {
  const router = useRouter();
  const favorites = useFavoriteWorkouts();
  const [now] = useState(() => new Date());

  const start = (favoriteId: string, mode: FavoriteMode) =>
    router.push(`/workout/configure?favorite=${encodeURIComponent(favoriteId)}&mode=${mode}`);

  const remove = async (favoriteId: string) => {
    const name = favorites?.find((f) => f.id === favoriteId)?.name ?? "Favourite";
    await deleteFavorite(favoriteId);
    toast({
      message: `${name} deleted`,
      action: {
        label: "Undo",
        onAction: async () => {
          await restoreFavorite(favoriteId);
          toast({ message: `${name} restored` });
        },
      },
    });
  };

  return (
    <PageShell className="space-y-4">
      <PageHeader title="Favourites" backHref="/more" />
      {favorites === undefined ? (
        <SkeletonCard />
      ) : (
        <FavoriteList
          favorites={favorites}
          now={now}
          onStart={start}
          onRename={(id, name) => void renameFavorite(id, name)}
          onDelete={(id) => void remove(id)}
        />
      )}
    </PageShell>
  );
}
