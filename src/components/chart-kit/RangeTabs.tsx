"use client";

import { useRef, type KeyboardEvent } from "react";
import type { RangeKey } from "@/lib/metrics/types";
import { cn } from "@/lib/utils";

export const RANGE_KEYS: readonly RangeKey[] = ["4w", "3m", "1y", "all"];

export const RANGE_LABELS: Record<RangeKey, string> = {
  "4w": "4w",
  "3m": "3m",
  "1y": "1y",
  all: "All",
};

export interface RangeTabsProps {
  value: RangeKey;
  onChange: (range: RangeKey) => void;
  /** Defaults to all four ranges. */
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
  const current = Math.max(0, options.indexOf(value));

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
        const checked = i === current;
        return (
          <button
            key={key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
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
