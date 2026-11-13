// The rebuild engine. Contracts only: implemented by the rebuild-engine package.
import type { Estimated1RM, LiftState, WorkoutSession } from "@/types";
import type {
  ChangePreview,
  DerivedDiff,
  LogChange,
  LogState,
  RebuildInput,
  RebuildResult,
} from "./types";

export type * from "./types";

const notImplemented = (name: string): never => {
  throw new Error(`${name} is not implemented yet`);
};

/** Lift states and e1RM rows computed from the log alone. Pure and deterministic. */
export function rebuildDerived(input: RebuildInput): RebuildResult {
  void input;
  return notImplemented("rebuildDerived");
}

/** The e1RM rows for one workout's eligible sets, with ids `e1rm:<workoutId>:<setId>`. */
export function e1rmsForWorkout(workout: WorkoutSession): Estimated1RM[] {
  void workout;
  return notImplemented("e1rmsForWorkout");
}

/** The log after one change. Never mutates its input. */
export function applyChange(log: LogState, change: LogChange): LogState {
  void log;
  void change;
  return notImplemented("applyChange");
}

/** What a change would do to the next workout, PRs and e1RM history, without saving it. */
export function previewLogChange(input: RebuildInput, change: LogChange): ChangePreview {
  void input;
  void change;
  return notImplemented("previewLogChange");
}

/** The writes that bring stored derived rows in line with a rebuild. */
export function diffDerived(
  rebuilt: Pick<RebuildResult, "liftStates" | "e1rms">,
  stored: { liftStates: LiftState[]; e1rms: Estimated1RM[] }
): DerivedDiff {
  void rebuilt;
  void stored;
  return notImplemented("diffDerived");
}
