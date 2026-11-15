"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

function reduceQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCE_QUERY)
    : null;
}

function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = reduceQuery();
  if (!mq) return () => {};
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * True when the device asks for reduced motion. For motion driven from script (CSS
 * motion uses `motion-safe:` and the reduced-motion rule in globals.css). False on the
 * server and where the browser cannot say.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => reduceQuery()?.matches ?? false,
    () => false
  );
}

interface AnimatedNumberProps {
  value: number;
  /** Milliseconds for the count; keep it between 150 and 400. */
  duration?: number;
  decimals?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  /**
   * Counts up (or down) from this number when first shown, e.g. the old best when a
   * new best appears. Without it the first value is shown as it is.
   */
  from?: number;
}

/**
 * A number that counts to each new value with an ease-out. Under reduced motion it
 * shows the value at once.
 */
export function AnimatedNumber({
  value,
  duration = 300,
  decimals = 0,
  className,
  prefix,
  suffix,
  from,
}: AnimatedNumberProps) {
  const reduce = usePrefersReducedMotion();
  const [display, setDisplay] = useState(() => (reduce ? value : (from ?? value)));
  /** The number on screen now: where the next count starts. */
  const shown = useRef(display);

  useEffect(() => {
    const start = shown.current;
    const diff = value - start;
    if (diff === 0) return;
    if (reduce || duration <= 0) {
      // Drawn as `value` already (see below); the state catches up out of band.
      shown.current = value;
      const frame = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(frame);
    }

    const startTime = performance.now();
    let frame = 0;

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      shown.current = progress < 1 ? start + diff * eased : value;
      setDisplay(shown.current);
      if (progress < 1) frame = requestAnimationFrame(animate);
    }

    frame = requestAnimationFrame(animate);
    // A new value mid-count carries on from the number on screen; one loop at a time.
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduce]);

  const current = reduce || duration <= 0 ? value : display;
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {prefix}{current.toFixed(decimals)}{suffix}
    </span>
  );
}
