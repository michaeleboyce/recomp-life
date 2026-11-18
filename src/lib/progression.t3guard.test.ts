// T2 of docs/plans/2026-11-18-t3-jump-threshold-design.md: everything that decides,
// replays, projects or states a T3 increase uses `t3IncreaseThreshold`. This test reads
// the sources and fails when a second copy of the rule appears: a flat rep count compared
// with a T3's reps, or the bounds used outside the function and the text that states them.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path),
  text: readFileSync(path, "utf8"),
}));

/** Files that may name the bounds: the function itself, and text that states the range. */
const MAY_NAME_BOUNDS = new Set([
  "lib/progression.ts",
  "lib/evidence/rules/progression.ts",
  "lib/glossary.ts",
  "components/ExercisePage/ExerciseStrength.tsx",
]);

describe("one T3 threshold", () => {
  it("the old flat constant is gone", () => {
    const users = files.filter((f) => f.text.includes("T3_LAST_SET_INCREASE_REPS")).map((f) => f.path);
    expect(users).toEqual([]);
  });

  it("the bounds are named only by the function and the text that states the range", () => {
    const users = files
      .filter((f) => /T3_INCREASE_REPS_(MIN|MAX)/.test(f.text) && !MAY_NAME_BOUNDS.has(f.path))
      .map((f) => f.path);
    expect(users).toEqual([]);
  });

  it("no code compares a rep count with a flat 25", () => {
    const flat = /(reps|Reps)\s*>=?\s*25\b|25\s*<=?\s*\w*(reps|Reps)/;
    const users = files.filter((f) => flat.test(f.text)).map((f) => f.path);
    expect(users).toEqual([]);
  });

  it("the threshold is worked out only in progression.ts", () => {
    const users = files
      .filter((f) => f.path !== "lib/progression.ts" && /function t3IncreaseThreshold\b/.test(f.text))
      .map((f) => f.path);
    expect(users).toEqual([]);
  });
});
