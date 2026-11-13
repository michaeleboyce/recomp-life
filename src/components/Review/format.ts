// Display helpers for the weekly review. Pure.
import { formatNumber, formatWhole } from "@/lib/metrics/helpers";

export const DASH = "—";

/** "225", "232.5". */
export const lbs = (v: number) => formatNumber(v);
export const whole = formatWhole;

/** "1 session", "3 sessions". */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "3 mi · 30 min", or "30 min" without distance. */
export function cardioLine(miles: number, minutes: number): string {
  const time = `${formatNumber(minutes, 0)} min`;
  return miles > 0 ? `${formatNumber(miles, 1)} mi · ${time}` : time;
}

/** A signed rate with a Unicode minus: "−1.31". */
export function signed(v: number, digits = 2): string {
  const text = formatNumber(Math.abs(v), digits);
  if (Number(text) === 0) return "0";
  return `${v > 0 ? "+" : "−"}${text}`;
}
