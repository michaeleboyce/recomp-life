"use client";

import { EXERCISES } from "@/lib/exercises";
import { dumbbellToBarbell } from "@/lib/dbConversion";
import { calculateE1RM } from "@/lib/e1rm";
import type { SetLog, Tier, WorkoutModification } from "@/types";

interface LiftResultProps {
  exerciseId: string;
  tier: Tier;
  sets: SetLog[];
  modifications: WorkoutModification[];
  previousE1RM: number | null;
  nextWeight: number | null;
  passed: boolean | null;
  stageChange: string | null;
  isHome: boolean;
}

/**
 * Format an exercise display including substitution info.
 */
function getExerciseDisplay(
  exerciseId: string,
  sets: SetLog[]
) {
  const exercise = EXERCISES[exerciseId];
  const displayName = exercise?.name ?? exerciseId;

  // Check if a substitute was used
  const substitutedSet = sets.find((s) => s.isSubstituted && s.substituteExerciseId);
  if (substitutedSet && substitutedSet.substituteExerciseId) {
    const subExercise = EXERCISES[substitutedSet.substituteExerciseId];
    return {
      name: subExercise?.name ?? substitutedSet.substituteExerciseId,
      originalName: displayName,
      isSubstituted: true,
    };
  }

  return { name: displayName, originalName: null, isSubstituted: false };
}

export default function LiftResult({
  exerciseId,
  tier,
  sets,
  modifications,
  previousE1RM,
  nextWeight,
  passed,
  stageChange,
  isHome,
}: LiftResultProps) {
  if (sets.length === 0) return null;

  const exerciseDisplay = getExerciseDisplay(exerciseId, sets);
  const weight = sets[0]?.weight ?? 0;
  const setsCount = sets.length;

  // Find AMRAP set (last set in T1 or T3)
  const amrapSet = sets.find((s) => s.isAMRAP);
  const amrapReps = amrapSet?.actualReps ?? null;

  // Calculate e1RM from AMRAP set (T1 only)
  const e1rm =
    tier === "T1" && amrapSet
      ? calculateE1RM(amrapSet.weight, amrapSet.actualReps)
      : null;

  const e1rmDelta =
    e1rm !== null && previousE1RM !== null ? e1rm - previousE1RM : null;

  // Average RPE across all sets
  const rpeValues = sets.filter((s) => s.rpe !== undefined).map((s) => s.rpe!);
  const avgRPE =
    rpeValues.length > 0
      ? rpeValues.reduce((sum, r) => sum + r, 0) / rpeValues.length
      : null;

  // Check for pain modification
  const painMod = modifications.find(
    (m) => m.exerciseId === exerciseId && m.source === "pain"
  );

  // Check for equipment adaptation
  const equipMod = modifications.find(
    (m) => m.exerciseId === exerciseId && m.source === "equipment_limit"
  );

  // Barbell equivalent for home dumbbell exercises
  const actualExerciseId = sets[0]?.substituteExerciseId ?? exerciseId;
  const actualExercise = EXERCISES[actualExerciseId];
  const showBarbellEquiv =
    isHome &&
    actualExercise?.type === "dumbbell" &&
    actualExercise?.barbellEquivalent;
  const barbellEquiv = showBarbellEquiv
    ? dumbbellToBarbell(weight)
    : null;

  // Determine set/rep display
  const targetReps = sets[0]?.targetReps ?? 0;
  const setRepDisplay = `${setsCount}x${targetReps}${amrapSet ? "+" : ""}`;

  // Total reps for T3
  const totalReps = sets.reduce((sum, s) => sum + s.actualReps, 0);

  // Freeze detection
  const isFrozen = sets.some(
    (s) =>
      s.status === "skipped_pain" ||
      s.status === "reduced_run_fatigue" ||
      s.status === "reduced_equipment" ||
      s.status === "autoregulated_load_drop"
  );

  const isSkipped = sets.every((s) => s.status === "skipped_pain");

  // Status icon and label
  let statusIcon: string;
  let statusLabel: string;
  let statusColor: string;

  if (isSkipped) {
    statusIcon = "\u26D4";
    statusLabel = "Skipped";
    statusColor = "text-red-400";
  } else if (passed === true) {
    statusIcon = "\u2713";
    statusLabel = nextWeight
      ? `Passed \u2014 next: ${nextWeight} lbs`
      : "Completed";
    statusColor = "text-green-400";
  } else if (passed === false) {
    statusIcon = "\u2717";
    statusLabel = stageChange
      ? `Failed ${setRepDisplay} \u2014 moving to ${stageChange}`
      : `Failed ${setRepDisplay}`;
    statusColor = "text-red-400";
  } else if (isFrozen) {
    statusIcon = "\uD83D\uDD04";
    statusLabel = "Froze (progression held)";
    statusColor = "text-yellow-400";
  } else {
    statusIcon = "\u2713";
    statusLabel = "Completed";
    statusColor = "text-green-400";
  }

  return (
    <div className="space-y-1 rounded-lg bg-muted/50 px-4 py-3">
      {/* Header line: Tier + Exercise + Weight */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-semibold text-primary/70">{tier}</span>
          <p className="text-sm font-medium text-foreground">
            {exerciseDisplay.name}
            {exerciseDisplay.isSubstituted && exerciseDisplay.originalName && (
              <span className="text-xs text-muted-foreground ml-1">
                (for {exerciseDisplay.originalName})
              </span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-foreground">
            {setRepDisplay} @ {weight} lbs
            {actualExercise?.grip === "per_hand" && "/hand"}
          </p>
        </div>
      </div>

      {/* Barbell equivalent */}
      {barbellEquiv !== null && (
        <p className="text-xs text-muted-foreground">
          = barbell equiv. {barbellEquiv} lbs
        </p>
      )}

      {/* Status line */}
      <p className={`text-sm ${statusColor}`}>
        {statusIcon} {statusLabel}
      </p>

      {/* Pain modification info */}
      {painMod && (
        <p className="text-xs text-yellow-400">
          (pain-modified from {painMod.originalWeight} lbs)
        </p>
      )}

      {/* Equipment adaptation info */}
      {equipMod && (
        <p className="text-xs text-yellow-400">
          (equipment-limited from {equipMod.originalWeight} lbs)
        </p>
      )}

      {/* AMRAP reps */}
      {amrapReps !== null && tier === "T1" && (
        <p className="text-xs text-muted-foreground">
          AMRAP: {amrapReps} reps
        </p>
      )}

      {/* T3 total reps */}
      {tier === "T3" && (
        <p className="text-xs text-muted-foreground">
          Total: {totalReps} reps
          {nextWeight && nextWeight > weight && (
            <span className="text-green-400">
              {" "}
              {"\u2192"} +{nextWeight - weight} lbs
            </span>
          )}
        </p>
      )}

      {/* e1RM */}
      {e1rm !== null && (
        <p className="text-xs text-muted-foreground">
          {"\uD83D\uDCCA"} Est. 1RM: {e1rm} lbs
          {e1rmDelta !== null && (
            <span
              className={
                e1rmDelta > 0
                  ? "text-green-400"
                  : e1rmDelta < 0
                    ? "text-red-400"
                    : ""
              }
            >
              {" "}
              ({e1rmDelta > 0 ? "+" : ""}
              {e1rmDelta})
            </span>
          )}
        </p>
      )}

      {/* Average RPE */}
      {avgRPE !== null && (
        <p className="text-xs text-muted-foreground">
          Avg RPE: {avgRPE.toFixed(1)}
        </p>
      )}

      {/* Accessory reps display */}
      {tier === "accessory" && (
        <p className="text-xs text-muted-foreground">
          {sets.map((s) => s.actualReps).join("/")}
          {passed ? " \u2713" : ""}
        </p>
      )}
    </div>
  );
}
