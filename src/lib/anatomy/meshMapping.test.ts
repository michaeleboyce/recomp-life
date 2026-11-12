import { describe, it, expect } from "vitest";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { classifyMuscleMesh } from "./meshMapping";
import manifest from "./meshManifest.json";
import { MUSCLE_IDS, isMuscleId } from "../muscles";

describe("classifyMuscleMesh (R6)", () => {
  it("splits the deltoid by head", () => {
    expect(classifyMuscleMesh("Deltoid", "Clavicular Part Of Deltoid Muscle")).toBe("front_delts");
    expect(classifyMuscleMesh("Deltoid", "Acromial Part Of Deltoid Muscle")).toBe("side_delts");
    expect(classifyMuscleMesh("Deltoid", "Scapular Spinal Part Of Deltoid Muscle")).toBe("rear_delts");
  });

  it("splits the trapezius into upper traps and mid back", () => {
    expect(classifyMuscleMesh("Trapezius", "Descending Part Of Trapezius Muscle")).toBe("upper_traps");
    expect(classifyMuscleMesh("Trapezius", "Transverse Part Of Trapezius Muscle")).toBe("mid_back");
    expect(classifyMuscleMesh("Trapezius", "Ascending Part Of Trapezius Muscle")).toBe("mid_back");
  });

  it("keeps only the trunk portions of the spinal erectors", () => {
    expect(classifyMuscleMesh("Iliocostalis", "Iliocostalis Lumborum Muscle")).toBe("lower_back");
    expect(classifyMuscleMesh("Longissimus", "Longissimus Thoracis Muscle")).toBe("lower_back");
    expect(classifyMuscleMesh("Iliocostalis", "Iliocostalis Colli Muscle")).toBeNull();
    expect(classifyMuscleMesh("Spinalis", "Spinalis Capitis Muscle")).toBeNull();
  });

  it("does not confuse arm and leg muscles with similar names", () => {
    expect(classifyMuscleMesh("Biceps", "Long Head Of Biceps Brachii")).toBe("biceps");
    expect(classifyMuscleMesh("Biceps Femoris", "Long Head Of Biceps Femoris")).toBe("hamstrings");
    expect(classifyMuscleMesh("Extensor Digitorum", "Extensor Digitorum")).toBe("forearms");
    expect(classifyMuscleMesh("Extensor Digitorum Longus", "Extensor Digitorum Longus")).toBeNull();
  });

  it("returns null for muscles the app does not track", () => {
    expect(classifyMuscleMesh("Masseter", "Deep Part Of Masseter")).toBeNull();
    expect(classifyMuscleMesh("Sartorius", "Sartorius Muscle")).toBeNull();
  });
});

describe("anatomy model manifest (R6)", () => {
  it("tags only valid muscles", () => {
    for (const entry of manifest) {
      if (entry.muscle !== null) expect(isMuscleId(entry.muscle), entry.name).toBe(true);
      expect(["L", "R", "C"]).toContain(entry.side);
    }
  });

  it("every app muscle has meshes on both the left and the right", () => {
    for (const muscle of MUSCLE_IDS) {
      const sides = new Set(manifest.filter((e) => e.muscle === muscle).map((e) => e.side));
      expect(sides.has("L"), `${muscle} left`).toBe(true);
      expect(sides.has("R"), `${muscle} right`).toBe(true);
    }
  });

  it("left and right are balanced for every muscle", () => {
    for (const muscle of MUSCLE_IDS) {
      const entries = manifest.filter((e) => e.muscle === muscle);
      const left = entries.filter((e) => e.side === "L").length;
      const right = entries.filter((e) => e.side === "R").length;
      expect(left, muscle).toBe(right);
    }
  });

  it("ships the model and its licence notice, near 2 MB", () => {
    const model = join(process.cwd(), "public/models/anatomy.glb");
    expect(existsSync(model)).toBe(true);
    expect(statSync(model).size).toBeLessThan(2.5 * 1024 * 1024);
    expect(existsSync(join(process.cwd(), "public/models/NOTICE.md"))).toBe(true);
  });
});
