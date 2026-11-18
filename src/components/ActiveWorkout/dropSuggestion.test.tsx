import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import type { RepsInReserve, SetLog, TrainingPhase } from "@/types";
import { AutoRegCallout } from "./AutoRegCallout";
import { dropSuggestionFor } from "./activeWorkoutLogic";

const BENCH: WorkoutExerciseState = {
  exerciseId: "bench",
  tier: "T2",
  targetSets: 3,
  targetReps: 10,
  weight: 100,
  isAMRAP: false,
  isWarmUp: false,
  completedSets: 1,
};

function firstSet(repsInReserve?: RepsInReserve): SetLog {
  return {
    id: "s1",
    clientId: "c1",
    exerciseId: "bench",
    tier: "T2",
    setNumber: 1,
    targetReps: 10,
    actualReps: 10,
    weight: 100,
    isAMRAP: false,
    completedAt: new Date(2026, 10, 18, 10),
    restAfterSeconds: 90,
    status: "completed",
    isSubstituted: false,
    location: "gym",
    synced: false,
    ...(repsInReserve ? { repsInReserve } : {}),
  } as SetLog;
}

const phase = (mode: TrainingPhase["mode"]): TrainingPhase => ({ mode });

describe("dropSuggestionFor", () => {
  it.each(["cutting", "maintaining", "bulking"] as const)(
    "suggests a drop from an answer of 0 in %s",
    (mode) => {
      const result = dropSuggestionFor(BENCH, [firstSet("0")], phase(mode));
      expect(result).toEqual({ reducedWeight: 95, repsInReserve: "0" });
    }
  );

  it("suggests a one-step drop from 1-2 while cutting only", () => {
    expect(dropSuggestionFor(BENCH, [firstSet("1-2")], phase("cutting"))).toEqual({
      reducedWeight: 95,
      repsInReserve: "1-2",
    });
    expect(dropSuggestionFor(BENCH, [firstSet("1-2")], phase("maintaining"))).toBeNull();
    expect(dropSuggestionFor(BENCH, [firstSet("1-2")], phase("bulking"))).toBeNull();
  });

  it("never suggests from 3+ or from no answer", () => {
    expect(dropSuggestionFor(BENCH, [firstSet("3+")], phase("cutting"))).toBeNull();
    expect(dropSuggestionFor(BENCH, [firstSet()], phase("cutting"))).toBeNull();
  });
});

describe("AutoRegCallout", () => {
  it("says what the lifter answered and asks, never mentioning RPE", () => {
    const onAccept = vi.fn();
    render(<AutoRegCallout repsInReserve="1-2" reducedWeight={180} onAccept={onAccept} onKeep={vi.fn()} />);
    expect(screen.getByText(/Your first set left you/)).toHaveTextContent(
      "Your first set left you 1-2 reps. Drop to 180 lb for the remaining sets?"
    );
    expect(document.body.textContent).not.toMatch(/rpe/i);
    fireEvent.click(screen.getByRole("button", { name: "Accept Drop" }));
    expect(onAccept).toHaveBeenCalled();
  });

  it("reads naturally for an answer of 0", () => {
    render(<AutoRegCallout repsInReserve="0" reducedWeight={90} onAccept={vi.fn()} onKeep={vi.fn()} />);
    expect(screen.getByText(/nothing left/)).toHaveTextContent("Drop to 90 lb");
  });
});
