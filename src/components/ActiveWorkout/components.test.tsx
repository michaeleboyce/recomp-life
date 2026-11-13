import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { useWorkoutStore } from "@/stores/workoutStore";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import { AMRAPIndicator } from "./AMRAPIndicator";
import { ExerciseBlock } from "./ExerciseBlock";
import { LogDock } from "./LogDock";
import { PrOpportunityLine } from "./PrOpportunityLine";
import { RepPicker } from "./RepPicker";
import { RPESelector } from "./RPESelector";
import { WeightDisplay } from "./WeightDisplay";
import { WorkoutOverviewSheet } from "./WorkoutOverviewSheet";
import { repChips, restNextLabel } from "./activeWorkoutLogic";
import { describeChance } from "./prOpportunity";

const audio = vi.hoisted(() => ({
  playTimerChime: vi.fn(),
  vibrateTimer: vi.fn(),
  sendTimerNotification: vi.fn(),
}));
vi.mock("@/lib/audio", () => audio);

const EQUIPMENT = DEFAULT_USER_PROFILE.settings.equipment;

function entry(overrides: Partial<WorkoutExerciseState> = {}): WorkoutExerciseState {
  return {
    exerciseId: "deadlift",
    tier: "T1",
    targetSets: 5,
    targetReps: 3,
    weight: 245,
    isAMRAP: true,
    isWarmUp: false,
    completedSets: 0,
    ...overrides,
  };
}

beforeEach(() => useWorkoutStore.getState().reset());

describe("WeightDisplay", () => {
  it("shows the plates per side for a barbell lift at the gym", () => {
    render(<WeightDisplay exercise={entry()} location="gym" equipment={EQUIPMENT} />);
    expect(screen.getByTestId("weight")).toHaveTextContent("245");
    expect(screen.getByTestId("loading-line")).toHaveTextContent("per side: 45 · 45 · 10");
  });

  it("uses the bar weight and plates from settings", () => {
    render(
      <WeightDisplay
        exercise={entry({ weight: 135 })}
        location="gym"
        equipment={{ ...EQUIPMENT, barWeight: 35, availablePlates: [25, 10, 5] }}
      />
    );
    expect(screen.getByTestId("loading-line")).toHaveTextContent("per side: 25 · 25");
  });

  it("says so when the weight cannot be loaded exactly", () => {
    render(
      <WeightDisplay
        exercise={entry({ weight: 190 })}
        location="gym"
        equipment={{ ...EQUIPMENT, availablePlates: [45, 25, 10, 5] }}
      />
    );
    expect(screen.getByTestId("loading-line")).toHaveTextContent(
      "per side: 45 · 25 (loads 185 lbs)"
    );
  });

  it("reads 'bar only' for the empty bar", () => {
    render(
      <WeightDisplay
        exercise={entry({ weight: 45, tier: "warmup", isWarmUp: true })}
        location="gym"
        equipment={EQUIPMENT}
      />
    );
    expect(screen.getByTestId("loading-line")).toHaveTextContent("bar only");
  });

  it("says 'per hand' with the barbell equivalent for a home dumbbell substitute", () => {
    render(
      <WeightDisplay
        exercise={entry({
          exerciseId: "bench",
          substituteExerciseId: "db_bench",
          tier: "T2",
          weight: 40,
          originalWeight: 100,
        })}
        location="home"
        equipment={EQUIPMENT}
      />
    );
    expect(screen.getByTestId("loading-line")).toHaveTextContent(
      /^per hand · = \d+ lbs barbell equiv\.$/
    );
  });

  it("adds nothing for a cable exercise", () => {
    render(
      <WeightDisplay
        exercise={entry({ exerciseId: "lat_pulldown", tier: "T3", weight: 90 })}
        location="gym"
        equipment={EQUIPMENT}
      />
    );
    expect(screen.queryByTestId("loading-line")).toBeNull();
  });
});

describe("RepPicker", () => {
  it("offers chips from one below the target to four above", () => {
    expect(repChips(3)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(repChips(1)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(repChips(15)).toEqual([14, 15, 16, 17, 18, 19]);
  });

  it("shows the selected count and steps it up and down", () => {
    const onChange = vi.fn();
    render(<RepPicker targetReps={3} isAMRAP={false} value={3} onChange={onChange} />);
    expect(screen.getByTestId("rep-count")).toHaveTextContent("3");
    expect(screen.getByText("target 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3 reps" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "One more rep" }));
    expect(onChange).toHaveBeenLastCalledWith(4);
    fireEvent.click(screen.getByRole("button", { name: "One fewer rep" }));
    expect(onChange).toHaveBeenLastCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: "6 reps" }));
    expect(onChange).toHaveBeenLastCalledWith(6);
  });

  it("can step far past the chips and never below one", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <RepPicker targetReps={15} isAMRAP value={29} onChange={onChange} />
    );
    expect(screen.getByRole("button", { name: "One more rep" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "One more rep" }));
    expect(onChange).toHaveBeenLastCalledWith(30);
    expect(screen.getByText("target 15+")).toBeInTheDocument();

    rerender(<RepPicker targetReps={1} isAMRAP={false} value={1} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "One fewer rep" })).toBeDisabled();
  });

  it("highlights the chips that would be a new best on an AMRAP set only", () => {
    const { rerender } = render(
      <RepPicker targetReps={3} isAMRAP value={3} onChange={vi.fn()} highlightFrom={5} />
    );
    expect(screen.getByRole("button", { name: "4 reps" })).not.toHaveAttribute("data-best");
    for (const reps of [5, 6, 7]) {
      expect(screen.getByRole("button", { name: `${reps} reps, new best` })).toHaveAttribute(
        "data-best",
        "true"
      );
    }

    rerender(
      <RepPicker targetReps={3} isAMRAP={false} value={3} onChange={vi.fn()} highlightFrom={5} />
    );
    expect(screen.queryByRole("button", { name: /new best/ })).toBeNull();
  });
});

describe("PrOpportunityLine", () => {
  const opportunity = {
    repsNeeded: 5,
    e1rmAtRepsNeeded: 286,
    bestE1RM: 266,
    chance: "likely" as const,
  };

  it("reads as one sentence with the chance and the recent sets", () => {
    render(<PrOpportunityLine opportunity={opportunity} recentAMRAPReps={[7, 5, 4, 6]} />);
    expect(screen.getByTestId("pr-opportunity")).toHaveTextContent(
      "5 reps = new best, est. 286 (now 266). Likely: your last three were 5, 4, 6."
    );
  });

  it("drops the chance when it is unknown and shortens it without history", () => {
    expect(describeChance({ ...opportunity, chance: "unknown" }, [5])).toBeNull();
    expect(describeChance({ ...opportunity, chance: "stretch" }, [])).toBe("A stretch.");
    expect(describeChance({ ...opportunity, chance: "unlikely" }, [4])).toBe(
      "Unlikely: your last set was 4."
    );
  });
});

describe("RPESelector", () => {
  it("selects a value, and clears it when tapped again", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<RPESelector selectedRPE={null} onSelectRPE={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "RPE 8.5" }));
    expect(onSelect).toHaveBeenLastCalledWith(8.5);

    rerender(<RPESelector selectedRPE={8.5} onSelectRPE={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "RPE 8.5" }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("keeps its evidence line", () => {
    const { container } = render(<RPESelector selectedRPE={null} onSelectRPE={vi.fn()} />);
    expect(container.querySelector('[data-evidence="rpe-logging"]')).not.toBeNull();
  });
});

describe("ExerciseBlock", () => {
  it("names the set, the exercise and keeps the anatomy slots", () => {
    render(<ExerciseBlock exercise={entry({ completedSets: 2 })} location="gym" />);
    expect(screen.getByRole("heading", { name: "Barbell Deadlift" })).toBeInTheDocument();
    expect(screen.getByText("Set 3 of 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Form" })).toBeInTheDocument();
    expect(screen.getByLabelText("Muscles worked by Barbell Deadlift")).toBeInTheDocument();
    expect(screen.queryByText(/AMRAP/)).toBeNull();
  });

  it("shows the substitute's name and the AMRAP guidance with its evidence line", () => {
    const { container } = render(
      <ExerciseBlock
        exercise={entry({ substituteExerciseId: "db_rdl", completedSets: 4 })}
        location="home"
        isAMRAPSet
      />
    );
    expect(screen.getByRole("heading", { name: "DB Romanian Deadlift" })).toBeInTheDocument();
    expect(screen.getByText("Set 5 of 5")).toBeInTheDocument();
    expect(screen.getByText(/stop with about 1 rep left/i)).toBeInTheDocument();
    expect(container.querySelector('[data-evidence="amrap-effort"]')).not.toBeNull();
  });

  it("has no evidence line where there is no guidance", () => {
    const { container } = render(<AMRAPIndicator tier="accessory" />);
    expect(screen.getByText(/as many reps as you can/)).toBeInTheDocument();
    expect(container.querySelector("[data-evidence]")).toBeNull();
  });
});

describe("glossary terms mid-workout", () => {
  it("AMRAP opens its entry, with no links away from the workout", async () => {
    render(<AMRAPIndicator tier="T1" />);
    expect(document.querySelector("abbr")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "What does AMRAP mean?" }));
    const sheet = await screen.findByRole("dialog");
    expect(sheet).toHaveTextContent("AMRAP");
    expect(within(sheet).queryByRole("link")).toBeNull();
  });

  it("the tier badge, RPE heading and 'new best' are explained", () => {
    render(
      <>
        <ExerciseBlock exercise={entry({ tier: "T2" })} location="gym" />
        <RPESelector selectedRPE={null} onSelectRPE={vi.fn()} />
        <PrOpportunityLine
          opportunity={{ repsNeeded: 5, e1rmAtRepsNeeded: 286, bestE1RM: 266, chance: "likely" }}
          recentAMRAPReps={[]}
        />
      </>
    );
    expect(screen.getByRole("button", { name: "What does T2 mean?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Effort \(.*RPE.*, optional\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What does RPE mean?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What does new best mean?" })).toBeInTheDocument();
  });
});

describe("LogDock", () => {
  const props = {
    onLog: vi.fn(),
    audioEnabled: false,
    vibrationEnabled: false,
    trainingPhase: { mode: "cutting" as const },
    nextLabel: "Next: set 2 of 5 · 245 lbs",
  };

  it("is one button naming the selected count", () => {
    const onLog = vi.fn();
    const { rerender } = render(<LogDock {...props} reps={3} onLog={onLog} />);
    fireEvent.click(screen.getByRole("button", { name: "LOG 3 REPS" }));
    expect(onLog).toHaveBeenCalledTimes(1);

    rerender(<LogDock {...props} reps={1} onLog={onLog} />);
    expect(screen.getByRole("button", { name: "LOG 1 REP" })).toBeInTheDocument();
  });

  it("becomes the rest timer while resting, and the log button again when rest is skipped", () => {
    render(<LogDock {...props} reps={3} />);
    act(() => useWorkoutStore.getState().startRestTimer(210, "T1"));

    expect(screen.queryByRole("button", { name: /^LOG/ })).toBeNull();
    const timer = screen.getByRole("timer");
    expect(within(timer).getByTestId("rest-label")).toHaveTextContent("Rest");
    expect(within(timer).getByTestId("rest-remaining")).toHaveTextContent("3:30");
    // The remaining time is the largest text in the dock.
    expect(within(timer).getByTestId("rest-remaining")).toHaveClass("text-4xl");
    expect(timer).toHaveTextContent("of 3:30");
    expect(timer).toHaveTextContent("Next: set 2 of 5 · 245 lbs");
    expect(timer).toHaveTextContent("+30s cut");
    expect(timer.querySelector('[data-evidence="rest-heavy"]')).not.toBeNull();
    expect(timer.querySelector('[data-evidence="rest-cut-bonus"]')).not.toBeNull();

    // +5s and +15s top up the remaining rest; all three controls are 44px tall.
    expect(screen.queryByRole("button", { name: "+30s" })).toBeNull();
    for (const name of ["+5s", "+15s", "Skip rest"]) {
      expect(screen.getByRole("button", { name })).toHaveClass("h-11");
    }
    expect(screen.getByRole("button", { name: "+5s" })).toHaveClass("font-mono");
    fireEvent.click(screen.getByRole("button", { name: "+5s" }));
    expect(useWorkoutStore.getState().restTimeRemaining).toBe(215);
    fireEvent.click(screen.getByRole("button", { name: "+15s" }));
    expect(useWorkoutStore.getState().restTimeRemaining).toBe(230);
    expect(useWorkoutStore.getState().restTimerDuration).toBe(230);

    fireEvent.click(screen.getByRole("button", { name: "Skip rest" }));
    expect(screen.getByRole("button", { name: "LOG 3 REPS" })).toBeInTheDocument();
  });

  it("returns to the log button by itself when the rest runs out", () => {
    render(<LogDock {...props} reps={3} />);
    act(() => useWorkoutStore.getState().startRestTimer(90, "T3"));
    expect(screen.getByRole("timer").querySelector('[data-evidence="rest-light"]')).not.toBeNull();

    act(() => useWorkoutStore.setState({ restTimeRemaining: 0 }));
    expect(screen.getByRole("button", { name: "LOG 3 REPS" })).toBeInTheDocument();
    expect(useWorkoutStore.getState().isRestTimerActive).toBe(false);
  });

  it("chimes and vibrates at the end of rest only when the settings allow", () => {
    audio.playTimerChime.mockClear();
    audio.vibrateTimer.mockClear();
    const { unmount } = render(<LogDock {...props} reps={3} />);
    act(() => useWorkoutStore.getState().startRestTimer(90, "T3"));
    act(() => useWorkoutStore.setState({ restTimeRemaining: 0 }));
    expect(audio.playTimerChime).not.toHaveBeenCalled();
    expect(audio.vibrateTimer).not.toHaveBeenCalled();
    unmount();

    render(<LogDock {...props} reps={3} audioEnabled vibrationEnabled />);
    act(() => useWorkoutStore.getState().startRestTimer(90, "T3"));
    act(() => useWorkoutStore.setState({ restTimeRemaining: 0 }));
    expect(audio.playTimerChime).toHaveBeenCalledTimes(1);
    expect(audio.vibrateTimer).toHaveBeenCalledTimes(1);
  });
});

describe("WorkoutOverviewSheet", () => {
  it("lists working exercises, jumps to one, and holds the end and discard actions", () => {
    const onSelect = vi.fn();
    const onEnd = vi.fn();
    const onDiscard = vi.fn();
    render(
      <WorkoutOverviewSheet
        open
        onOpenChange={vi.fn()}
        exercises={[
          entry({ exerciseId: "squat", tier: "warmup", isWarmUp: true, targetSets: 1 }),
          entry({ exerciseId: "squat", completedSets: 5 }),
          entry({ exerciseId: "bench", tier: "T2", targetSets: 3, isAMRAP: false }),
        ]}
        currentExerciseIndex={2}
        onSelectExercise={onSelect}
        elapsedTime="12:34"
        onEndWorkout={onEnd}
        onDiscard={onDiscard}
      />
    );

    expect(screen.getByLabelText(/Muscles worked so far/)).toBeInTheDocument();
    expect(screen.getByText("Elapsed: 12:34")).toBeInTheDocument();
    const rows = screen.getAllByRole("button", { name: /Barbell/ });
    expect(rows).toHaveLength(2); // the warm-up is not listed
    expect(rows[0]).toBeDisabled(); // finished exercises cannot be reopened
    fireEvent.click(rows[1]);
    expect(onSelect).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByRole("button", { name: "End workout" }));
    expect(onEnd).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalled();
  });
});

describe("restNextLabel", () => {
  it("names the next set and its weight, and the exercise when it changes", () => {
    expect(restNextLabel(entry({ completedSets: 2 }), "Barbell Deadlift")).toBe(
      "Next: set 3 of 5 · 245 lbs"
    );
    expect(
      restNextLabel(
        entry({ exerciseId: "bench", tier: "T2", targetSets: 3, weight: 100 }),
        "Barbell Bench Press"
      )
    ).toBe("Next: Barbell Bench Press, set 1 of 3 · 100 lbs");
    expect(restNextLabel(entry({ weight: 40, completedSets: 1 }), "DB Bench Press", true)).toBe(
      "Next: set 2 of 5 · 40 lbs/hand"
    );
    expect(
      restNextLabel(
        entry({ tier: "warmup", isWarmUp: true, targetSets: 1, weight: 135 }),
        "Barbell Squat"
      )
    ).toBe("Next: Barbell Squat warm-up · 135 lbs");
  });
});
