"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A star toggle for saving or removing a favourite. Stops the click from reaching a
 * clickable row around it. `label` is optional visible text beside the star.
 */
export function FavoriteStarButton({
  active,
  onToggle,
  label,
  className,
}: {
  active: boolean;
  onToggle: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? "Remove from favourites" : "Save as favourite"}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium outline-none transition-colors",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
        className
      )}
    >
      <Star className={cn("size-5", active && "fill-current")} aria-hidden="true" />
      {label && <span>{label}</span>}
    </button>
  );
}
