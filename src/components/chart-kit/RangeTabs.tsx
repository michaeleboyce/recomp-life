"use client";

import { useRef, type KeyboardEvent } from "react";
import type { RangeKey } from "@/lib/metrics/types";
import { cn } from "@/lib/utils";

/** The default chips; the estimated-max chart offers every preset (`ALL_RANGE_KEYS`). */
export const RANGE_KEYS: readonly RangeKey[] = ["4w", "3m", "1y", "all"];

export const RANGE_LABELS: Record<RangeKey, string> = {
  "4w": "4w",
  "3m": "3m",
  "6m": "6m",
  "1y": "1y",
  "2y": "2y",
  all: "All",
};

export interface RangeTabsProps {
  /** Null when none is in force (a zoomed span). */
  value: RangeKey | null;
  onChange: (range: RangeKey) => void;
  /** Defaults to RANGE_KEYS. */
  options?: readonly RangeKey[];
  /** Accessible name of the group. */
  ariaLabel?: string;
  className?: string;
}

/** Time-range chips for a chart: a radiogroup with roving focus and arrow keys. */
export function RangeTabs({
  value,
  onChange,
  options = RANGE_KEYS,
  ariaLabel = "Time range",
  className,
}: RangeTabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = value === null ? -1 : options.indexOf(value);
  const current = Math.max(0, index);

  function select(index: number) {
    const next = (index + options.length) % options.length;
    onChange(options[next]);
    refs.current[next]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const moves: Record<string, () => void> = {
      ArrowRight: () => select(current + 1),
      ArrowDown: () => select(current + 1),
      ArrowLeft: () => select(current - 1),
      ArrowUp: () => select(current - 1),
      Home: () => select(0),
      End: () => select(options.length - 1),
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      move();
    }
  }

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex gap-0.5", className)}>
      {options.map((key, i) => {
        const checked = i === index;
        const focusable = index === -1 ? i === 0 : checked;
        return (
          <button
            key={key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={focusable ? 0 : -1}
            onClick={() => onChange(key)}
            onKeyDown={onKeyDown}
            className={cn(
              // 32px tall; the pseudo-element extends the hit area to 44px.
              "relative h-8 rounded-lg px-2.5 font-mono text-xs transition-colors",
              "before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
              checked
                ? "bg-card-raised font-bold text-foreground"
                : "font-semibold text-chart-axis hover:text-foreground"
            )}
          >
            {RANGE_LABELS[key]}
          </button>
        );
      })}
    </div>
  );
}
