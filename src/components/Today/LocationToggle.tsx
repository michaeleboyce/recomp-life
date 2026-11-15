"use client";

import { cn } from "@/lib/utils";
import type { WorkoutLocation } from "@/types";

const OPTIONS: { value: WorkoutLocation; label: string }[] = [
  { value: "gym", label: "Gym" },
  { value: "home", label: "Home" },
];

/**
 * The gym/home switch as one small pill: the location in effect in the accent
 * colour, the other one muted. Sits on a photo, so its surface is nearly opaque.
 */
export function LocationToggle({
  value,
  onChange,
  className,
}: {
  value: WorkoutLocation;
  onChange: (next: WorkoutLocation) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Training location"
      data-slot="location-toggle"
      data-location={value}
      className={cn("inline-flex h-10 shrink-0 items-center rounded-full bg-card/90 p-1", className)}
    >
      {OPTIONS.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-8 rounded-full px-3 text-[13px] font-bold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
              on ? "bg-secondary text-accent-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
