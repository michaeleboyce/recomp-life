import type { RecoveryStatus, SensationType } from "@/types";

/**
 * Colours for the anatomy views: the single place that maps meaning to colour.
 *
 * The 2D figure and the pain body map are SVG, so they use the `--anatomy-*` CSS
 * variables defined in globals.css (both themes): they follow the theme with no
 * JavaScript and no flash. The values below are the source of those tokens, and
 * palette.test.ts checks that globals.css matches them.
 *
 * three.js cannot read CSS variables, so the 3D scenes take concrete hex colours
 * from SCENE_PALETTES for the applied theme (see useAppliedTheme).
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

/** Each `--anatomy-<token>` custom property, by meaning. */
export const ANATOMY_TOKENS = [
  /** Body outline stroke. */
  "outline",
  /** A muscle with no highlight (heat level 0). */
  "rest",
  /** Non-muscle parts: head, hands, feet, knees. */
  "inert",
  "hair",
  /** Gap lines between shapes; the card surface. */
  "seam",
  /** Selected shape. */
  "selected",
  "selected-stroke",
  /** Training load ramp, levels 1 (light) to 4 (most worked), in the accent hue. */
  "heat-1",
  "heat-2",
  "heat-3",
  "heat-4",
  /** Recovery status (fills on the figure and the status label text). */
  "recovering",
  "ready",
  "primed",
  "detraining",
  /** Pain is red and soreness amber; red and amber are not used for load. */
  "pain",
  "pain-stroke",
  "sore",
  "sore-stroke",
  /** Pain body map: a tappable region with nothing logged, and the joint dot ring. */
  "region",
  "region-stroke",
  "joint-ring",
] as const;

export type AnatomyToken = (typeof ANATOMY_TOKENS)[number];
export type SceneTheme = "dark" | "light";
type Oklch = readonly [l: number, c: number, h: number];

/** Dark theme: the colours the app drew before the light theme existed, unchanged. */
export const ANATOMY_DARK: Record<AnatomyToken, string> = {
  outline: oklchToHex(0.45, 0.01, 260),
  rest: oklchToHex(0.31, 0.008, 260),
  inert: oklchToHex(0.25, 0.006, 260),
  hair: oklchToHex(0.21, 0.006, 260),
  seam: oklchToHex(0.18, 0.005, 260),
  selected: "#3b82f6",
  "selected-stroke": "#93c5fd",
  "heat-1": oklchToHex(0.38, 0.05, 160),
  "heat-2": oklchToHex(0.5, 0.09, 160),
  "heat-3": oklchToHex(0.65, 0.13, 160),
  "heat-4": oklchToHex(0.85, 0.17, 160),
  recovering: oklchToHex(0.65, 0.18, 55),
  ready: oklchToHex(0.7, 0.16, 85),
  primed: oklchToHex(0.65, 0.17, 155),
  detraining: oklchToHex(0.45, 0.02, 260),
  pain: "#ef4444",
  "pain-stroke": "#dc2626",
  sore: "#f59e0b",
  "sore-stroke": "#d97706",
  region: "#374151",
  "region-stroke": "#4b5563",
  "joint-ring": "#9ca3af",
};

/**
 * Light theme, for a near-white card (--card, L 0.995). Resting muscle is a light
 * neutral at 1.5:1 or more on the card; non-muscle parts sit closer to the card and
 * the outline further from it. The heat ramp runs from pale to saturated sage,
 * darkening at every level, and the top level clears 3:1. Pain and soreness follow
 * --destructive and --warning; recovery colours are dark enough to read as text.
 */
export const ANATOMY_LIGHT: Record<AnatomyToken, Oklch> = {
  outline: [0.68, 0.01, 260],
  rest: [0.85, 0.008, 260],
  inert: [0.91, 0.006, 260],
  hair: [0.78, 0.008, 260],
  seam: [0.995, 0.002, 250],
  selected: [0.6, 0.15, 255],
  "selected-stroke": [0.45, 0.14, 255],
  "heat-1": [0.78, 0.06, 160],
  "heat-2": [0.69, 0.09, 160],
  "heat-3": [0.59, 0.11, 160],
  "heat-4": [0.49, 0.11, 160],
  recovering: [0.55, 0.15, 50],
  ready: [0.53, 0.11, 85],
  primed: [0.5, 0.12, 155],
  detraining: [0.52, 0.015, 260],
  pain: [0.56, 0.2, 27],
  "pain-stroke": [0.47, 0.18, 27],
  sore: [0.66, 0.15, 70],
  "sore-stroke": [0.55, 0.13, 65],
  region: [0.82, 0.015, 255],
  "region-stroke": [0.7, 0.02, 255],
  "joint-ring": [0.58, 0.015, 260],
};

/** `var(--anatomy-<token>)`, for SVG fills, strokes and inline styles. */
export function anatomyVar(token: AnatomyToken): string {
  return `var(--anatomy-${token})`;
}

/** The concrete colour of a token in a theme, as sRGB hex. */
export function anatomyHex(token: AnatomyToken, theme: SceneTheme): string {
  return theme === "dark" ? ANATOMY_DARK[token] : oklchToHex(...ANATOMY_LIGHT[token]);
}

/** Neutral parts of the 2D figure. */
export const FIGURE_COLORS = {
  outline: anatomyVar("outline"),
  muscle: anatomyVar("rest"),
  inert: anatomyVar("inert"),
  hair: anatomyVar("hair"),
  seam: anatomyVar("seam"),
  selected: anatomyVar("selected"),
  selectedStroke: anatomyVar("selected-stroke"),
} as const;

/**
 * Training load ramp in the app's accent hue (160). Index is the heat level:
 * 0 resting ... 4 most worked. Red and amber are reserved for pain/soreness.
 */
export const HEAT_COLORS: readonly [string, string, string, string, string] = [
  FIGURE_COLORS.muscle,
  anatomyVar("heat-1"),
  anatomyVar("heat-2"),
  anatomyVar("heat-3"),
  anatomyVar("heat-4"),
];

/** Same hues as the recovery bars on the dashboard. */
export const RECOVERY_COLORS: Record<RecoveryStatus, string> = {
  recovering: anatomyVar("recovering"),
  ready: anatomyVar("ready"),
  primed: anatomyVar("primed"),
  detraining: anatomyVar("detraining"),
};

/** The pain body map's own colours (regions it can log against). */
export const BODY_MAP_COLORS = {
  region: anatomyVar("region"),
  regionStroke: anatomyVar("region-stroke"),
  jointRing: anatomyVar("joint-ring"),
  selected: FIGURE_COLORS.selected,
  selectedStroke: FIGURE_COLORS.selectedStroke,
} as const;

const SEVERITY_OPACITY = [0.25, 0.38, 0.5, 0.69, 1] as const;

/** Pain is red, soreness amber; opacity grows with severity (1-5). */
export function painColor(
  sensation: SensationType,
  severity: number
): { fill: string; stroke: string; opacity: number } {
  const idx = Math.min(5, Math.max(1, Math.round(severity))) - 1;
  return sensation === "pain"
    ? { fill: anatomyVar("pain"), stroke: anatomyVar("pain-stroke"), opacity: SEVERITY_OPACITY[idx] }
    : { fill: anatomyVar("sore"), stroke: anatomyVar("sore-stroke"), opacity: SEVERITY_OPACITY[idx] };
}

/**
 * Body-map fill for a logged entry: the pain or soreness colour blended into the
 * empty region by severity. Mixed in sRGB, the same blend the map used before.
 */
export function painFill(sensation: SensationType, severity: number): { fill: string; stroke: string } {
  const c = painColor(sensation, severity);
  const fill =
    c.opacity >= 1
      ? c.fill
      : `color-mix(in srgb, ${c.fill} ${Math.round(c.opacity * 100)}%, ${BODY_MAP_COLORS.region})`;
  return { fill, stroke: c.stroke };
}

// ---- 3D scenes (three.js needs concrete colours) ----

export interface ScenePalette {
  anatomy: {
    /** Tracked muscle at rest. Lighter than the 2D resting fill in dark mode: shaded surfaces read darker. */
    rest: string;
    /** Untracked muscles. */
    other: string;
    /** Heat levels 1-4. */
    heat: readonly [string, string, string, string];
    /** Emissive glow per heat level 1-4 (0 = none). */
    heatEmissive: readonly [number, number, number, number];
    bone: string;
    selected: string;
  };
  mannequin: {
    body: string;
    joint: string;
    steel: string;
    plate: string;
    pad: string;
    floor: string;
    /** Bar path line. */
    trace: string;
  };
}

const heatHex = (theme: SceneTheme) =>
  [
    anatomyHex("heat-1", theme),
    anatomyHex("heat-2", theme),
    anatomyHex("heat-3", theme),
    anatomyHex("heat-4", theme),
  ] as const;

/**
 * Both scenes draw on a transparent canvas, so the page shows through. Dark is the
 * original scene. Light keeps the same structure on a light page: lighter neutral
 * muscle with the light heat ramp and no glow (glow washes out on white), a darker
 * mannequin so it does not vanish against the page, and a light floor disc.
 */
export const SCENE_PALETTES: Record<SceneTheme, ScenePalette> = {
  dark: {
    anatomy: {
      rest: "#6b7080",
      other: "#565a66",
      heat: heatHex("dark"),
      heatEmissive: [0, 0, 0.12, 0.28],
      bone: oklchToHex(0.82, 0.02, 85),
      selected: ANATOMY_DARK.selected,
    },
    mannequin: {
      body: "#cfd4de",
      joint: "#aeb4c0",
      steel: "#8d929c",
      plate: "#737986",
      pad: "#5d6370",
      floor: "#23262e",
      trace: ANATOMY_DARK["heat-4"],
    },
  },
  light: {
    anatomy: {
      rest: oklchToHex(0.83, 0.008, 260),
      other: oklchToHex(0.88, 0.006, 260),
      heat: heatHex("light"),
      heatEmissive: [0, 0, 0, 0],
      bone: oklchToHex(0.8, 0.03, 85),
      selected: anatomyHex("selected", "light"),
    },
    mannequin: {
      body: oklchToHex(0.68, 0.012, 260),
      joint: oklchToHex(0.58, 0.012, 260),
      steel: oklchToHex(0.62, 0.01, 260),
      plate: oklchToHex(0.46, 0.01, 260),
      pad: oklchToHex(0.4, 0.01, 260),
      floor: oklchToHex(0.92, 0.006, 250),
      trace: anatomyHex("heat-4", "light"),
    },
  },
};

const VAR_RE = /^var\(--anatomy-([a-z0-9-]+)\)$/;

/**
 * A colour the 3D scene can use: an anatomy variable (e.g. a RECOVERY_COLORS entry)
 * resolves to that token's hex in the theme; anything else is passed through.
 */
export function sceneColor(color: string, theme: SceneTheme): string {
  const m = VAR_RE.exec(color);
  if (m && (ANATOMY_TOKENS as readonly string[]).includes(m[1])) {
    return anatomyHex(m[1] as AnatomyToken, theme);
  }
  return color;
}
