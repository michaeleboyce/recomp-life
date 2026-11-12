import type { RecoveryStatus, SensationType } from "@/types";

/**
 * Colours for the anatomy views, shared by the 2D figure (SVG) and the 3D
 * model (three.js needs sRGB hex, so everything is resolved to hex here).
 * Values are defined in OKLCH to match the theme tokens in globals.css.
 */

function toSrgb(linear: number): number {
  const v = linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}

function hexByte(v: number): string {
  return Math.round(v * 255)
    .toString(16)
    .padStart(2, "0");
}

/** Convert an OKLCH colour (L 0-1, C, hue in degrees) to an sRGB hex string. */
export function oklchToHex(l: number, c: number, hueDeg: number): string {
  const h = (hueDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;

  const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const bl = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;

  return `#${hexByte(toSrgb(r))}${hexByte(toSrgb(g))}${hexByte(toSrgb(bl))}`;
}

/** Neutral parts of the figure, tuned for the dark theme. */
export const FIGURE_COLORS = {
  /** Body outline stroke. */
  outline: oklchToHex(0.45, 0.01, 260),
  /** A muscle with no highlight. */
  muscle: oklchToHex(0.31, 0.008, 260),
  /** Non-muscle parts: head, hands, feet, knees. */
  inert: oklchToHex(0.25, 0.006, 260),
  hair: oklchToHex(0.21, 0.006, 260),
  /** Gap lines between shapes; matches the card surface. */
  seam: oklchToHex(0.18, 0.005, 260),
  /** Selected shape. */
  selected: "#3b82f6",
  selectedStroke: "#93c5fd",
  /** Bones in the 3D model. */
  bone: oklchToHex(0.82, 0.02, 85),
} as const;

/**
 * Training load ramp in the app's accent hue (160). Index is the heat level:
 * 0 resting ... 4 most worked. Red and amber are reserved for pain/soreness.
 */
export const HEAT_COLORS: readonly [string, string, string, string, string] = [
  FIGURE_COLORS.muscle,
  oklchToHex(0.38, 0.05, 160),
  oklchToHex(0.5, 0.09, 160),
  oklchToHex(0.65, 0.13, 160),
  oklchToHex(0.85, 0.17, 160),
];

/** Same hues as the recovery bars on the dashboard. */
export const RECOVERY_COLORS: Record<RecoveryStatus, string> = {
  recovering: oklchToHex(0.65, 0.18, 55),
  ready: oklchToHex(0.7, 0.16, 85),
  primed: oklchToHex(0.65, 0.17, 155),
  detraining: oklchToHex(0.45, 0.02, 260),
};

/** Blend two hex colours. t = 0 gives `from`, t = 1 gives `to`. */
export function mixHex(from: string, to: string, t: number): string {
  const k = Math.min(1, Math.max(0, t));
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  let out = "#";
  for (let i = 0; i < 3; i++) {
    const v = Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * k);
    out += v.toString(16).padStart(2, "0");
  }
  return out;
}

const SEVERITY_OPACITY = [0.25, 0.38, 0.5, 0.69, 1] as const;

/** Pain is red, soreness amber; opacity grows with severity (1-5). */
export function painColor(
  sensation: SensationType,
  severity: number
): { fill: string; stroke: string; opacity: number } {
  const idx = Math.min(5, Math.max(1, Math.round(severity))) - 1;
  return sensation === "pain"
    ? { fill: "#ef4444", stroke: "#dc2626", opacity: SEVERITY_OPACITY[idx] }
    : { fill: "#f59e0b", stroke: "#d97706", opacity: SEVERITY_OPACITY[idx] };
}
