import { describe, expect, it } from "vitest";
import { buildFitbodFile, buildGravlFile, fRow, gRow } from "./parse/fixtures";
import { parseExport } from "./parse";
import { buildImportPreview, describeLoad, formatLb } from "./preview";

// Every file here is made up.

const TWO = { weight: "per_implement" as const, implements: 2 as const, perHand: true };
const ONE = { weight: "per_implement" as const, implements: 1 as const, perHand: false };
const TOTAL = { weight: "total" as const, implements: 1 as const, perHand: false };

describe("describeLoad", () => {
  it("reads a weight the way the app will store it", () => {
    expect(describeLoad({ weightPerImplementLb: 50.00003, weightCountsAsLoad: true }, TWO)).toEqual({ load: "50 lb × 2 hands", totalLb: 100.00006 });
    expect(describeLoad({ weightPerImplementLb: 45, weightCountsAsLoad: true }, ONE).load).toBe("45 lb, one dumbbell");
    expect(describeLoad({ weightPerImplementLb: 135, weightCountsAsLoad: true }, TOTAL).load).toBe("135 lb");
    expect(describeLoad({ weightPerImplementLb: 0, weightCountsAsLoad: true }, TOTAL).load).toBe("bodyweight");
    expect(describeLoad({ weightPerImplementLb: 40, weightCountsAsLoad: false }, TOTAL).load).toBe("40 lb assistance");
  });

  it("formats pounds with at most one decimal", () => {
    expect(formatLb(44.0925)).toBe("44.1");
    expect(formatLb(30.00003)).toBe("30");
  });
});

describe("buildImportPreview", () => {
  const file = () =>
    buildFitbodFile([
      fRow({ Date: "2021-03-06 10:00:00 +0000", Exercise: "Dumbbell Bench Press", "Weight(kg)": 22.6796185, multiplier: " 2.0" }),
      fRow({ Date: "2021-03-06 10:00:00 +0000", Exercise: "Dumbbell Bench Press", "Weight(kg)": 22.6796185, multiplier: " 2.0", isWarmup: "true" }),
      fRow({ Date: "2021-03-06 10:00:00 +0000", Exercise: "Barbell Squat", "Weight(kg)": 61.2349, multiplier: " 1.0" }),
      fRow({ Date: "2021-03-04 10:00:00 +0000", Exercise: "Wobbly Hammer Curl", "Weight(kg)": 10 }),
      fRow({ Date: "2021-03-04 10:00:00 +0000", Exercise: "Zorblax", "Weight(kg)": 10 }),
      fRow({ Date: "2021-03-04 10:00:00 +0000", Exercise: "Zorblax", "Weight(kg)": 10 }),
      fRow({ Date: "2021-03-05 07:00:00 +0000", Exercise: "Walking", Reps: 0, "Weight(kg)": 0, "Duration(s)": 1800, "Distance(m)": 3000 }),
      fRow({ Date: "not a date" }),
      fRow({ Date: "also bad" }),
    ]);

  it("counts sessions, sets, warm-ups and cardio, with the date range", () => {
    const preview = buildImportPreview(parseExport(file()));
    expect(preview.app).toBe("fitbod");
    expect(preview.sessions).toBe(2);
    expect(preview.sets).toBe(6);
    expect(preview.warmups).toBe(1);
    expect(preview.cardio).toBe(1);
    expect(preview.cardioByKind).toEqual({ walk: 1 });
    expect(preview.firstDate?.toISOString()).toBe("2021-03-04T10:00:00.000Z");
    expect(preview.lastDate?.toISOString()).toBe("2021-03-06T10:00:00.000Z");
  });

  it("lists rejected rows by reason with their row numbers", () => {
    const preview = buildImportPreview(parseExport(file()));
    expect(preview.rejected.total).toBe(2);
    expect(preview.rejected.reasons).toEqual([{ reason: "unreadable date", count: 2, rows: [9, 10] }]);
  });

  it("groups names as mapped, muscle-guessed and unknown, most sets first", () => {
    const { names } = buildImportPreview(parseExport(file()));
    expect(names.mapped.map((n) => [n.name, n.sets, n.label])).toEqual([
      ["Dumbbell Bench Press", 2, "DB Bench Press"],
      ["Barbell Squat", 1, "Barbell Squat"],
    ]);
    expect(names.guessed.map((n) => n.name)).toEqual(["Wobbly Hammer Curl"]);
    expect(names.guessed[0].label).toMatch(/Biceps/);
    expect(names.unknown.map((n) => [n.name, n.sets])).toEqual([["Zorblax", 2]]);
  });

  it("moves a name the user mapped or confirmed into the mapped group", () => {
    const preview = buildImportPreview(parseExport(file()), {
      zorblax: { kind: "exercise", exerciseId: "bicep_curls" },
      "wobbly hammer curl": { kind: "custom", primary: ["biceps"] },
    });
    expect(preview.names.unknown).toEqual([]);
    expect(preview.names.guessed).toEqual([]);
    expect(preview.names.mapped.map((n) => n.name).sort()).toEqual(
      ["Barbell Squat", "Dumbbell Bench Press", "Wobbly Hammer Curl", "Zorblax"]
    );
  });

  it("shows sample sets so a per-hand weight reads as per hand", () => {
    const { samples } = buildImportPreview(parseExport(file()));
    const db = samples.find((s) => s.exerciseName === "Dumbbell Bench Press")!;
    expect(db.load).toBe("50 lb × 2 hands");
    expect(db.totalLb).toBeCloseTo(100, 3);
    expect(db.fileImplements).toBeNull();
    const squat = samples.find((s) => s.exerciseName === "Barbell Squat")!;
    expect(squat.load).toBe("135 lb");
    expect(samples.length).toBeLessThanOrEqual(4);
  });

  it("flags a sample whose file count disagrees with the reading", () => {
    const parsed = parseExport(buildFitbodFile([fRow({ Exercise: "Dumbbell Bench Press", multiplier: " 1.0" })]));
    expect(buildImportPreview(parsed).samples[0].fileImplements).toBe(1);
  });

  it("reads a Gravl export, whose weights are per dumbbell with no count, by the mapping", () => {
    const parsed = parseExport(
      buildGravlFile([gRow({ Exercise: "Dumbbell Bench Press", "Weight (lb)": 45 }), gRow({ Exercise: "Dumbbell Bench Press", Set: 2, "Set Type": "Dropset" })])
    );
    const preview = buildImportPreview(parsed);
    expect(preview.app).toBe("gravl");
    expect(preview.drops).toBe(1);
    expect(preview.samples[0].load).toBe("45 lb × 2 hands");
  });
});
