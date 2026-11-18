"use client";

import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { Term } from "@/components/ui/term";
import { REPS_IN_RESERVE_OPTIONS, REPS_IN_RESERVE_QUESTION } from "@/lib/effort";
import { cn } from "@/lib/utils";
import type { RepsInReserve } from "@/types";

interface EffortSelectorProps {
  selected: RepsInReserve | null;
  onSelect: (value: RepsInReserve | null) => void;
}

const ANSWER_WORD: Record<RepsInReserve, string> = {
  "0": "None left",
  "1-2": "A couple",
  "3+": "Plenty",
};

/** Hardest to easiest: destructive, foreground, success. */
const ANSWER_COLOR: Record<RepsInReserve, string> = {
  "0": "text-destructive",
  "1-2": "text-foreground",
  "3+": "text-success",
};

/**
 * Optional effort rating for a set: how many more reps the lifter could have done.
 * Tapping the selected answer again clears it.
 *
 * @evidence effort-logging
 */
export function EffortSelector({ selected, onSelect }: EffortSelectorProps) {
  return (
    <section className="flex flex-col gap-2" aria-label="Effort">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span>
          <Term id="rir" hideLinks label="reps left">
            {REPS_IN_RESERVE_QUESTION}
          </Term>{" "}
          (optional)
        </span>
        <EvidenceLine ruleId="effort-logging" variant="icon" hideLibraryLink />
      </h2>

      <div className="grid grid-cols-3 gap-1.5">
        {REPS_IN_RESERVE_OPTIONS.map((answer) => {
          const isSelected = selected === answer;
          return (
            <button
              key={answer}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${answer} reps left`}
              onClick={() => onSelect(isSelected ? null : answer)}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center rounded-[10px] border-[1.5px] py-1.5 transition-colors",
                isSelected
                  ? "border-accent-primary bg-accent-primary-soft font-bold text-foreground"
                  : cn("border-transparent bg-card font-medium", ANSWER_COLOR[answer])
              )}
            >
              <span className="font-mono text-lg leading-tight tabular-nums">{answer}</span>
              <span className="text-[11px] font-normal leading-tight text-muted-foreground">
                {ANSWER_WORD[answer]}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
