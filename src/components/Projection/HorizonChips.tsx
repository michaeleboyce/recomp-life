"use client";

import { chipVariants } from "@/components/ui/chip-group";
import { cn } from "@/lib/utils";

/**
 * The 4w / 8w / 12w choice. A horizon further ahead than the history supports
 * (`maxWeeks`) is shown but disabled; the screen says why underneath.
 */
export function HorizonChips({
  horizons,
  value,
  maxWeeks,
  onChange,
}: {
  horizons: readonly number[];
  value: number;
  maxWeeks: number;
  onChange: (weeks: number) => void;
}) {
  return (
    <div
      data-slot="chip-group"
      role="radiogroup"
      aria-label="Projection horizon"
      className="flex flex-wrap gap-1"
    >
      {horizons.map((weeks) => {
        const selected = weeks === value;
        const disabled = weeks > maxWeeks;
        return (
          <button
            key={weeks}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(weeks)}
            className={cn(
              chipVariants({ size: "sm", selected }),
              disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground"
            )}
          >
            {weeks}w
          </button>
        );
      })}
    </div>
  );
}
