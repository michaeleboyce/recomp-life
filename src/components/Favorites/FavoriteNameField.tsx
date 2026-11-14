"use client";

import { FAVORITE_NAME_MAX_LENGTH } from "@/lib/favorites";
import { cn } from "@/lib/utils";

/** The text field for a favourite's name, length-limited and at least 44px tall. */
export function FavoriteNameField({
  value,
  onChange,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      aria-label="Favourite name"
      value={value}
      maxLength={FAVORITE_NAME_MAX_LENGTH}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base text-foreground outline-none",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className
      )}
    />
  );
}
