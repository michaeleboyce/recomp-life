// What the model saw when a forecast was made, as stored on the row, in plain words.
// Pure.
import { sdScaleOf } from "@/lib/forecast";
import { percent } from "@/lib/text";
import type { Forecast } from "@/types";
import { formatAmount, formatMinutes, num, REGIME_WORDS, shortDate, str } from "./words";

export interface InputLine {
  label: string;
  value: string;
}

const PHASE_WORDS: Record<string, string> = {
  cutting: "Cutting",
  maintaining: "Maintaining",
  bulking: "Bulking",
};

/**
 * What the model saw when the forecast was made, as stored on the row. Keys the
 * screen does not know are left out rather than shown raw.
 */
export function inputLines(forecast: Forecast): InputLine[] {
  const lines: InputLine[] = [];
  const add = (label: string, value: string | null) => {
    if (value !== null) lines.push({ label, value });
  };
  const n = (key: string) => num(forecast, key);
  const lb = (key: string) => (n(key) === null ? null : `${formatAmount(n(key)!)} lb`);
  const repsModel = ["amrapReps", "liftPass", "newBest"].includes(forecast.kind);

  add("Made", `${shortDate(forecast.madeAt)}`);
  if (repsModel) {
    add("Weight on the bar", lb("weight"));
    if (n("plannedWeight") !== null && n("weight") !== null && n("plannedWeight") !== n("weight")) {
      add("Weight the program planned", lb("plannedWeight"));
    }
    add("Target reps", n("targetReps") === null ? null : String(n("targetReps")));
    add("Stage", str(forecast, "stage")?.replace("x", "×") ?? null);
    add("Past last sets used", n("sampleSize") === null ? null : String(n("sampleSize")));
    add("Strength level (weight × (1 + reps ÷ 30))", lb("level"));
    add("Day-to-day scatter of that level", lb("scatter"));
    const regime = str(forecast, "regimeChange");
    if (regime) add("Recent change", REGIME_WORDS[regime] ?? regime);
    if ((n("regimeMultiplier") ?? 1) !== 1) add("Scatter widened after the change", `× ${n("regimeMultiplier")}`);
    if ((n("cuttingShift") ?? 0) !== 0) add("Lowered for the cut", percent(Math.abs(n("cuttingShift")!)));
    if (forecast.kind === "newBest") {
      add("Best estimated max to beat", lb("bestE1RM"));
      add("Reps needed for a new best", n("repsNeeded") === null ? null : String(n("repsNeeded")));
    }
  } else if (forecast.kind === "stallRisk" || forecast.kind === "milestone") {
    add("Working weight today", lb("weight"));
    add("Stage", str(forecast, "stage")?.replace("x", "×") ?? null);
    add("Target reps", n("targetReps") === null ? null : String(n("targetReps")));
    add("Added after each pass", lb("increment"));
    add("Past last sets used", n("sampleSize") === null ? null : String(n("sampleSize")));
    add("Strength level (weight × (1 + reps ÷ 30))", lb("level"));
    add("Day-to-day scatter of that level", lb("daySd"));
    const gap = n("gapDays");
    if (gap !== null) add("Days between sessions of this lift", formatAmount(gap));
    if (forecast.kind === "stallRisk") {
      const first = n("passFirst");
      if (first !== null) add("Chance the next session passes", percent(first));
    } else {
      add("Round number", lb("target"));
      const reach = n("reachChance");
      if (reach !== null) add("Chance of getting there within the walk", percent(reach));
      const inRange = n("rangeChance");
      if (inRange !== null) add("Chance the range itself gives", percent(inRange));
    }
    if ((n("cuttingShift") ?? 0) !== 0) add("Lowered for the cut", percent(Math.abs(n("cuttingShift")!)));
  } else if (forecast.kind === "sessionLength") {
    add("Planned sets and rests", n("plannedSeconds") === null ? null : formatMinutes(n("plannedSeconds")!));
    add("Past sessions used", n("sampleSize") === null ? null : String(n("sampleSize")));
    const c = n("correction");
    if (c !== null && c !== 1) add("Your pace against the plan", `× ${Math.round(c * 100) / 100}`);
  } else {
    add(forecast.kind === "bodyweight4w" ? "Weigh-ins used" : "Results used", n("sampleSize") === null ? null : String(n("sampleSize")));
    add(forecast.kind === "bodyweight4w" ? "Bodyweight on the line today" : "Estimated max today", lb("level"));
    const rate = n("ratePerWeek");
    if (rate !== null) add("Change per week", `${rate > 0 ? "+" : rate < 0 ? "−" : ""}${formatAmount(Math.abs(rate))} lb`);
    if (n("lastResultWeeksAgo") !== null) add("Last result", `${Math.round(n("lastResultWeeksAgo")!)} weeks before`);
    if (forecast.event.windowDays !== undefined) {
      add("Measured over", `${forecast.event.windowDays} days either side of the date`);
    }
  }
  const phase = str(forecast, "phase");
  if (phase) add("Training phase", PHASE_WORDS[phase] ?? phase);
  const readiness = n("readinessShift");
  if (readiness !== null && readiness !== 0) {
    add("Readiness moved the level", `${readiness > 0 ? "+" : "−"}${formatAmount(Math.abs(readiness) * 100)}%`);
  }
  const scale = sdScaleOf(forecast);
  if (scale > 1) add("Range widened by the track record", `× ${formatAmount(scale)}`);
  return lines;
}
