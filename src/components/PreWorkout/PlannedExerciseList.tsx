"use client";

import { TierBadge } from "@/components/ui/tier-badge";
import { Term } from "@/components/ui/term";
import type { TermId } from "@/lib/glossary";
import { TierKey } from "@/components/Upcoming/TierKey";
import { getExercise } from "@/lib/exercises";
import { formatRestDuration, getRestSeconds } from "@/lib/restTimes";
import { isNextSetAMRAP } from "@/lib/workout/logSet";
import { isWorkingSet } from "@/lib/workout/setSelectors";
import type { WorkoutExerciseState, WorkoutPlan } from "@/lib/workout/types";
import type { PlannedSet, Tier, TrainingPhase } from "@/types";
import { AccessoryRows } from "@/components/Today/AccessoryRows";
import type { AccessoryRowView } from "@/components/Today/accessoryRowModel";
import { ImpactLine } from "./ImpactLine";
import type { ImpactItem } from "./impact";

interface PlannedExerciseListProps {
  /** The plan from `buildWorkoutPlan`: the same one the active workout performs. */
  plan: WorkoutPlan;
  /** Sets the rest shown after each exercise's sets (longer for heavy tiers while cutting). */
  trainingPhase?: TrainingPhase;
  /** Per program lift, when the workout has been edited: what the edit does to progression. */
  impact?: ImpactItem[];
  /**
   * The accessories as Today shows them (A8), each with its reason: given, they are
   * listed under the lifts in their own rows with "Change" (`onChangeAccessories`)
   * instead of as plain entries.
   */
  accessories?: AccessoryRowView[];
  onChangeAccessories?: () => void;
}

interface Row {
  entry: WorkoutExerciseState;
  warmUps: WorkoutExerciseState[];
}

const TIER_TERM: Partial<Record<Tier, TermId>> = { T1: "t1", T2: "t2", T3: "t3", accessory: "accessory" };

/** Working entries, each with the warm-up entries that lead into it. */
function toRows(plan: WorkoutPlan): Row[] {
  const rows: Row[] = [];
  let warmUps: WorkoutExerciseState[] = [];
  for (const entry of plan) {
    if (entry.isWarmUp) {
      warmUps.push(entry);
    } else {
      rows.push({ entry, warmUps });
      warmUps = [];
    }
  }
  return rows;
}

function weightLabel(entry: WorkoutExerciseState): string {
  const info = getExercise(entry.substituteExerciseId || entry.exerciseId);
  return info.grip === "per_hand" ? `${entry.weight} lbs/hand` : `${entry.weight} lbs`;
}

const setText = (set: PlannedSet, amrap: boolean) => `${set.weight}×${set.reps}${amrap ? "+" : ""}`;

/**
 * How an entry's sets read: "5×3+" (sets × reps, as always), and with a weight per set
 * the working sets the same way (the ones pass or fail is judged on, at the weight shown)
 * with the extra sets listed by role under the name, as the active screen's set chips
 * have them: "ramp: 200×3 · 225×3", "back-off: 200×8". Working sets that differ are
 * listed too ("working: 240×3 · 250×3+"), the AMRAP on the last one.
 */
function setsView(entry: WorkoutExerciseState): { scheme: string; lines: string[] } {
  const amrap = entry.isAMRAP ? "+" : "";
  if (!entry.perSet) return { scheme: `${entry.targetSets}×${entry.targetReps}${amrap}`, lines: [] };
  const sets = entry.perSet;
  const working = sets.filter(isWorkingSet);
  const uniform =
    working.length > 0 && working.every((s) => s.weight === working[0].weight && s.reps === working[0].reps);
  const line = (label: string, pick: (set: PlannedSet) => boolean) => {
    const listed = sets.flatMap((set, i) => (pick(set) ? [setText(set, isNextSetAMRAP({ ...entry, completedSets: i }))] : []));
    return listed.length > 0 ? [`${label}: ${listed.join(" · ")}`] : [];
  };
  return {
    scheme: uniform
      ? `${working.length}×${working[0].reps}${amrap}`
      : working.length > 0
        ? `${working.length} working ${working.length === 1 ? "set" : "sets"}`
        : `${sets.length} ${sets.length === 1 ? "set" : "sets"}`,
    lines: [
      ...line("ramp", (set) => set.role === "ramp"),
      ...(uniform ? [] : line("working", isWorkingSet)),
      ...line("back-off", (set) => set.role === "backoff"),
    ],
  };
}

/**
 * The workout exactly as it will be performed: tier, exercise, weight, sets x reps,
 * and the rest the timer will run after each of its sets.
 */
export function PlannedExerciseList({
  plan,
  trainingPhase,
  impact = [],
  accessories,
  onChangeAccessories,
}: PlannedExerciseListProps) {
  const notDone = impact.filter((item) => item.status === "not-done");
  const hasWarmUps = plan.some((entry) => entry.isWarmUp);
  // The first badge of each tier opens its glossary entry; later ones stay plain.
  const explained = new Set<Tier>();
  return (
    <div className="flex flex-col gap-1.5">
      <TierKey warmUp={hasWarmUps} rest />
      <ul className="divide-y divide-border" aria-label="Exercises">
        {toRows(accessories ? plan.filter((entry) => entry.tier !== "accessory") : plan).map(({ entry, warmUps }, index) => {
          const info = getExercise(entry.substituteExerciseId || entry.exerciseId);
          const original = entry.substituteExerciseId ? getExercise(entry.exerciseId) : null;
          const rest = formatRestDuration(getRestSeconds(entry.tier, trainingPhase));
          const sets = setsView(entry);
          const entryImpact = impact.find(
            (item) =>
              item.edited &&
              item.status !== "not-done" &&
              item.exerciseId === entry.exerciseId &&
              item.tier === entry.tier
          );
          return (
            <li
              key={`${entry.exerciseId}-${entry.tier}-${index}`}
              data-testid="planned-exercise"
              className="flex items-center gap-3 py-2.5"
            >
              {(() => {
                const badge = <TierBadge tier={entry.tier} variant="soft" className="w-10 rounded-md" />;
                const term = TIER_TERM[entry.tier];
                if (!term || explained.has(entry.tier)) return badge;
                explained.add(entry.tier);
                return (
                  <Term id={term} label={entry.tier} className="shrink-0 no-underline">
                    {badge}
                  </Term>
                );
              })()}
              <div className="min-w-0 flex-1">
                {/* Long names wrap to a second line rather than being cut off. */}
                <p className="line-clamp-2 text-sm font-medium break-words">{info.name}</p>
                {original && (
                  <p className="line-clamp-2 text-xs break-words text-muted-foreground">
                    in place of {original.name}
                    {entry.originalWeight ? ` at ${entry.originalWeight} lbs` : ""}
                  </p>
                )}
                {entryImpact && <ImpactLine status={entryImpact.status} heavier={entryImpact.heavier} />}
                {warmUps.length > 0 && (
                  <p className="font-mono text-xs break-words tabular-nums text-muted-foreground">
                    warm-up: {warmUps.map((w) => `${w.weight}×${w.targetReps}`).join(" · ")}
                  </p>
                )}
                {sets.lines.map((line) => (
                  <p
                    key={line}
                    data-testid="planned-sets"
                    className="font-mono text-xs break-words tabular-nums text-muted-foreground"
                  >
                    {line}
                  </p>
                ))}
              </div>
              <div className="shrink-0 text-right font-mono tabular-nums">
                <p className="text-sm font-semibold">{weightLabel(entry)}</p>
                <p className="text-xs text-muted-foreground">
                  <span data-testid="planned-scheme">{sets.scheme}</span>
                  <span data-testid="planned-rest"> · rest {rest}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {accessories && <AccessoryRows views={accessories} onChange={onChangeAccessories} />}
      {notDone.length > 0 && (
        <ul aria-label="Not done today" className="flex flex-col gap-1.5 border-t border-border pt-2.5">
          {notDone.map((item) => (
            <li key={`${item.exerciseId}-${item.tier}`} data-testid="not-done-exercise">
              <p className="text-sm font-medium text-muted-foreground">
                {getExercise(item.exerciseId).name}
              </p>
              <ImpactLine status="not-done" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
