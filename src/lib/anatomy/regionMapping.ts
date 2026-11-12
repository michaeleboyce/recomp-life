import type { BodyRegion, MuscleId } from "@/types";
import type { HeatLevel, MuscleHeat } from "../muscleLoad";
import { MUSCLE_IDS } from "../muscles";
import type {
  FigureShape,
  FigureSide,
  FigureSlug,
  FigureView,
  FigureViewName,
} from "./figureTypes";

/**
 * Mapping between the app's data (muscles, pain regions) and the shapes of
 * the 2D body figure. Pure functions and tables.
 *
 * Sides are anatomical everywhere: "left" is the body's own left.
 */

// ─── Muscles ↔ shapes ────────────────────────────────────────────────────────

/** Which figure shapes show each muscle, per view. */
export const MUSCLE_FIGURE_SLUGS: Record<
  MuscleId,
  Record<FigureViewName, FigureSlug[]>
> = {
  chest: { front: ["chest"], back: [] },
  front_delts: { front: ["deltoids"], back: [] },
  side_delts: { front: ["deltoids"], back: ["deltoids"] },
  rear_delts: { front: [], back: ["deltoids"] },
  rotator_cuff: { front: [], back: ["upper-back"] },
  biceps: { front: ["biceps"], back: [] },
  triceps: { front: ["triceps"], back: ["triceps"] },
  forearms: { front: ["forearm"], back: ["forearm"] },
  upper_traps: { front: ["trapezius"], back: ["trapezius"] },
  mid_back: { front: [], back: ["trapezius", "upper-back"] },
  lats: { front: [], back: ["upper-back"] },
  lower_back: { front: [], back: ["lower-back"] },
  abs: { front: ["abs"], back: [] },
  obliques: { front: ["obliques"], back: [] },
  glutes: { front: [], back: ["gluteal"] },
  quads: { front: ["quadriceps"], back: [] },
  hamstrings: { front: [], back: ["hamstring"] },
  adductors: { front: ["adductors"], back: ["adductors"] },
  calves: { front: ["calves"], back: ["calves"] },
};

/** The muscle a tap on a shape selects, when a shape shows several. */
const PRINCIPAL_MUSCLE: Record<FigureViewName, Partial<Record<FigureSlug, MuscleId>>> = {
  front: {
    chest: "chest",
    deltoids: "front_delts",
    biceps: "biceps",
    triceps: "triceps",
    forearm: "forearms",
    trapezius: "upper_traps",
    abs: "abs",
    obliques: "obliques",
    adductors: "adductors",
    quadriceps: "quads",
    calves: "calves",
  },
  back: {
    deltoids: "rear_delts",
    trapezius: "upper_traps",
    "upper-back": "lats",
    triceps: "triceps",
    forearm: "forearms",
    "lower-back": "lower_back",
    gluteal: "glutes",
    adductors: "adductors",
    hamstring: "hamstrings",
    calves: "calves",
  },
};

/** Heat per figure shape for one view: the highest level among its muscles. */
export function figureHeat(
  heat: MuscleHeat,
  view: FigureViewName
): Partial<Record<FigureSlug, HeatLevel>> {
  const out: Partial<Record<FigureSlug, HeatLevel>> = {};
  for (const [muscle, level] of Object.entries(heat) as [MuscleId, HeatLevel][]) {
    if (!level) continue;
    for (const slug of MUSCLE_FIGURE_SLUGS[muscle]?.[view] ?? []) {
      if ((out[slug] ?? 0) < level) out[slug] = level;
    }
  }
  return out;
}

/** The muscle selected by tapping a shape, or null for non-muscle shapes. */
export function slugToMuscle(slug: FigureSlug, view: FigureViewName): MuscleId | null {
  return PRINCIPAL_MUSCLE[view][slug] ?? null;
}

/** Every muscle drawn on a shape in a view. */
export function slugMuscles(slug: FigureSlug, view: FigureViewName): MuscleId[] {
  return MUSCLE_IDS.filter((m) => MUSCLE_FIGURE_SLUGS[m][view].includes(slug));
}

// ─── Pain regions ↔ shapes and joint markers ─────────────────────────────────

export const ALL_BODY_REGIONS: readonly BodyRegion[] = [
  "neck",
  "left_shoulder",
  "right_shoulder",
  "chest",
  "core",
  "upper_back",
  "lower_back",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_quad",
  "right_quad",
  "left_hamstring",
  "right_hamstring",
  "left_knee",
  "right_knee",
];

export type JointName = "elbow" | "wrist" | "hip";
export type BodySide = "left" | "right";

export type RegionTarget =
  | { kind: "shape"; view: FigureViewName; slug: FigureSlug; side: BodySide | "any" }
  | { kind: "joint"; view: FigureViewName; joint: JointName; side: BodySide };

function sidedTargets(side: BodySide): Record<string, RegionTarget[]> {
  return {
    [`${side}_shoulder`]: [
      { kind: "shape", view: "front", slug: "deltoids", side },
      { kind: "shape", view: "back", slug: "deltoids", side },
    ],
    [`${side}_elbow`]: [
      { kind: "joint", view: "front", joint: "elbow", side },
      { kind: "joint", view: "back", joint: "elbow", side },
    ],
    [`${side}_wrist`]: [
      { kind: "joint", view: "front", joint: "wrist", side },
      { kind: "joint", view: "back", joint: "wrist", side },
      { kind: "shape", view: "front", slug: "hands", side },
      { kind: "shape", view: "back", slug: "hands", side },
    ],
    [`${side}_hip`]: [
      { kind: "joint", view: "front", joint: "hip", side },
      { kind: "shape", view: "back", slug: "gluteal", side },
    ],
    [`${side}_quad`]: [{ kind: "shape", view: "front", slug: "quadriceps", side }],
    [`${side}_hamstring`]: [{ kind: "shape", view: "back", slug: "hamstring", side }],
    [`${side}_knee`]: [{ kind: "shape", view: "front", slug: "knees", side }],
  };
}

/**
 * Where each pain region is drawn and tapped. Regions the figure has no area
 * for (elbow, wrist, hip) get joint markers.
 */
export const REGION_TARGETS = {
  neck: [
    { kind: "shape", view: "front", slug: "neck", side: "any" },
    { kind: "shape", view: "back", slug: "neck", side: "any" },
  ],
  chest: [{ kind: "shape", view: "front", slug: "chest", side: "any" }],
  core: [
    { kind: "shape", view: "front", slug: "abs", side: "any" },
    { kind: "shape", view: "front", slug: "obliques", side: "any" },
  ],
  upper_back: [
    { kind: "shape", view: "back", slug: "upper-back", side: "any" },
    { kind: "shape", view: "back", slug: "trapezius", side: "any" },
    { kind: "shape", view: "front", slug: "trapezius", side: "any" },
  ],
  lower_back: [{ kind: "shape", view: "back", slug: "lower-back", side: "any" }],
  ...sidedTargets("left"),
  ...sidedTargets("right"),
} as Record<BodyRegion, RegionTarget[]>;

/** The pain region a figure shape belongs to, or null when it has none. */
export function regionForShape(
  view: FigureViewName,
  slug: FigureSlug,
  side: FigureSide
): BodyRegion | null {
  const sided = (suffix: string): BodyRegion | null =>
    side === "center" ? null : (`${side}_${suffix}` as BodyRegion);

  switch (slug) {
    case "neck":
      return "neck";
    case "chest":
      return view === "front" ? "chest" : null;
    case "abs":
    case "obliques":
      return "core";
    case "upper-back":
    case "trapezius":
      return "upper_back";
    case "lower-back":
      return "lower_back";
    case "deltoids":
      return sided("shoulder");
    case "quadriceps":
      return sided("quad");
    case "hamstring":
      return sided("hamstring");
    case "knees":
      return sided("knee");
    case "gluteal":
      return sided("hip");
    case "hands":
      return sided("wrist");
    default:
      return null;
  }
}

function centerX(shape: FigureShape): number {
  return (shape.bbox[0] + shape.bbox[2]) / 2;
}

/**
 * Position of a joint marker in view-box units, derived from the bounding
 * boxes of the neighbouring shapes. Null when the figure lacks those shapes.
 */
export function jointPosition(
  view: FigureView,
  viewName: FigureViewName,
  joint: JointName,
  side: BodySide
): { x: number; y: number } | null {
  const find = (slug: FigureSlug) =>
    view.shapes.find((s) => s.slug === slug && s.side === side);
  const midX = view.viewBox[0] + view.viewBox[2] / 2;

  switch (joint) {
    case "elbow": {
      const upper =
        (viewName === "front" ? find("biceps") : find("triceps")) ??
        find("triceps") ??
        find("biceps");
      const fore = find("forearm");
      if (!upper || !fore) return null;
      return { x: centerX(upper), y: (upper.bbox[3] + fore.bbox[1]) / 2 };
    }
    case "wrist": {
      const fore = find("forearm");
      const hand = find("hands");
      if (!fore || !hand) return null;
      // Arms angle away from the body, so the wrist sits at the forearm's
      // outer edge, where it meets the hand's inner edge.
      const outerIsLow = centerX(fore) < midX;
      const x = outerIsLow
        ? (fore.bbox[0] + hand.bbox[2]) / 2
        : (fore.bbox[2] + hand.bbox[0]) / 2;
      return { x, y: (fore.bbox[3] + hand.bbox[1]) / 2 };
    }
    case "hip": {
      const quad = find("quadriceps");
      if (!quad) return null;
      const outward = centerX(quad) < midX ? -1 : 1;
      const width = quad.bbox[2] - quad.bbox[0];
      return {
        x: centerX(quad) + outward * width * 0.12,
        y: quad.bbox[1] + view.viewBox[3] * 0.012,
      };
    }
  }
}
