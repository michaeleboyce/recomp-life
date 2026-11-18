import { describe, expect, it } from "vitest";
import { DAY_MS } from "@/lib/dates";
import { exerciseSourceStyles, liftSourceStyles } from "./sourceStyles";
import {
  bandPath,
  lineInSpan,
  lineValueAt,
  linear,
  monotonePath,
  nearestWithin,
  shapePath,
  spanBetween,
  thinLine,
  timeAxisTicks,
  zoomSpan,
} from "./trendGeometry";

const pt = (t: number, v: number) => ({ t, v, low: v - 1, high: v + 1 });

describe("trend geometry", () => {
  it("maps and inverts a linear scale", () => {
    const x = linear(0, 10, 100, 200);
    expect(x(5)).toBe(150);
    expect(x.invert(150)).toBe(5);
    expect(linear(3, 3, 0, 10)(3)).toBe(5);
  });

  it("reads the line between points and cuts it to a span with exact ends", () => {
    const line = [pt(0, 10), pt(10, 20)];
    expect(lineValueAt(line, 5)!.v).toBe(15);
    expect(lineValueAt(line, 11)).toBeNull();
    const cut = lineInSpan(line, { from: 2, to: 8 });
    expect(cut.map((p) => [p.t, p.v])).toEqual([
      [2, 12],
      [8, 18],
    ]);
  });

  it("thins a long line keeping its ends", () => {
    const line = Array.from({ length: 1000 }, (_, i) => pt(i, i));
    const thin = thinLine(line, 100);
    expect(thin).toHaveLength(100);
    expect(thin[0].t).toBe(0);
    expect(thin[99].t).toBe(999);
  });

  it("draws a monotone curve and a closed band", () => {
    const pts = [
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: 20, y: 5 },
    ];
    expect(monotonePath(pts).startsWith("M0 10 C")).toBe(true);
    expect(bandPath([pt(0, 5), pt(1, 6), pt(2, 7)], (t) => t * 10, (v) => v).endsWith("Z")).toBe(true);
  });

  it("zooms a span about a centre inside the limits, never narrower than a week", () => {
    const limits = { from: 0, to: 100 * DAY_MS };
    const z = zoomSpan({ from: 0, to: 100 * DAY_MS }, 2, 50 * DAY_MS, limits);
    expect(z).toEqual({ from: 25 * DAY_MS, to: 75 * DAY_MS });
    const tight = zoomSpan(z, 100, 30 * DAY_MS, limits);
    expect(tight.to - tight.from).toBe(7 * DAY_MS);
    const out = zoomSpan(z, 0.1, 50 * DAY_MS, limits);
    expect(out).toEqual(limits);
    expect(spanBetween(60 * DAY_MS, 20 * DAY_MS, limits)).toEqual({ from: 20 * DAY_MS, to: 60 * DAY_MS });
  });

  it("puts month ticks with the year on the first and on January", () => {
    const span = { from: new Date(2025, 4, 28).getTime(), to: new Date(2026, 10, 17).getTime() };
    const ticks = timeAxisTicks(span, 4);
    expect(ticks.length).toBeLessThanOrEqual(4);
    expect(ticks[0].label).toMatch(/’25$/);
    expect(ticks.some((t) => t.label === "Jan ’26")).toBe(true);
    const short = timeAxisTicks({ from: new Date(2026, 9, 1).getTime(), to: new Date(2026, 9, 28).getTime() }, 4);
    expect(short[0].label).toBe("Oct 1");
  });

  it("finds the nearest dot within a radius", () => {
    expect(nearestWithin([{ x: 0, y: 0 }, { x: 10, y: 0 }], 8, 1, 5)).toBe(1);
    expect(nearestWithin([{ x: 0, y: 0 }], 30, 30, 5)).toBe(-1);
  });

  it("draws every shape as a closed path", () => {
    for (const shape of ["circle", "square", "triangle", "diamond", "triangle-down", "cross"] as const) {
      expect(shapePath(shape, 10, 10, 4).endsWith("Z")).toBe(true);
    }
  });
});

describe("source styles", () => {
  it("gives a lift's sources a colour and a shape each; imported is hollow", () => {
    const styles = liftSourceStyles([
      { id: "own", kind: "own" },
      { id: "imported", kind: "imported" },
      { id: "db_bench", kind: "related" },
      { id: "db_floor_press", kind: "related" },
    ]);
    expect(styles.get("imported")).toMatchObject({ hollow: true, shape: "circle" });
    const pairs = [...styles.values()].map((s) => `${s.color}|${s.shape}|${s.hollow}`);
    expect(new Set(pairs).size).toBe(4);
    expect(styles.get("db_bench")!.shape).not.toBe(styles.get("own")!.shape);
  });

  it("gives the first twelve exercises of a muscle distinct colour and shape pairs", () => {
    const styles = exerciseSourceStyles(Array.from({ length: 12 }, (_, i) => ({ id: `e${i}` })));
    expect(new Set([...styles.values()].map((s) => `${s.color}|${s.shape}`)).size).toBe(12);
  });
});
