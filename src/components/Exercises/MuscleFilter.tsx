"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import type { MuscleId } from "@/types";
import { MUSCLE_IDS, formatMuscle } from "@/lib/muscles";
import { MuscleMap } from "@/components/Anatomy/MuscleMap";

interface MuscleFilterProps {
  value: MuscleId | null;
  onChange: (muscle: MuscleId | null) => void;
}

/**
 * Filter the exercise list by muscle: tap the body, or pick a chip (some
 * muscles, like side delts, share a shape on the 2D figure).
 */
export function MuscleFilter({ value, onChange }: MuscleFilterProps) {
  const [open, setOpen] = useState(false);
  const toggle = (muscle: MuscleId) => onChange(value === muscle ? null : muscle);

  return (
    <div className="mb-4 rounded-md border border-border">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex flex-1 items-center justify-between px-3 py-2.5 text-left"
        >
          <span className="text-sm font-medium">
            {value ? `Muscle: ${formatMuscle(value)}` : "Filter by muscle"}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Clear muscle filter"
            className="px-3 py-2.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-border px-3 py-3">
          <MuscleMap
            heat={value ? { [value]: 4 } : undefined}
            selected={value}
            onMusclePress={toggle}
            className="h-52"
            label="Tap a muscle to filter exercises"
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {MUSCLE_IDS.map((muscle) => (
              <button
                key={muscle}
                type="button"
                onClick={() => toggle(muscle)}
                aria-pressed={value === muscle}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  value === muscle
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {formatMuscle(muscle)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
