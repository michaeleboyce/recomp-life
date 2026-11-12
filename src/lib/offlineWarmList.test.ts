import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getOfflineWarmList } from "./offlineWarmList";
import { EXERCISES } from "./exercises";
import { EXERCISE_MEDIA_IDS } from "./exerciseMedia";

describe("getOfflineWarmList (R17)", () => {
  const list = getOfflineWarmList();

  it("includes the 3D model and its decoder", () => {
    expect(list).toContain("/models/anatomy.glb");
    expect(list).toContain("/draco/draco_wasm_wrapper.js");
    expect(list).toContain("/draco/draco_decoder.wasm");
  });

  it("includes the muscle explorer and every exercise page", () => {
    expect(list).toContain("/muscles");
    expect(list).toContain("/exercises");
    for (const id of Object.keys(EXERCISES)) {
      expect(list).toContain(`/exercises/${id}`);
    }
  });

  it("includes both photos of every exercise that has them", () => {
    for (const id of EXERCISE_MEDIA_IDS) {
      expect(list).toContain(`/exercise-media/${id}/0.jpg`);
      expect(list).toContain(`/exercise-media/${id}/1.jpg`);
    }
  });

  it("has no duplicates and only same-origin absolute paths", () => {
    expect(new Set(list).size).toBe(list.length);
    for (const url of list) expect(url.startsWith("/")).toBe(true);
  });

  it("every static file in the list exists under public/", () => {
    const files = list.filter((u) => /\.[a-z0-9]+$/.test(u));
    expect(files.length).toBeGreaterThan(0);
    for (const url of files) {
      expect(existsSync(join(process.cwd(), "public", url)), url).toBe(true);
    }
  });
});
