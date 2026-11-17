"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { SkeletonCard } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { FavoriteList } from "@/components/Favorites/FavoriteList";
import { errorText } from "@/components/LogEdit/format";
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

  const nameOf = (favoriteId: string) => favorites?.find((f) => f.id === favoriteId)?.name ?? "Favourite";

  // A write that fails says so: nothing else would tell the user the change was lost.
  const rename = async (favoriteId: string, name: string) => {
    try {
      await renameFavorite(favoriteId, name);
    } catch (e) {
      toast({ message: `Could not rename ${nameOf(favoriteId)}: ${errorText(e)}` });
    }
  };

  const remove = async (favoriteId: string) => {
    const name = nameOf(favoriteId);
    try {
      await deleteFavorite(favoriteId);
    } catch (e) {
      toast({ message: `Could not delete ${name}: ${errorText(e)}` });
      return;
    }
    toast({
      message: `${name} deleted`,
      action: {
        label: "Undo",
        onAction: async () => {
          try {
            await restoreFavorite(favoriteId);
            toast({ message: `${name} restored` });
          } catch (e) {
            toast({ message: `Could not restore ${name}: ${errorText(e)}` });
          }
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
          onRename={(id, name) => void rename(id, name)}
          onDelete={(id) => void remove(id)}
        />
      )}
    </PageShell>
  );
}
