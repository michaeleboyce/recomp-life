import { describe, it, expect } from "vitest";
import {
  oklchToHex,
  HEAT_COLORS,
  RECOVERY_COLORS,
  painColor,
  FIGURE_COLORS,
} from "./palette";

describe("oklchToHex", () => {
  it("converts achromatic colours", () => {
    expect(oklchToHex(0, 0, 0)).toBe("#000000");
    expect(oklchToHex(1, 0, 0)).toBe("#ffffff");
  });

  it("produces a 7-character hex string", () => {
    expect(oklchToHex(0.65, 0.1, 160)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("keeps the accent hue green-dominant", () => {
    const hex = oklchToHex(0.65, 0.1, 160);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("clamps out-of-gamut values instead of wrapping", () => {
    expect(oklchToHex(0.9, 0.4, 30)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("palette", () => {
  it("has five heat colours that get lighter with level", () => {
    expect(HEAT_COLORS).toHaveLength(5);
    const lum = (hex: string) =>
      parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    for (let i = 2; i < 5; i++) {
      expect(lum(HEAT_COLORS[i])).toBeGreaterThan(lum(HEAT_COLORS[i - 1]));
    }
  });

  it("level 0 is the resting muscle colour", () => {
    expect(HEAT_COLORS[0]).toBe(FIGURE_COLORS.muscle);
  });

  it("has a colour for each recovery status", () => {
    for (const s of ["recovering", "ready", "primed", "detraining"] as const) {
      expect(RECOVERY_COLORS[s]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("pain is red, soreness amber, stronger with severity", () => {
    expect(painColor("pain", 5).fill).toBe("#ef4444");
    expect(painColor("soreness", 5).fill).toBe("#f59e0b");
    expect(painColor("pain", 1).opacity).toBeLessThan(painColor("pain", 5).opacity);
  });
});
