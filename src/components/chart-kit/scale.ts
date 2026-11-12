// Pure scale helpers for the chart kit: axis domains, tick positions and
// sparkline geometry. No React, so they are tested directly.

const NICE_FACTORS = [1, 2, 2.5, 5];

function decimalsOf(step: number): number {
  const s = String(step);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

/** The nice steps (1, 2, 2.5, 5 x 10^k) at or above `raw`, smallest first. */
function* niceStepsFrom(raw: number): Generator<number> {
  let exp = Math.floor(Math.log10(raw));
  for (;;) {
    for (const f of NICE_FACTORS) {
      const step = Number((f * 10 ** exp).toPrecision(12));
      if (step >= raw * (1 - 1e-9)) yield step;
    }
    exp += 1;
  }
}

export interface NiceScale {
  domain: [number, number];
  ticks: number[];
}

/**
 * A padded value domain with three or four clean ticks. The domain hugs the data
 * (10% padding) and never includes zero unless the data is near it, so a weight
 * series does not start at 0.
 */
export function niceScale(values: number[]): NiceScale {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return { domain: [0, 1], ticks: [0, 0.5, 1] };

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  let lo: number;
  let hi: number;
  if (max === min) {
    const half = Math.max(Math.abs(min) * 0.02, 0.5);
    lo = min - half;
    hi = max + half;
  } else {
    const pad = (max - min) * 0.1;
    lo = min - pad;
    hi = max + pad;
  }
  if (min >= 0 && lo < 0) lo = 0;

  let best: { lo: number; step: number; count: number } | null = null;
  for (const count of [4, 3]) {
    for (const step of niceStepsFrom((hi - lo) / (count - 1))) {
      const niceLo = Math.floor(lo / step + 1e-9) * step;
      if (niceLo + (count - 1) * step >= hi - 1e-9) {
        const span = (count - 1) * step;
        if (!best || span < (best.count - 1) * best.step - 1e-9) best = { lo: niceLo, step, count };
        break;
      }
    }
  }
  const { lo: niceLo, step, count } = best!;
  const dec = decimalsOf(step);
  const ticks = Array.from({ length: count }, (_, i) => Number((niceLo + i * step).toFixed(dec)));
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks };
}

/** First, middle and last instant of a time range (one tick if they coincide). */
export function timeTicks(start: number, end: number): number[] {
  if (start === end) return [start];
  return [start, Math.round((start + end) / 2), end];
}

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** "Oct 26". */
export function formatShortDate(t: number): string {
  return SHORT_DATE.format(new Date(t));
}

/** Default value formatter: whole numbers as is, others to one decimal place. */
export function formatNumber(v: number): string {
  const rounded = Math.round(v * 10) / 10;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/**
 * Maps values to a width x height box, inset by `pad` on every side so a stroke of
 * width 2 * pad is not clipped. The minimum sits on the bottom edge and the maximum
 * on the top edge; a single point or a flat series sits on the middle line.
 */
export function sparklineCoords(
  values: number[],
  width: number,
  height: number,
  pad: number
): Array<{ x: number; y: number }> {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: width / 2, y: height / 2 }];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad;
  return values.map((v, i) => ({
    x: pad + (i / (n - 1)) * innerW,
    y: max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * innerH,
  }));
}
