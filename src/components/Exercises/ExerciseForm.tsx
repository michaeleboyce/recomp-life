"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ActivationLevel, MuscleId } from "@/types";
import { EXERCISES, HOME_SUBSTITUTE_CHAINS } from "@/lib/exercises";
import { getExerciseMedia } from "@/lib/exerciseMedia";
import { formatMuscle } from "@/lib/muscles";
import { formatRegion } from "@/lib/painModifications";
import { Badge } from "@/components/ui/badge";
import { ExerciseViewer } from "@/components/ExerciseDemo/ExerciseViewer";
import { exercisePageHref } from "@/components/Today/todayModel";
import { PreferenceControl } from "./PreferenceControl";

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  cable: "Cable",
  bodyweight: "Bodyweight",
  machine: "Machine",
};

const LEVELS: {
  level: ActivationLevel;
  label: string;
  field: "primaryMuscles" | "secondaryMuscles" | "stabilizerMuscles";
}[] = [
  { level: "primary", label: "Primary", field: "primaryMuscles" },
  { level: "secondary", label: "Secondary", field: "secondaryMuscles" },
  { level: "stabilizer", label: "Stabilisers", field: "stabilizerMuscles" },
];

/** Other exercises this one substitutes for or is substituted by. */
function relatedExerciseIds(exerciseId: string): string[] {
  const exercise = EXERCISES[exerciseId];
  const ids = new Set<string>();
  if (exercise.dumbbellAlternative) ids.add(exercise.dumbbellAlternative);
  if (exercise.barbellEquivalent) ids.add(exercise.barbellEquivalent);
  for (const [main, chain] of Object.entries(HOME_SUBSTITUTE_CHAINS)) {
    if (main === exerciseId) chain.forEach((id) => ids.add(id));
    if (chain.includes(exerciseId)) {
      ids.add(main);
      chain.forEach((id) => ids.add(id));
    }
  }
  ids.delete(exerciseId);
  return [...ids].filter((id) => EXERCISES[id]);
}

/**
 * The Form tab of an exercise's page: the demo, where it sits in your preferences, the
 * muscles it trains, how to do it and its alternatives.
 */
export function ExerciseForm({ exerciseId }: { exerciseId: string }) {
  const exercise = EXERCISES[exerciseId];
  const media = getExerciseMedia(exerciseId);
  const related = relatedExerciseIds(exerciseId);

  return (
    <div className="flex flex-col gap-5">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary" className="text-[12px]">
          {EQUIPMENT_LABELS[exercise.type] ?? exercise.type}
        </Badge>
        <span className="capitalize">{exercise.muscleGroup.replace("_", " ")}</span>
      </p>

      <ExerciseViewer exerciseId={exerciseId} />

      <PreferenceControl exerciseId={exerciseId} />

      <section aria-label="Muscles" className="space-y-2">
        {LEVELS.map(({ level, label, field }) => {
          const muscles = exercise[field] as MuscleId[];
          if (muscles.length === 0) return null;
          return (
            <div key={level} className="flex items-start gap-3">
              <span className="w-20 shrink-0 pt-0.5 text-xs text-muted-foreground">
                {label}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {muscles.map((m) => (
                  <Badge
                    key={m}
                    variant={level === "primary" ? "default" : "secondary"}
                    className="text-[12px]"
                  >
                    {formatMuscle(m)}
                  </Badge>
                ))}
              </div>
            </div>
          );
        })}
        {exercise.painSensitiveRegions.length > 0 && (
          <div className="flex items-start gap-3">
            <span className="w-20 shrink-0 pt-0.5 text-xs text-muted-foreground">
              Go easy if sore
            </span>
            <p className="text-xs text-foreground">
              {exercise.painSensitiveRegions.map(formatRegion).join(", ")}
            </p>
          </div>
        )}
      </section>

      {media && media.instructions.length > 0 && (
        <section aria-label="How to">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            How to
          </h2>
          <ol className="space-y-2">
            {media.instructions.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[12px] text-muted-foreground">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {media.sourceName !== exercise.name && (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Steps and photos show &ldquo;{media.sourceName}&rdquo; from the
              free-exercise-db public-domain set.
            </p>
          )}
        </section>
      )}

      {related.length > 0 && (
        <section aria-label="Alternatives">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Alternatives
          </h2>
          <ul className="space-y-1.5">
            {related.map((id) => (
              <li key={id}>
                <Link
                  href={exercisePageHref(id)}
                  className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5 text-sm transition-colors hover:bg-muted/70"
                >
                  {EXERCISES[id].name}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

    </div>
  );
}
