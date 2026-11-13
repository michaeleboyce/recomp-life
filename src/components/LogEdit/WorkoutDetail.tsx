"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CalendarClock, Dumbbell, House, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useWorkout } from "@/hooks";
import type { LogChange } from "@/lib/rebuild";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { SetLog, WorkoutSession } from "@/types";
import { ExerciseSets } from "./ExerciseSets";
import { formatDateTime, formatDuration } from "./format";
import { groupSets, lastWorkingSet, nextSetNumber, type ExerciseGroup } from "./groupSets";
import { SetEditSheet } from "./SetEditSheet";
import { useCommitLogChange } from "./useCommitLogChange";
import { useDeleteWithUndo } from "./useDeleteWithUndo";
import { WorkoutMetaSheet } from "./WorkoutMetaSheet";

type Editing =
  | { mode: "edit"; set: SetLog }
  | { mode: "add"; set: SetLog; nextSetNumber: number }
  | null;

export function workoutTitle(workout: Pick<WorkoutSession, "templateId">): string {
  return WORKOUT_TEMPLATES[workout.templateId]?.name ?? `Workout ${workout.templateId}`;
}

const MESSAGES: Record<LogChange["kind"], string> = {
  editSet: "Set saved",
  addSet: "Set added",
  deleteSet: "Set deleted",
  editWorkout: "Workout saved",
  deleteWorkout: "Workout deleted",
  restoreWorkout: "Workout restored",
  adjustLift: "Weight saved",
};

const iconButton = "size-11";

/**
 * A finished workout with every set, editable in place: tap a set to edit it, "Add set"
 * per exercise, and header actions for date/location and delete.
 */
export function WorkoutDetail({
  workoutId,
  headerExtra,
  onDeleted,
}: {
  workoutId: string;
  /** Extra header actions supplied by the screen, e.g. a favourite star. */
  headerExtra?: ReactNode;
  /** Called after the workout is deleted, e.g. to navigate back. */
  onDeleted?: () => void;
}) {
  const workout = useWorkout(workoutId);
  const flow = useCommitLogChange();
  const deletion = useDeleteWithUndo();
  const [editing, setEditing] = useState<Editing>(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const groups = useMemo(() => (workout ? groupSets(workout.sets) : []), [workout]);

  const submit = (change: LogChange) => flow.submit(change, { message: MESSAGES[change.kind] });

  if (workout === undefined) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading workout...</p>;
  }
  if (workout === null) {
    return (
      <>
        <EmptyState
          icon={<Dumbbell />}
          title={deleted ? "Workout deleted" : "Workout not found"}
          body={
            deleted
              ? "Use Undo in the message below, or restore it from Recently deleted."
              : "It may have been deleted. Deleted workouts can be restored from Recently deleted."
          }
        />
        {deletion.sheet}
      </>
    );
  }

  const title = workoutTitle(workout);
  const LocationIcon = workout.location === "home" ? House : Dumbbell;
  const openAdd = (group: ExerciseGroup) => {
    const like = lastWorkingSet(group);
    if (like) setEditing({ mode: "add", set: like, nextSetNumber: nextSetNumber(group, like.tier) });
  };

  return (
    <article className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDateTime(workout.completedAt ?? workout.startedAt)}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <LocationIcon className="size-4" aria-hidden="true" />
            <span>{workout.location === "home" ? "Home" : "Gym"}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{formatDuration(workout.totalDurationSeconds)}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {headerExtra}
          <Button
            variant="ghost"
            size="icon"
            className={iconButton}
            aria-label="Edit date and location"
            onClick={() => setMetaOpen(true)}
          >
            <CalendarClock className="size-5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`${iconButton} text-destructive hover:text-destructive`}
            aria-label="Delete workout"
            disabled={deletion.busy}
            onClick={() =>
              void deletion.deleteEntry("workouts", workout.id, title, () => {
                setDeleted(true);
                onDeleted?.();
              })
            }
          >
            <Trash2 className="size-5" aria-hidden="true" />
          </Button>
        </div>
      </header>

      {groups.length === 0 ? (
        <EmptyState icon={<Dumbbell />} title="No sets logged" />
      ) : (
        groups.map((group) => (
          <ExerciseSets
            key={group.exerciseId}
            group={group}
            onEditSet={(set) => setEditing({ mode: "edit", set })}
            onAddSet={lastWorkingSet(group) ? () => openAdd(group) : undefined}
          />
        ))
      )}

      {editing && (
        <SetEditSheet
          open
          onOpenChange={(open) => !open && setEditing(null)}
          workoutId={workout.id}
          set={editing.set}
          mode={editing.mode}
          nextSetNumber={editing.mode === "add" ? editing.nextSetNumber : undefined}
          onSubmit={submit}
        />
      )}
      <WorkoutMetaSheet open={metaOpen} onOpenChange={setMetaOpen} workout={workout} onSubmit={submit} />
      {flow.sheet}
      {deletion.sheet}
    </article>
  );
}
