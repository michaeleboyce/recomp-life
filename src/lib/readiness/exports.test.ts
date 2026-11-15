// @vitest-environment node
/**
 * Readiness shifts forecasts and nothing else. These tests read the folder's
 * source and fail if anything in it could hand back or change what is lifted.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as readiness from "./index";
import { NOW, daysBefore, makeLog, makeWorkout, templateExerciseIds } from "./testUtils";

const files = fs
  .readdirSync(__dirname)
  .filter((name) => /\.ts$/.test(name) && !/\.test\.ts$/.test(name) && name !== "testUtils.ts");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const code = new Map(
  files.map((name) => [name, stripComments(fs.readFileSync(path.join(__dirname, name), "utf8"))])
);

/** Names a file exports, from declarations and from `export { a, b }` lists. */
function exportedNames(source: string): string[] {
  const declared = [
    ...source.matchAll(
      /export\s+(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+(\w+)/g
    ),
  ].map((m) => m[1]);
  const listed = [...source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)].flatMap((m) =>
    m[1]
      .split(",")
      .map((part) => part.trim().split(/\s+as\s+/).pop() ?? "")
      .filter(Boolean)
  );
  return [...declared, ...listed];
}

describe("src/lib/readiness never touches a weight", () => {
  it("scans the folder (guards against a broken scan)", () => {
    expect(files).toEqual(
      expect.arrayContaining(["index.ts", "median.ts", "score.ts", "usual.ts", "weights.ts"])
    );
    expect(exportedNames(code.get("score.ts") ?? "")).toContain("readinessScore");
    expect(exportedNames(code.get("index.ts") ?? "")).toContain("readinessFromRecords");
  });

  it("no export is named for a weight, a load or a prescription", () => {
    // READINESS_WEIGHTS holds the points of the score, not anything on the bar.
    const allowed = new Set(["READINESS_WEIGHTS"]);
    for (const [name, source] of code) {
      for (const exported of exportedNames(source)) {
        if (allowed.has(exported)) continue;
        expect(exported, `${name} exports ${exported}`).not.toMatch(
          /weight|load|lbs|plate|prescri|increment|decay/i
        );
      }
    }
  });

  it("no code reads or writes a weight field", () => {
    for (const [name, source] of code) {
      expect(/\bweight\b|[a-z]Weight\b|\blbs?\b/.test(source), `${name} mentions a weight`).toBe(
        false
      );
    }
  });

  it("imports nothing that sets, changes or stores weights", () => {
    const banned =
      /from\s+["'](?:@\/lib\/(?:progression|workout\/|weightDecay|painModifications|deload|autoAdapt|dbConversion|plates|warmups|rebuild|data)|@\/db\/|@\/hooks)/;
    for (const [name, source] of code) {
      expect(banned.test(source), `${name} imports a module that deals in weights`).toBe(false);
    }
  });

  it("the functions it exports are the known ones, and none returns a weight", () => {
    const functions = Object.entries(readiness)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name)
      .sort();
    // Adding a function here means checking what it returns, below.
    expect(functions).toEqual([
      "formatPoints",
      "mainLiftIsLowerBody",
      "readinessFromRecords",
      "readinessLevelShift",
      "readinessScore",
      "readinessUsual",
      "shouldSuggestSkippingAccessories",
    ]);

    const workouts = Array.from({ length: 8 }, (_, i) => makeWorkout(`w${i}`, daysBefore(2 * (8 - i))));
    const records = {
      readinessLogs: workouts.map((w) => makeLog(w.id, new Date(w.startedAt), { sleepHours: "5-7" })),
      workouts,
      runs: [],
      activities: [],
      painEntries: [],
      phase: { mode: "cutting" as const },
    };
    const exerciseIds = templateExerciseIds("A1");
    const log = { sleepHours: "<5" as const, stressLevel: "low" as const };

    const score = readiness.readinessFromRecords(records, { exerciseIds, log }, NOW);
    const usual = readiness.readinessUsual(records, NOW);
    const returned: unknown[] = [
      score,
      readiness.readinessScore({ exerciseIds, log, workouts }, NOW),
      usual,
    ];
    const keys = (value: unknown): string[] =>
      value && typeof value === "object"
        ? Object.entries(value).flatMap(([key, inner]) => [key, ...keys(inner)])
        : [];
    for (const value of returned) {
      for (const key of keys(value)) expect(key).not.toMatch(/weight|load|lbs/i);
    }
    expect(Object.keys(score).sort()).toEqual(
      ["contributions", "score", "suggestSkippingAccessories", "usual"].sort()
    );
    expect(Object.keys(usual).sort()).toEqual(["pastScores", "usualPoints"]);

    // The rest return a fraction, a flag or a label.
    const shift = readiness.readinessLevelShift(score);
    expect(typeof shift).toBe("number");
    expect(Math.abs(shift)).toBeLessThan(0.1);
    expect(readiness.shouldSuggestSkippingAccessories(log)).toBe(true);
    expect(readiness.mainLiftIsLowerBody(exerciseIds)).toBe(true);
    expect(readiness.formatPoints(-3)).toBe("−3");
  });
});
