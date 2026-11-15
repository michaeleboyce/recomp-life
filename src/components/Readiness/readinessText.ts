// Plain words for the readiness screen. Pure: no React.
import { formatPoints, readinessLevelShift } from "@/lib/readiness";
import type { ReadinessScore } from "@/types";

/** Below the usual by this many points, the day reads as a harder one. */
const HARDER_DAY_POINTS = 8;
/** Above the usual by this many points, the day reads as a good one. */
const GOOD_DAY_POINTS = 5;

/** One line on what to do. Readiness never changes a weight, so it always says train. */
export function readinessVerdict(score: Pick<ReadinessScore, "score" | "usual" | "suggestSkippingAccessories">): string {
  if (score.suggestSkippingAccessories) return "Train the main lifts; think about skipping accessories.";
  const diff = score.score - score.usual;
  if (diff <= -HARDER_DAY_POINTS) return "Train as planned; it may feel harder than usual.";
  if (diff >= GOOD_DAY_POINTS) return "A good day: train as planned.";
  return "Train as planned.";
}

const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

/** "Your usual is 72. Three things moved it, ..." */
export function usualLine(score: ReadinessScore): string {
  const moved = score.contributions.filter((c) => c.points !== 0).length;
  const things = moved === 1 ? "thing" : "things";
  const tail =
    moved === 0
      ? "Nothing moved it today."
      : `${countWord(moved)} ${things} moved it, shown below with how sure the research is.`;
  return `Your usual is ${score.usual}. ${tail}`;
}

/** "adds 4 points", "takes 3 points", "no change": the bar's text equivalent. */
export function spokenPoints(points: number): string {
  if (points === 0) return "no change";
  const n = Math.abs(points);
  return `${points > 0 ? "adds" : "takes"} ${n} ${n === 1 ? "point" : "points"}`;
}

/** The points as shown: "+4", "−3", "0". */
export { formatPoints };

/** 0.0035 -> "0.35%". */
function percent(fraction: number): string {
  return `${Number((Math.abs(fraction) * 100).toFixed(2))}%`;
}

/** What the score does to the forecasts today, from `readinessLevelShift`. */
export function forecastShiftText(score: Pick<ReadinessScore, "score" | "usual">): string {
  const shift = readinessLevelShift(score);
  if (shift === 0) return "no change; today is your usual.";
  return `the strength level the rep forecasts start from moves ${shift > 0 ? "up" : "down"} ${percent(shift)}.`;
}
