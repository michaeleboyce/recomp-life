import { create } from "zustand";
import type { SetLog, Tier, WorkoutLocation } from "@/types";

export interface WorkoutExerciseState {
  exerciseId: string;
  substituteExerciseId?: string;
  tier: Tier;
  targetSets: number;
  targetReps: number;
  weight: number;
  originalWeight?: number;
  isAMRAP: boolean;
  isWarmUp: boolean;
  completedSets: number;
}

interface WorkoutStore {
  sessionId: string | null;
  templateId: string;
  location: WorkoutLocation;
  currentExerciseIndex: number;
  currentSetIndex: number;
  exercises: WorkoutExerciseState[];
  isRestTimerActive: boolean;
  restTimeRemaining: number;
  restTimerDuration: number;
  workoutStartTime: Date | null;
  completedSets: SetLog[];

  // Actions
  startWorkout: (
    sessionId: string,
    templateId: string,
    location: WorkoutLocation,
    exercises: WorkoutExerciseState[]
  ) => void;
  logSet: (set: SetLog) => void;
  skipSet: () => void;
  nextExercise: () => void;
  startRestTimer: (seconds: number) => void;
  tickTimer: () => void;
  skipRest: () => void;
  addRestTime: (seconds: number) => void;
  advanceSet: () => void;
  updateExerciseWeight: (exerciseIndex: number, newWeight: number) => void;
  reset: () => void;
}

const initialState = {
  sessionId: null,
  templateId: "",
  location: "gym" as WorkoutLocation,
  currentExerciseIndex: 0,
  currentSetIndex: 0,
  exercises: [] as WorkoutExerciseState[],
  isRestTimerActive: false,
  restTimeRemaining: 0,
  restTimerDuration: 0,
  workoutStartTime: null as Date | null,
  completedSets: [] as SetLog[],
};

export const useWorkoutStore = create<WorkoutStore>((set, get) => ({
  ...initialState,

  startWorkout: (sessionId, templateId, location, exercises) => {
    set({
      sessionId,
      templateId,
      location,
      exercises,
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      workoutStartTime: new Date(),
      completedSets: [],
      isRestTimerActive: false,
      restTimeRemaining: 0,
      restTimerDuration: 0,
    });
  },

  logSet: (setLog: SetLog) => {
    const state = get();
    const exercises = [...state.exercises];
    const currentExercise = { ...exercises[state.currentExerciseIndex] };
    currentExercise.completedSets += 1;
    exercises[state.currentExerciseIndex] = currentExercise;

    set({
      exercises,
      completedSets: [...state.completedSets, setLog],
    });
  },

  skipSet: () => {
    const state = get();
    const exercises = [...state.exercises];
    const currentExercise = { ...exercises[state.currentExerciseIndex] };
    currentExercise.completedSets += 1;
    exercises[state.currentExerciseIndex] = currentExercise;

    set({ exercises });
  },

  advanceSet: () => {
    const state = get();
    const currentExercise = state.exercises[state.currentExerciseIndex];

    if (currentExercise.completedSets >= currentExercise.targetSets) {
      // Move to next exercise
      const nextIndex = state.currentExerciseIndex + 1;
      set({
        currentExerciseIndex: nextIndex,
        currentSetIndex: 0,
      });
    } else {
      set({
        currentSetIndex: state.currentSetIndex + 1,
      });
    }
  },

  nextExercise: () => {
    const state = get();
    const nextIndex = state.currentExerciseIndex + 1;
    set({
      currentExerciseIndex: nextIndex,
      currentSetIndex: 0,
    });
  },

  startRestTimer: (seconds: number) => {
    set({
      isRestTimerActive: true,
      restTimeRemaining: seconds,
      restTimerDuration: seconds,
    });
  },

  tickTimer: () => {
    const state = get();
    if (state.isRestTimerActive) {
      set({ restTimeRemaining: state.restTimeRemaining - 1 });
    }
  },

  skipRest: () => {
    set({
      isRestTimerActive: false,
      restTimeRemaining: 0,
      restTimerDuration: 0,
    });
  },

  addRestTime: (seconds: number) => {
    set((state) => ({
      restTimeRemaining: state.restTimeRemaining + seconds,
      restTimerDuration: state.restTimerDuration + seconds,
    }));
  },

  updateExerciseWeight: (exerciseIndex: number, newWeight: number) => {
    set((state) => {
      const exercises = [...state.exercises];
      exercises[exerciseIndex] = {
        ...exercises[exerciseIndex],
        weight: newWeight,
      };
      return { exercises };
    });
  },

  reset: () => {
    set(initialState);
  },
}));
