import { describe, it, expect } from "vitest";
import {
  MUSCLE_FIGURE_SLUGS,
  figureHeat,
  slugToMuscle,
  slugMuscles,
  REGION_TARGETS,
  regionForShape,
  jointPosition,
  ALL_BODY_REGIONS,
} from "./regionMapping";
import { MUSCLE_IDS } from "../muscles";
import { maleFigure } from "@/components/Anatomy/figure/paths.male";
import { femaleFigure } from "@/components/Anatomy/figure/paths.female";
import type { FigureData, FigureViewName } from "./figureTypes";

const FIGURES: [string, FigureData][] = [
  ["male", maleFigure],
  ["female", femaleFigure],
];
const VIEWS: FigureViewName[] = ["front", "back"];

describe("muscle → figure shapes (R4)", () => {
  it("every muscle maps to at least one shape", () => {
    for (const id of MUSCLE_IDS) {
      const m = MUSCLE_FIGURE_SLUGS[id];
      expect(m.front.length + m.back.length, id).toBeGreaterThan(0);
    }
  });

  it("every mapped slug exists in both figures for that view", () => {
    for (const [name, figure] of FIGURES) {
      for (const id of MUSCLE_IDS) {
        for (const view of VIEWS) {
          const available = new Set(figure[view].shapes.map((s) => s.slug));
          for (const slug of MUSCLE_FIGURE_SLUGS[id][view]) {
            expect(available.has(slug), `${name} ${view} ${id} -> ${slug}`).toBe(true);
          }
        }
      }
    }
  });

  it("figureHeat takes the highest level among muscles on a shape", () => {
    // lats and rotator_cuff both draw on the back upper-back shape
    const heat = figureHeat({ lats: 2, rotator_cuff: 4, chest: 3 }, "back");
    expect(heat["upper-back"]).toBe(4);
    expect(heat.chest).toBeUndefined(); // chest is front only
    expect(figureHeat({ chest: 3 }, "front").chest).toBe(3);
  });

  it("figureHeat ignores zero levels", () => {
    expect(figureHeat({ chest: 0 }, "front")).toEqual({});
  });

  it("slugToMuscle returns the main muscle for a tapped shape", () => {
    expect(slugToMuscle("chest", "front")).toBe("chest");
    expect(slugToMuscle("deltoids", "front")).toBe("front_delts");
    expect(slugToMuscle("deltoids", "back")).toBe("rear_delts");
    expect(slugToMuscle("upper-back", "back")).toBe("lats");
    expect(slugToMuscle("quadriceps", "front")).toBe("quads");
    expect(slugToMuscle("head", "front")).toBeNull();
  });

  it("slugMuscles lists every muscle drawn on a shape", () => {
    expect(slugMuscles("upper-back", "back").sort()).toEqual(
      ["lats", "mid_back", "rotator_cuff"].sort()
    );
    expect(slugMuscles("deltoids", "front").sort()).toEqual(
      ["front_delts", "side_delts"].sort()
    );
  });

  it("slugToMuscle is consistent with the muscle → slug table", () => {
    for (const view of VIEWS) {
      for (const shape of maleFigure[view].shapes) {
        const muscle = slugToMuscle(shape.slug, view);
        if (muscle) {
          expect(MUSCLE_FIGURE_SLUGS[muscle][view]).toContain(shape.slug);
        }
      }
    }
  });
});

describe("pain regions ↔ figure (R5)", () => {
  it("covers all 19 body regions", () => {
    expect(ALL_BODY_REGIONS).toHaveLength(19);
    for (const region of ALL_BODY_REGIONS) {
      expect(REGION_TARGETS[region].length, region).toBeGreaterThan(0);
    }
  });

  it("every shape target exists on both figures", () => {
    for (const [name, figure] of FIGURES) {
      for (const region of ALL_BODY_REGIONS) {
        const usable = REGION_TARGETS[region].some((t) => {
          if (t.kind === "joint") return true;
          return figure[t.view].shapes.some(
            (s) => s.slug === t.slug && (t.side === "any" || s.side === t.side)
          );
        });
        expect(usable, `${name} ${region}`).toBe(true);
      }
    }
  });

  it("shape targets round-trip to their region", () => {
    for (const region of ALL_BODY_REGIONS) {
      for (const t of REGION_TARGETS[region]) {
        if (t.kind !== "shape") continue;
        const side = t.side === "any" ? "left" : t.side;
        expect(regionForShape(t.view, t.slug, side), `${region} ${t.slug}`).toBe(region);
      }
    }
  });

  it("maps sides anatomically", () => {
    expect(regionForShape("front", "quadriceps", "left")).toBe("left_quad");
    expect(regionForShape("front", "quadriceps", "right")).toBe("right_quad");
    expect(regionForShape("front", "knees", "left")).toBe("left_knee");
    expect(regionForShape("back", "hamstring", "right")).toBe("right_hamstring");
    expect(regionForShape("front", "deltoids", "left")).toBe("left_shoulder");
    expect(regionForShape("back", "gluteal", "left")).toBe("left_hip");
    expect(regionForShape("front", "hands", "right")).toBe("right_wrist");
  });

  it("maps trunk shapes to unsided regions", () => {
    expect(regionForShape("front", "chest", "left")).toBe("chest");
    expect(regionForShape("front", "abs", "right")).toBe("core");
    expect(regionForShape("front", "obliques", "left")).toBe("core");
    expect(regionForShape("back", "upper-back", "left")).toBe("upper_back");
    expect(regionForShape("back", "lower-back", "right")).toBe("lower_back");
    expect(regionForShape("front", "neck", "center")).toBe("neck");
  });

  it("returns null for shapes with no pain region", () => {
    expect(regionForShape("front", "biceps", "left")).toBeNull();
    expect(regionForShape("front", "head", "center")).toBeNull();
    expect(regionForShape("back", "calves", "left")).toBeNull();
  });

  it("has joint markers for elbow, wrist and hip on each side", () => {
    for (const side of ["left", "right"] as const) {
      expect(REGION_TARGETS[`${side}_elbow`].some((t) => t.kind === "joint")).toBe(true);
      expect(REGION_TARGETS[`${side}_wrist`].some((t) => t.kind === "joint")).toBe(true);
      expect(REGION_TARGETS[`${side}_hip`].some((t) => t.kind === "joint")).toBe(true);
    }
  });
});

describe("jointPosition (R5)", () => {
  it("places every joint marker inside the view box on both figures", () => {
    for (const [name, figure] of FIGURES) {
      for (const region of ALL_BODY_REGIONS) {
        for (const t of REGION_TARGETS[region]) {
          if (t.kind !== "joint") continue;
          const view = figure[t.view];
          const p = jointPosition(view, t.view, t.joint, t.side);
          const label = `${name} ${t.view} ${t.joint} ${t.side}`;
          expect(p, label).not.toBeNull();
          const [x, y, w, h] = view.viewBox;
          expect(p!.x, label).toBeGreaterThan(x);
          expect(p!.x, label).toBeLessThan(x + w);
          expect(p!.y, label).toBeGreaterThan(y);
          expect(p!.y, label).toBeLessThan(y + h);
        }
      }
    }
  });

  it("puts the body's left on the viewer's right in the front view", () => {
    const view = maleFigure.front;
    const mid = view.viewBox[0] + view.viewBox[2] / 2;
    expect(jointPosition(view, "front", "elbow", "left")!.x).toBeGreaterThan(mid);
    expect(jointPosition(view, "front", "elbow", "right")!.x).toBeLessThan(mid);
  });

  it("puts the body's left on the viewer's left in the back view", () => {
    const view = maleFigure.back;
    const mid = view.viewBox[0] + view.viewBox[2] / 2;
    expect(jointPosition(view, "back", "elbow", "left")!.x).toBeLessThan(mid);
  });

  it("orders joints down the arm: elbow above wrist", () => {
    const view = maleFigure.front;
    const elbow = jointPosition(view, "front", "elbow", "left")!;
    const wrist = jointPosition(view, "front", "wrist", "left")!;
    expect(elbow.y).toBeLessThan(wrist.y);
  });
});
