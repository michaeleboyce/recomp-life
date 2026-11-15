"use client";

import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/ui/tier-badge";
import { cleanFavoriteName, type FavoriteMode } from "@/lib/favorites";
import { summariseFavorite } from "@/lib/favoriteSummary";
import type { FavoriteWorkout } from "@/types";
import { FavoriteNameField } from "./FavoriteNameField";

const START_OPTIONS: { mode: FavoriteMode; label: string; description: string; primary: boolean }[] = [
  {
    mode: "current",
    label: "Today's weights",
    description: "Same exercises at your current program weights",
    primary: true,
  },
  {
    mode: "as-saved",
    label: "Exactly as saved",
    description: "Same sets, reps and weights as when you saved it",
    primary: false,
  },
];

/**
 * One saved workout: what is in it, when it was last used, and how to start it.
 * Rename and delete only appear when their callbacks are given.
 */
export function FavoriteCard({
  favorite,
  now,
  onStart,
  onRename,
  onDelete,
}: {
  favorite: FavoriteWorkout;
  now: Date;
  onStart: (mode: FavoriteMode) => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
}) {
  const summary = useMemo(() => summariseFavorite(favorite, now), [favorite, now]);
  const [draft, setDraft] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const descriptionId = useId();

  const renaming = draft !== null;
  const canSave = renaming && cleanFavoriteName(draft, "") !== "";

  const saveRename = () => {
    if (!renaming || !canSave) return;
    onRename?.(cleanFavoriteName(draft, favorite.name));
    setDraft(null);
  };

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <header className="flex flex-col gap-1">
        {renaming ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              saveRename();
            }}
          >
            <FavoriteNameField value={draft} onChange={setDraft} autoFocus />
            <div className="flex gap-2">
              <Button type="submit" className="min-h-11 flex-1" disabled={!canSave}>
                Save
              </Button>
              <Button type="button" variant="secondary" className="min-h-11 flex-1" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <h3 className="text-base font-semibold text-foreground">{favorite.name}</h3>
        )}
        <p className="text-sm text-muted-foreground">
          {summary.dayLabel} · {summary.locationLabel}
        </p>
      </header>

      <ul aria-label="Exercises" className="flex flex-col gap-1.5">
        {summary.exercises.map((exercise, index) => (
          <li key={`${exercise.name}-${index}`} className="flex items-center gap-2 text-sm">
            <TierBadge tier={exercise.tier} variant="soft" />
            <span className="min-w-0 flex-1 truncate text-foreground">{exercise.name}</span>
            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{exercise.text}</span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">{summary.lastUsedText}</p>

      <div className="flex flex-col gap-3">
        {START_OPTIONS.map((option) => {
          const id = `${descriptionId}-${option.mode}`;
          return (
            <div key={option.mode} className="flex flex-col gap-1">
              <Button
                variant={option.primary ? "default" : "secondary"}
                className="min-h-11 w-full"
                aria-describedby={id}
                onClick={() => onStart(option.mode)}
              >
                {option.label}
              </Button>
              <p id={id} className="text-xs text-muted-foreground">
                {option.description}
              </p>
            </div>
          );
        })}
      </div>

      {(onRename || onDelete) && !renaming && (
        <div className="flex items-center gap-2 border-t border-border pt-3">
          {confirmingDelete ? (
            <>
              <p className="flex-1 text-sm font-medium text-destructive">Delete favourite?</p>
              <Button
                variant="destructive"
                className="min-h-11"
                onClick={() => {
                  setConfirmingDelete(false);
                  onDelete?.();
                }}
              >
                Confirm
              </Button>
              <Button variant="secondary" className="min-h-11" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              {onRename && (
                <Button variant="ghost" className="min-h-11" onClick={() => setDraft(favorite.name)}>
                  Rename
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  className="min-h-11 text-destructive hover:text-destructive"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}
