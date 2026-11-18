"use client";

import { useEffect, useState } from "react";
import { DAY_MS } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { formatShortDate } from "./scale";
import { sliderTrack, type Span } from "./trendGeometry";

/** "Oct 26", with the year when it is not the year of `ref`: "May 28, 2025". */
function dateWithYear(t: number, ref: number): string {
  const d = new Date(t);
  return d.getFullYear() === new Date(ref).getFullYear() ? formatShortDate(t) : `${formatShortDate(t)}, ${d.getFullYear()}`;
}

export interface WindowRangeProps {
  value: Span;
  limits: Span;
  onChange: (span: Span) => void;
  /** Narrowest window in days (default 7). */
  minDays?: number;
  className?: string;
}

const THUMB =
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:cursor-grab " +
  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 " +
  "[&::-webkit-slider-thumb]:border-chart-line [&::-webkit-slider-thumb]:bg-background " +
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full " +
  "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-chart-line [&::-moz-range-thumb]:bg-background";

/**
 * A two-thumb control for the chart's window: the filled part is the window shown, and
 * the track is the window plus context (`sliderTrack`), so at a short window the two
 * thumbs are still far enough apart to grab. The track holds still while a thumb is
 * dragged and widens on release, so an end dragged to the edge can go further next time.
 * Each thumb is a native range input stepping by a day (keyboard and screen readers work
 * as for any slider, each end named by its date), 44 px tall to touch.
 */
export function WindowRange({ value, limits, onChange, minDays = 7, className }: WindowRangeProps) {
  const [frozen, setFrozen] = useState<Span | null>(null);
  const dragging = frozen !== null;
  useEffect(() => {
    if (!dragging) return;
    const release = () => setFrozen(null);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [dragging]);

  const total = Math.max(1, limits.to - limits.from);
  const toDay = (t: number) => Math.round((t - limits.from) / DAY_MS);
  const fromDay = (d: number) => limits.from + d * DAY_MS;
  const maxDay = Math.max(1, Math.ceil(total / DAY_MS));
  const clampDay = (d: number) => Math.max(0, Math.min(maxDay, d));
  const live = sliderTrack(value, limits);
  const track = frozen ?? live;
  // The track in whole days from the start of the history; the inputs' values are days
  // too, so a value keeps its meaning when the track widens.
  const lo = clampDay(toDay(track.from));
  const hi = Math.max(lo + 1, track.to >= limits.to ? maxDay : clampDay(toDay(track.to)));
  const start = Math.max(lo, Math.min(hi, toDay(value.from)));
  const end = Math.max(lo, Math.min(hi, toDay(value.to)));
  const left = ((start - lo) / (hi - lo)) * 100;
  const right = ((end - lo) / (hi - lo)) * 100;

  if (limits.to - limits.from < minDays * DAY_MS) return null;

  const input = cn(
    "pointer-events-none absolute inset-x-0 top-0 h-11 w-full appearance-none bg-transparent",
    "focus-visible:outline-none [&:focus-visible::-webkit-slider-thumb]:ring-[3px] [&:focus-visible::-webkit-slider-thumb]:ring-ring/60",
    THUMB
  );

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <div className="relative h-11" onPointerDown={() => setFrozen(live)}>
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-chart-grid" aria-hidden="true" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-chart-line"
          style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
          aria-hidden="true"
        />
        <input
          type="range"
          aria-label="Window start"
          aria-valuetext={dateWithYear(fromDay(start), limits.to)}
          min={lo}
          max={hi}
          step={1}
          value={start}
          onChange={(e) => {
            const d = Math.min(Number(e.target.value), end - minDays);
            onChange({ from: fromDay(clampDay(d)), to: value.to });
          }}
          className={input}
        />
        <input
          type="range"
          aria-label="Window end"
          aria-valuetext={dateWithYear(end >= maxDay ? limits.to : fromDay(end), limits.to)}
          min={lo}
          max={hi}
          step={1}
          value={end}
          onChange={(e) => {
            const d = Math.max(Number(e.target.value), start + minDays);
            onChange({ from: value.from, to: d >= maxDay ? limits.to : fromDay(clampDay(d)) });
          }}
          className={input}
        />
      </div>
      <div className="flex justify-between font-mono text-[11px] text-muted-foreground" aria-hidden="true">
        <span>{dateWithYear(fromDay(lo), limits.to)}</span>
        <span>{dateWithYear(hi >= maxDay ? limits.to : fromDay(hi), limits.to)}</span>
      </div>
    </div>
  );
}
