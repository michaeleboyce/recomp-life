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
  /** Training load ramp, levels 1 (least) to 4 (most worked), in burnt orange. */
  "heat-1",
  "heat-2",
  "heat-3",
  "heat-4",
  /** Recovery status (fills on the figure and the status label text). */
  "recovering",
  "ready",
  "primed",
  "detraining",
  /** Pain is red and soreness mustard; neither is used for load. */
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
/**
 * Dark theme ("espresso", card #241b16). Neutral parts are warm browns stepping out
 * from the card. The load ramp is burnt orange that gets lighter and brighter as load
 * rises, from a dim rust to a bright orange that clears 3:1 on the card. Pain is red
 * and soreness mustard; recovery labels are text colours.
 */
export const ANATOMY_DARK: Record<AnatomyToken, string> = {
  outline: "#7d6c5b",
  rest: "#3b2f27",
  inert: "#2b221d",
  hair: "#211915",
  seam: "#241b16",
  selected: "#6dbdb3",
  "selected-stroke": "#a9ddd6",
  "heat-1": "#553224",
  "heat-2": "#84432a",
  "heat-3": "#bd5a31",
  "heat-4": "#f47c45",
  recovering: "#ef7a4a",
  ready: "#e0a93b",
  primed: "#6dbdb3",
  detraining: "#988672",
  pain: "#e8584a",
  "pain-stroke": "#c4402f",
  sore: "#e0a93b",
  "sore-stroke": "#b8862a",
  region: "#3b2f27",
  "region-stroke": "#54443a",
  "joint-ring": "#b8a892",
};

/**
 * Light theme ("paper", card #eadfca). Resting muscle is a tan a step darker than the
 * card; non-muscle parts sit closer to the card and the outline further from it. The
 * load ramp runs from pale peach to burnt orange, darkening at every level, and the
 * top level clears 3:1. Recovery colours are dark enough to read as text.
 */
export const ANATOMY_LIGHT: Record<AnatomyToken, string> = {
  outline: "#8a7762",
  rest: "#d5c4a5",
  inert: "#e2d6bf",
  hair: "#c4b393",
  seam: "#eadfca",
  selected: "#2f6f6b",
  "selected-stroke": "#1f4f4c",
  "heat-1": "#efc9a6",
  "heat-2": "#e6a070",
  "heat-3": "#d67440",
  "heat-4": "#b8472a",
  recovering: "#9c3f1f",
  ready: "#85590c",
  primed: "#2a6662",
  detraining: "#5f4f42",
  pain: "#b83a2c",
  "pain-stroke": "#8f2a20",
  sore: "#9e6c10",
  "sore-stroke": "#7a520a",
  region: "#c9b694",
  "region-stroke": "#a8946f",
  "joint-ring": "#8a7762",
};

/** `var(--anatomy-<token>)`, for SVG fills, strokes and inline styles. */
export function anatomyVar(token: AnatomyToken): string {
  return `var(--anatomy-${token})`;
}

/** The concrete colour of a token in a theme, as sRGB hex. */
export function anatomyHex(token: AnatomyToken, theme: SceneTheme): string {
  return theme === "dark" ? ANATOMY_DARK[token] : ANATOMY_LIGHT[token];
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
 * Training load ramp in burnt orange. Index is the heat level: 0 resting ... 4 most
 * worked. Red and mustard are reserved for pain/soreness.
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
 * Both scenes draw on a transparent canvas, so the page shows through. Dark: warm
 * brown muscle with the burnt-orange ramp and a glow on the top levels, and a cream
 * mannequin. Light: tan muscle with the light ramp and no glow (glow washes out on
 * cream), a brown mannequin so it does not vanish against the page, and a light
 * floor disc.
 */
export const SCENE_PALETTES: Record<SceneTheme, ScenePalette> = {
  dark: {
    anatomy: {
      rest: "#7a6655",
      other: "#5e4e42",
      heat: heatHex("dark"),
      heatEmissive: [0, 0, 0.12, 0.28],
      bone: oklchToHex(0.86, 0.03, 80),
      selected: ANATOMY_DARK.selected,
    },
    mannequin: {
      body: "#e8dcc7",
      joint: "#c4b49c",
      steel: "#9a8b7a",
      plate: "#7d6c5b",
      pad: "#5e4e42",
      floor: "#2b221d",
      trace: ANATOMY_DARK["heat-4"],
    },
  },
  light: {
    anatomy: {
      rest: "#cdbd9f",
      other: "#ddd0b8",
      heat: heatHex("light"),
      heatEmissive: [0, 0, 0, 0],
      bone: oklchToHex(0.8, 0.03, 85),
      selected: ANATOMY_LIGHT.selected,
    },
    mannequin: {
      body: "#a08c76",
      joint: "#8a7762",
      steel: "#94826e",
      plate: "#5f4f42",
      pad: "#4f4136",
      floor: "#e2d6bf",
      trace: ANATOMY_LIGHT["heat-4"],
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
