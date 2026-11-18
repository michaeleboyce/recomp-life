// Pure geometry for the strength trend chart: scales, paths, the visible part of the
// line, zooming a span, time ticks and dot shapes. No React, so it is tested directly.
import { DAY_MS } from "@/lib/dates";

export interface Span {
  from: number;
  to: number;
}

export interface LinePoint {
  t: number;
  v: number;
  low: number;
  high: number;
}

/** Maps [d0, d1] onto [r0, r1]; a zero-width domain maps to the middle. */
export function linear(d0: number, d1: number, r0: number, r1: number) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const map = (x: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + (x - d0) * k);
  const invert = (r: number) => (k === 0 ? d0 : d0 + (r - r0) / k);
  return Object.assign(map, { invert });
}

/** The line's value at `t`, interpolated between grid points; null outside it. */
export function lineValueAt(line: readonly LinePoint[], t: number): LinePoint | null {
  if (line.length === 0 || t < line[0].t || t > line[line.length - 1].t) return null;
  let lo = 0;
  let hi = line.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (line[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = line[lo];
  const b = line[hi];
  if (a.t === t || a === b) return a;
  if (b.t === t) return b;
  const f = (t - a.t) / (b.t - a.t);
  const mix = (x: number, y: number) => x + (y - x) * f;
  return { t, v: mix(a.v, b.v), low: mix(a.low, b.low), high: mix(a.high, b.high) };
}

/** The line inside the span, with interpolated end points so it reaches the edges. */
export function lineInSpan(line: readonly LinePoint[], span: Span): LinePoint[] {
  const inside = line.filter((p) => p.t >= span.from && p.t <= span.to);
  const start = lineValueAt(line, span.from);
  const end = lineValueAt(line, span.to);
  if (start && (inside.length === 0 || inside[0].t > span.from)) inside.unshift(start);
  if (end && inside[inside.length - 1]?.t !== end.t) inside.push(end);
  return inside;
}

/** At most `max` points, keeping the first and last, for a path no wider than the plot. */
export function thinLine(line: readonly LinePoint[], max: number): LinePoint[] {
  if (line.length <= max || max < 2) return [...line];
  const step = (line.length - 1) / (max - 1);
  const out: LinePoint[] = [];
  for (let i = 0; i < max; i++) out.push(line[Math.round(i * step)]);
  return out;
}

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();

/** "M x y L x y ..." through the points. */
export function linePath(points: readonly { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${f1(p.x)} ${f1(p.y)}`).join(" ");
}

/** Monotone tangents (Fritsch–Carlson): a curve through the points that never overshoots them. */
function monotoneTangents(pts: readonly { x: number; y: number }[]): number[] {
  const n = pts.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    d.push(dx === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx);
  }
  const m = pts.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return m;
}

/** Cubic segments after "M": the monotone curve through the points. */
function monotoneSegments(pts: readonly { x: number; y: number }[], m: number[]): string {
  let out = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = (pts[i + 1].x - pts[i].x) / 3;
    out += ` C${f1(pts[i].x + dx)} ${f1(pts[i].y + m[i] * dx)} ${f1(pts[i + 1].x - dx)} ${f1(pts[i + 1].y - m[i + 1] * dx)} ${f1(pts[i + 1].x)} ${f1(pts[i + 1].y)}`;
  }
  return out;
}

/** A smooth path through the points (sorted by x) that stays between neighbouring values. */
export function monotonePath(pts: readonly { x: number; y: number }[]): string {
  if (pts.length < 3) return linePath(pts);
  return `M${f1(pts[0].x)} ${f1(pts[0].y)}${monotoneSegments(pts, monotoneTangents(pts))}`;
}

/** The band between `high` and `low`, closed, curved like the line. */
export function bandPath(
  line: readonly LinePoint[],
  x: (t: number) => number,
  y: (v: number) => number
): string {
  if (line.length === 0) return "";
  const top = line.map((p) => ({ x: x(p.t), y: y(p.high) }));
  const bottom = [...line].reverse().map((p) => ({ x: x(p.t), y: y(p.low) }));
  if (line.length < 3) return `${linePath([...top, ...bottom])} Z`;
  const bottomLead = `L${f1(bottom[0].x)} ${f1(bottom[0].y)}`;
  return `${monotonePath(top)} ${bottomLead}${monotoneSegments(bottom, monotoneTangents(bottom.map((p) => ({ x: -p.x, y: p.y }))).map((t) => -t))} Z`;
}

/**
 * The span after pinching by `factor` (above 1 zooms in) about the instant `center`,
 * kept inside `limits` and at least `minDays` wide.
 */
export function zoomSpan(span: Span, factor: number, center: number, limits: Span, minDays = 7): Span {
  const width = span.to - span.from;
  const limitWidth = limits.to - limits.from;
  const next = Math.min(limitWidth, Math.max(minDays * DAY_MS, width / Math.max(factor, 1e-6)));
  const frac = width > 0 ? (center - span.from) / width : 0.5;
  let from = center - next * frac;
  let to = from + next;
  if (from < limits.from) {
    from = limits.from;
    to = from + next;
  }
  if (to > limits.to) {
    to = limits.to;
    from = Math.max(limits.from, to - next);
  }
  return { from, to };
}

/** A span from two instants in either order, at least `minDays` wide, inside `limits`. */
export function spanBetween(a: number, b: number, limits: Span, minDays = 7): Span {
  const from = Math.max(limits.from, Math.min(a, b));
  const to = Math.min(limits.to, Math.max(a, b));
  if (to - from >= minDays * DAY_MS) return { from, to };
  return zoomSpan({ from, to: Math.max(to, from + 1) }, 1, (from + to) / 2, limits, minDays);
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short" });
/** "Mar ’25": the apostrophe keeps the year from reading as a day. */
const monthYear = (d: Date) => `${MONTH.format(d)} \u2019${String(d.getFullYear() % 100).padStart(2, "0")}`;
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export interface TimeTick {
  t: number;
  label: string;
}

/**
 * Up to `max` ticks on calendar boundaries: days a week apart for short spans, else the
 * first of every 1, 2, 3, 6 or 12 months. Month ticks carry the year at January and on
 * the first tick ("Mar ’25").
 */
export function timeAxisTicks(span: Span, max = 4): TimeTick[] {
  const days = (span.to - span.from) / DAY_MS;
  if (!(days > 0)) return [{ t: span.from, label: DAY.format(new Date(span.from)) }];
  if (days <= 75) {
    const stepDays = [1, 2, 7, 14, 21, 28].find((s) => days / s <= max) ?? 28;
    const out: TimeTick[] = [];
    const start = new Date(span.from);
    start.setHours(0, 0, 0, 0);
    for (let d = new Date(start); d.getTime() <= span.to; d.setDate(d.getDate() + stepDays)) {
      if (d.getTime() >= span.from) out.push({ t: d.getTime(), label: DAY.format(d) });
    }
    return out;
  }
  const months = days / 30.44;
  const step = [1, 2, 3, 6, 12, 24].find((s) => months / s <= max) ?? 24;
  const out: TimeTick[] = [];
  const d = new Date(span.from);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  if (d.getTime() < span.from) d.setMonth(d.getMonth() + 1);
  while (d.getMonth() % step !== 0) d.setMonth(d.getMonth() + 1);
  for (; d.getTime() <= span.to; d.setMonth(d.getMonth() + step)) {
    const first = out.length === 0;
    out.push({ t: d.getTime(), label: first || d.getMonth() === 0 ? monthYear(d) : MONTH.format(d) });
  }
  return out;
}

export type DotShape = "circle" | "square" | "triangle" | "diamond" | "triangle-down" | "cross";

/** An SVG path for a dot of radius about `r` centred on (cx, cy). */
export function shapePath(shape: DotShape, cx: number, cy: number, r: number): string {
  const p = (pts: Array<[number, number]>) => `${linePath(pts.map(([x, y]) => ({ x: cx + x, y: cy + y })))} Z`;
  switch (shape) {
    case "square":
      return p([[-r * 0.85, -r * 0.85], [r * 0.85, -r * 0.85], [r * 0.85, r * 0.85], [-r * 0.85, r * 0.85]]);
    case "triangle":
      return p([[0, -r * 1.1], [r, r * 0.75], [-r, r * 0.75]]);
    case "triangle-down":
      return p([[0, r * 1.1], [r, -r * 0.75], [-r, -r * 0.75]]);
    case "diamond":
      return p([[0, -r * 1.15], [r * 1.05, 0], [0, r * 1.15], [-r * 1.05, 0]]);
    case "cross": {
      const a = r * 0.38;
      return p([
        [-a, -r], [a, -r], [a, -a], [r, -a], [r, a], [a, a], [a, r], [-a, r], [-a, a], [-r, a], [-r, -a], [-a, -a],
      ]);
    }
    default:
      return `M${f1(cx - r)} ${f1(cy)} a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0 a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0 Z`;
  }
}

/** The index of the point nearest (px, py) within `radius` px, or -1. */
export function nearestWithin(
  points: readonly { x: number; y: number }[],
  px: number,
  py: number,
  radius: number
): number {
  let best = -1;
  let bestD = radius * radius;
  points.forEach((p, i) => {
    const d = (p.x - px) ** 2 + (p.y - py) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
