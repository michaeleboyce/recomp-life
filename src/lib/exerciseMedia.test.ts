import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { EXERCISES } from "./exercises";
import {
  EXERCISE_MEDIA_IDS,
  getExerciseMedia,
  hasExercisePhotos,
} from "./exerciseMedia";

const PUBLIC = path.resolve(__dirname, "../../public");
const MEDIA_DIR = path.join(PUBLIC, "exercise-media");

describe("exerciseMedia", () => {
  it("has at least one entry", () => {
    expect(EXERCISE_MEDIA_IDS.length).toBeGreaterThan(0);
  });

  it("only contains real exercise ids", () => {
    for (const id of EXERCISE_MEDIA_IDS) {
      expect(EXERCISES[id], id).toBeDefined();
    }
  });

  it("has two distinct frames under /exercise-media/<id>/", () => {
    for (const id of EXERCISE_MEDIA_IDS) {
      const m = getExerciseMedia(id)!;
      expect(m.frames, id).toHaveLength(2);
      expect(m.frames[0]).not.toBe(m.frames[1]);
      for (const f of m.frames) {
        expect(f.startsWith(`/exercise-media/${id}/`), `${id} ${f}`).toBe(true);
      }
    }
  });

  it("has frame files on disk", () => {
    for (const id of EXERCISE_MEDIA_IDS) {
      for (const f of getExerciseMedia(id)!.frames) {
        const file = path.join(PUBLIC, f);
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size, file).toBeGreaterThan(0);
      }
    }
  });

  it("has non-empty instructions and source info", () => {
    for (const id of EXERCISE_MEDIA_IDS) {
      const m = getExerciseMedia(id)!;
      expect(m.sourceId, id).toBeTruthy();
      expect(m.sourceName, id).toBeTruthy();
      expect(m.instructions.length, id).toBeGreaterThan(0);
      for (const s of m.instructions) {
        expect(typeof s).toBe("string");
        expect(s.trim().length, id).toBeGreaterThan(0);
      }
    }
  });

  it("returns null for unknown ids", () => {
    expect(getExerciseMedia("nope")).toBeNull();
    expect(getExerciseMedia("toString")).toBeNull();
    expect(hasExercisePhotos("nope")).toBe(false);
  });

  it("hasExercisePhotos agrees with the data", () => {
    for (const id of EXERCISE_MEDIA_IDS) expect(hasExercisePhotos(id)).toBe(true);
  });

  it("has no media folder for an exercise missing from the JSON", () => {
    const folders = readdirSync(MEDIA_DIR).filter((n) =>
      statSync(path.join(MEDIA_DIR, n)).isDirectory(),
    );
    for (const dir of folders) {
      expect(EXERCISE_MEDIA_IDS, `orphan folder ${dir}`).toContain(dir);
    }
  });
});
