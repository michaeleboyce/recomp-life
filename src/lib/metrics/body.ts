// Bodyweight metrics. Pure.
import { calendarDaysBetween } from "@/lib/dates";
import { calculateWeeklyRateOfLoss } from "@/lib/rateOfLoss";
import type { BodyweightLog } from "@/types";
import { count, defineMetric, formatNumber, mean, toMs, weekStartMs } from "./helpers";
import type { MetricSource, Point, Series } from "./types";

/** Days of weigh-ins `lossRate` needs before its first point. */
export const LOSS_RATE_MIN_DAYS = 14;
/** Rolling window handed to `calculateWeeklyRateOfLoss`. */
export const LOSS_RATE_WINDOW_DAYS = 14;

interface Entry {
  t: number;
  date: Date;
  weight: number;
  id: string;
}

/** Valid weigh-ins, oldest first, with dates revived. */
function entries(logs: BodyweightLog[]): Entry[] {
  return logs
    .map((log) => ({ t: toMs(log.date), date: new Date(log.date), weight: log.weight, id: log.id }))
    .filter((e) => Number.isFinite(e.t) && Number.isFinite(e.weight))
    .sort((a, b) => a.t - b.t);
}

/** Which way is "better" for bodyweight depends on the training phase. */
function bodyweightBetter(source: MetricSource): Series["better"] {
  const mode = source.settings?.trainingPhase?.mode;
  if (mode === "cutting") return "down";
  if (mode === "bulking") return "up";
  return "none";
}

/** One point per weigh-in. */
export const bodyweight = defineMetric(
  {
    id: "bodyweight",
    label: "Bodyweight",
    unit: "lbs",
    // The series' own `better` follows the training phase.
    better: "none",
    scope: "global",
    format: (v) => v.toFixed(1),
  },
  (source) => entries(source.bodyweight).map((e) => ({ t: e.t, v: e.weight, refId: e.id })),
  bodyweightBetter
);

/**
 * At each weigh-in, the mean of the weigh-ins on that calendar day and the six days
 * before it (up to and including that entry).
 */
export const bodyweight7d = defineMetric(
  {
    id: "bodyweight7d",
    label: "Bodyweight, 7-day average",
    unit: "lbs",
    better: "none",
    scope: "global",
    format: (v) => v.toFixed(1),
  },
  (source) => {
    const all = entries(source.bodyweight);
    return all.map((entry, i) => {
      const window: number[] = [];
      for (let j = i; j >= 0; j--) {
        if (calendarDaysBetween(all[j].date, entry.date) > 6) break;
        window.push(all[j].weight);
      }
      return {
        t: entry.t,
        v: mean(window),
        label: count(window.length, "entry", "entries"),
        refId: entry.id,
      };
    });
  },
  bodyweightBetter
);

/**
 * Weekly rate of change in lbs/week (negative = losing). One point per calendar week,
 * placed at that week's last weigh-in, once the log spans two weeks: the sign-flipped
 * result of `calculateWeeklyRateOfLoss` over the weigh-ins up to that point (its
 * 14-day window; weeks where it has too few entries are skipped).
 */
export const lossRate = defineMetric(
  {
    id: "lossRate",
    label: "Rate of change",
    unit: "lbs/week",
    // Faster is not better in either direction; the target zone lives in rateOfLoss.
    better: "none",
    scope: "global",
    format: (v) => {
      const text = formatNumber(Math.abs(v), 2);
      if (Number(text) === 0) return "0";
      return `${v > 0 ? "+" : "-"}${text}`;
    },
  },
  (source) => {
    const all = entries(source.bodyweight);
    const points: Point[] = [];
    for (let i = 0; i < all.length; i++) {
      const isLastOfWeek =
        i === all.length - 1 || weekStartMs(all[i + 1].t) !== weekStartMs(all[i].t);
      if (!isLastOfWeek) continue;
      if (calendarDaysBetween(all[0].date, all[i].date) < LOSS_RATE_MIN_DAYS - 1) continue;
      const rate = calculateWeeklyRateOfLoss(all.slice(0, i + 1), LOSS_RATE_WINDOW_DAYS);
      if (!rate) continue;
      // rateOfLoss reports loss as positive; `|| 0` avoids a negative zero.
      const change = -rate.lbsPerWeek || 0;
      const pct = -rate.percentPerWeek || 0;
      points.push({
        t: all[i].t,
        v: change,
        label: `${pct > 0 ? "+" : ""}${pct.toFixed(2)}% of bodyweight`,
        refId: all[i].id,
      });
    }
    return points;
  }
);
