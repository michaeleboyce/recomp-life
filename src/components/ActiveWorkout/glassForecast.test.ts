import { describe, expect, it } from "vitest";
import type { ScoredForecast } from "@/lib/forecast";
import type { Forecast, ForecastStatus, SetLog, WorkoutSession } from "@/types";
import {
  forecastNote,
  forecastResultRows,
  forecastWindow,
  insideCount,
  lastSetVerdict,
  liftForecasts,
} from "./glassForecast";

const PMF = [0, 0, 0.02, 0.12, 0.3, 0.31, 0.18, 0.05, 0.02];

function row(kind: Forecast["kind"], overrides: Partial<Forecast> = {}): Forecast {
  return {
    id: `${kind}-${overrides.exerciseId ?? "deadlift"}`,
    clientId: kind,
    slot: kind,
    kind,
    workoutId: "w1",
    exerciseId: "deadlift",
    tier: "T1",
    madeAt: new Date("2026-11-15T09:00:00Z"),
    dueAt: new Date("2026-11-15T10:00:00Z"),
    event: { type: "amrapReps", weight: 215 },
    prediction: { point: 5, low: 4, high: 6, pmf: PMF, unit: "reps" },
    basis: "persistence",
    inputs: { sampleSize: 6, readinessShift: 0.01, cuttingShift: -0.02 },
    modelVersion: "1",
    synced: false,
    ...overrides,
  } as Forecast;
}

const newBestRow = (overrides: Partial<Forecast> = {}) =>
  row("newBest", {
    event: { type: "e1rmAbove", weight: 215, level: 247 },
    prediction: { point: 0.58, probability: 0.58, unit: "chance" },
    inputs: { repsNeeded: 5, effortCredit: 0 },
    ...overrides,
  });

const scored = (forecast: Forecast, status: ForecastStatus = { state: "open" }): ScoredForecast => ({
  forecast,
  status,
});

describe("liftForecasts", () => {
  it("finds the stored rows for the lift at the weight on the bar", () => {
    const rows = [scored(row("amrapReps")), scored(newBestRow())];
    const found = liftForecasts(rows, { exerciseId: "deadlift", tier: "T1", weight: 215 })!;
    expect(found.reps.kind).toBe("amrapReps");
    expect(found.newBest?.kind).toBe("newBest");
  });

  it("is null when nothing was stored, for another lift, or for another weight", () => {
    expect(liftForecasts(undefined, { exerciseId: "deadlift", tier: "T1", weight: 215 })).toBeNull();
    expect(liftForecasts([], { exerciseId: "deadlift", tier: "T1", weight: 215 })).toBeNull();
    const rows = [scored(row("amrapReps"))];
    expect(liftForecasts(rows, { exerciseId: "squat", tier: "T1", weight: 215 })).toBeNull();
    expect(liftForecasts(rows, { exerciseId: "deadlift", tier: "T1", weight: 225 })).toBeNull();
  });
});

describe("forecastWindow", () => {
  it("starts one below the expected range, six columns", () => {
    expect(forecastWindow(PMF, 4)).toEqual({ firstReps: 3, lastReps: 8 });
  });
  it("never runs past the last bucket", () => {
    expect(forecastWindow(PMF, 8)).toEqual({ firstReps: 3, lastReps: 8 });
    expect(forecastWindow([0.5, 0.5], 0)).toEqual({ firstReps: 0, lastReps: 1 });
  });
});

describe("forecastNote", () => {
  it("states the chance of a new best, what the picked count would do and what it rests on", () => {
    const note = forecastNote(
      { reps: row("amrapReps"), newBest: newBestRow() },
      { weight: 215, reps: 6, rpe: null }
    );
    expect(note.lead).toBe("5 or more is a new best");
    expect(note.chance).toBe(" (58% chance).");
    expect(note.selected).toBe("6 would put your estimated max at 258, up from 247.");
    expect(note.basis).toBe("Built from your last 6 final sets, today's readiness and the cut.");
  });

  it("says nothing about the picked count when it would not beat the best", () => {
    const note = forecastNote(
      { reps: row("amrapReps"), newBest: newBestRow() },
      { weight: 215, reps: 4, rpe: null }
    );
    expect(note.selected).toBeNull();
  });

  it("without a best to beat, gives the most likely count; with no history says it is a starting guess", () => {
    const note = forecastNote(
      { reps: row("amrapReps", { inputs: { sampleSize: 0, readinessShift: null, cuttingShift: 0 } }) },
      { weight: 215, reps: 6, rpe: null }
    );
    expect(note.lead).toBe("5 reps is most likely");
    expect(note.chance).toBe(" (4 to 6 expected).");
    expect(note.selected).toBeNull();
    expect(note.basis).toBe("Built from a starting guess (no final sets of this lift yet).");
  });
});

function set(reps: number): SetLog {
  return {
    id: "s5",
    clientId: "s5",
    exerciseId: "deadlift",
    tier: "T1",
    setNumber: 5,
    targetReps: 3,
    actualReps: reps,
    weight: 215,
    isAMRAP: true,
    completedAt: new Date("2026-11-15T09:30:00Z"),
    restAfterSeconds: 0,
    status: "completed",
    isSubstituted: false,
    location: "gym",
    synced: false,
  };
}
const workoutWith = (s: SetLog) => ({ id: "w1", sets: [s] }) as unknown as WorkoutSession;

describe("lastSetVerdict", () => {
  it("compares with the forecast and names a new best the app records", () => {
    const s = set(6);
    const verdict = lastSetVerdict({ reps: row("amrapReps"), newBest: newBestRow() }, s, workoutWith(s));
    expect(verdict.title).toBe("New best · Deadlift 215 × 6");
    expect(verdict.body).toBe("Forecast was 5 (4 to 6). You got 6. Inside the expected range.");
    expect(verdict.newBest).toBe(258);
  });

  it("names no best when the estimate does not beat it, or when there was no best to beat", () => {
    const s = set(3);
    const verdict = lastSetVerdict({ reps: row("amrapReps"), newBest: newBestRow() }, s, workoutWith(s));
    expect(verdict.title).toBe("Deadlift 215 × 3");
    expect(verdict.body).toMatch(/You got 3. Below the expected range.$/);
    expect(verdict.newBest).toBeNull();
    const high = set(9);
    expect(lastSetVerdict({ reps: row("amrapReps") }, high, workoutWith(high)).newBest).toBeNull();
  });
});

describe("forecastResultRows", () => {
  it("one row per forecast: stated, result, and how it landed; void rows say why", () => {
    const rows = forecastResultRows([
      scored(row("sessionLength", { exerciseId: undefined, tier: undefined, prediction: { point: 2760, low: 2460, high: 3120, unit: "s" } }), {
        state: "void",
        reason: "ended-early",
      }),
      scored(row("amrapReps"), { state: "resolved", value: 6, inside: true }),
      scored(row("liftPass", { prediction: { point: 0.44, probability: 0.44, unit: "chance" } }), {
        state: "resolved",
        value: 6,
        hit: true,
      }),
      scored(newBestRow(), { state: "resolved", value: 258, hit: true }),
      scored(row("amrapReps", { id: "sq", exerciseId: "squat" }), { state: "resolved", value: 9, inside: false }),
    ]);
    expect(rows.map((r) => [r.label, r.stated, r.result, r.mark, r.why])).toEqual([
      ["Deadlift, last set", "5 (4–6)", "6 reps", "beat", undefined],
      ["Deadlift passes", "44%", "passed", "hit", undefined],
      ["Deadlift, new best", "58%", "est. 258", "hit", undefined],
      ["Squat, last set", "5 (4–6)", "9 reps", "outside", undefined],
      ["Session length", "46 (41–52)", "", "void", "ended early"],
    ]);
    expect(insideCount(rows)).toEqual({ inside: 1, ranged: 2 });
  });
});
