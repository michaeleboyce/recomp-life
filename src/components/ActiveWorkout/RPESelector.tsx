"use client";

import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { cn } from "@/lib/utils";

interface RPESelectorProps {
  selectedRPE: number | null;
  onSelectRPE: (rpe: number | null) => void;
}

const RPE_VALUES = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];

function effortColor(rpe: number): string {
  if (rpe <= 7) return "text-success";
  if (rpe <= 8) return "text-foreground";
  if (rpe <= 9) return "text-warning";
  return "text-destructive";
}

/**
 * Optional effort rating for a set (RPE 6-10). Tapping the selected value again
 * clears it.
 *
 * @evidence rpe-logging
 */
export function RPESelector({ selectedRPE, onSelectRPE }: RPESelectorProps) {
  return (
    <section className="flex flex-col gap-2" aria-label="Effort">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Effort (RPE, optional)
        <EvidenceLine ruleId="rpe-logging" variant="icon" hideLibraryLink />
      </h2>

      <div className="grid grid-cols-8 gap-1.5">
        {RPE_VALUES.map((rpe) => {
          const selected = selectedRPE === rpe;
          return (
            <button
              key={rpe}
              type="button"
              aria-pressed={selected}
              aria-label={`RPE ${rpe}`}
              onClick={() => onSelectRPE(selected ? null : rpe)}
              className={cn(
                "h-11 rounded-[10px] border-[1.5px] font-mono text-sm tabular-nums transition-colors",
                selected
                  ? "border-accent-primary bg-accent-primary-soft font-bold text-foreground"
                  : cn("border-transparent bg-card font-medium", effortColor(rpe))
              )}
            >
              {rpe}
            </button>
          );
        })}
      </div>
    </section>
  );
}
