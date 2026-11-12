import { describe, expect, it } from "vitest";
import type { BodyweightLog } from "@/types";
import { cutTargetBand, formatSigned, paceStatus, weighInGroups } from "./bodyMath";

describe("formatSigned", () => {
  it("signs non-zero values and leaves zero bare", () => {
    expect(formatSigned(0.4)).toBe("+0.4");
    expect(formatSigned(-6.52)).toBe("−6.5");
    expect(formatSigned(-0.01)).toBe("0.0");
    expect(formatSigned(0)).toBe("0.0");
  });
});

const DAY = 86_400_000;
const T0 = new Date(2026, 9, 1, 8).getTime();

function entries(weights: number[]) {
  return weights.map((weight, i) => ({ date: new Date(T0 + i * DAY), weight }));
}

/** 15 daily weigh-ins losing `pctPerWeek` percent of 200 lbs a week. */
function losing(pctPerWeek: number) {
  const perDay = (200 * pctPerWeek) / 100 / 7;
  return entries(Array.from({ length: 15 }, (_, i) => 200 - i * perDay));
}

function log(
  id: string,
  date: Date,
  weight: number,
  timeOfDay: BodyweightLog["timeOfDay"] = "morning"
): BodyweightLog {
  return { id, clientId: id, date, weight, timeOfDay, synced: false };
}

describe("cutTargetBand", () => {
  it("is 0.5 to 1.0 percent of the average, as negative lbs per week", () => {
    const band = cutTargetBand(200);
    expect(band.low).toBeCloseTo(-2, 5);
    expect(band.high).toBeCloseTo(-1, 5);
    expect(band.low).toBeLessThan(band.high);
  });
});

describe("paceStatus", () => {
  it("is null with too few weigh-ins", () => {
    expect(paceStatus(entries([200, 199.9, 199.8]))).toBeNull();
  });

  it("calls 0.5-1.0 percent a week on pace", () => {
    expect(paceStatus(losing(0.7))).toBe("on pace");
  });

  it("calls a stall, a gain or a 0.25-0.5 percent loss slow", () => {
    expect(paceStatus(entries(Array(15).fill(200)))).toBe("slow");
    expect(paceStatus(entries(Array.from({ length: 15 }, (_, i) => 200 + i * 0.3)))).toBe("gaining");
    expect(paceStatus(losing(0.35))).toBe("slow");
  });

  it("calls a loss above 1.0 percent fast, in the yellow and the red zone", () => {
    expect(paceStatus(losing(1.2))).toBe("fast");
    expect(paceStatus(losing(2))).toBe("fast");
  });
});

describe("weighInGroups", () => {
  const rows = [
    log("a", new Date(2026, 9, 30, 8), 200),
    log("b", new Date(2026, 10, 1, 8), 199.4),
    log("c", new Date(2026, 10, 2, 19), 199.6, "evening"),
  ];

  it("groups newest first by month with the difference from the previous entry", () => {
    const groups = weighInGroups(rows);
    expect(groups.map((g) => g.label)).toEqual(["November 2026", "October 2026"]);
    expect(groups[0].rows.map((r) => r.id)).toEqual(["c", "b"]);
    expect(groups[0].rows[0].diff).toBeCloseTo(0.2, 5);
    expect(groups[0].rows[1].diff).toBeCloseTo(-0.6, 5);
    // The very first entry has nothing to compare with.
    expect(groups[1].rows[0].diff).toBeNull();
  });

  it("names the time of day and leaves 'other' blank", () => {
    const groups = weighInGroups([...rows, log("d", new Date(2026, 10, 3), 199, "other")]);
    const byId = Object.fromEntries(groups.flatMap((g) => g.rows).map((r) => [r.id, r.timeLabel]));
    expect(byId).toMatchObject({ b: "Morning", c: "Evening", d: "" });
  });

  it("limits to the newest entries and sorts unordered input", () => {
    const groups = weighInGroups([rows[2], rows[0], rows[1]], 2);
    expect(groups.flatMap((g) => g.rows).map((r) => r.id)).toEqual(["c", "b"]);
    // The difference still looks past the cut.
    expect(groups[0].rows[1].diff).toBeCloseTo(-0.6, 5);
  });

  it("accepts dates that arrive as ISO strings", () => {
    const iso = { ...log("z", new Date(), 190), date: new Date(2026, 10, 5).toISOString() };
    expect(weighInGroups([iso as unknown as BodyweightLog])[0].rows[0].id).toBe("z");
  });
});
