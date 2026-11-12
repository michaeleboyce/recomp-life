"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import type { ActivationLevel, MuscleId } from "@/types";
import { EXERCISES, HOME_SUBSTITUTE_CHAINS } from "@/lib/exercises";
import { getExerciseMedia } from "@/lib/exerciseMedia";
import { formatMuscle } from "@/lib/muscles";
import { formatRegion } from "@/lib/painModifications";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import E1RMChart from "@/components/Charts/E1RMChart";
import { ExerciseViewer } from "@/components/ExerciseDemo/ExerciseViewer";

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  cable: "Cable",
  bodyweight: "Bodyweight",
  machine: "Machine",
};

const LEVELS: { level: ActivationLevel; label: string; field: "primaryMuscles" | "secondaryMuscles" | "stabilizerMuscles" }[] = [
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

export default function ExerciseDetail({ exerciseId }: { exerciseId: string }) {
  const exercise = EXERCISES[exerciseId];
  const media = getExerciseMedia(exerciseId);
  const related = relatedExerciseIds(exerciseId);

  return (
    <div className="mx-auto max-w-lg px-5 pt-5 pb-28 space-y-5">
      <header className="flex items-center gap-3">
        <Link
          href="/exercises"
          aria-label="Back to exercises"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-foreground">{exercise.name}</h1>
          <div className="mt-0.5 flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {EQUIPMENT_LABELS[exercise.type] ?? exercise.type}
            </Badge>
            <span className="text-xs capitalize text-muted-foreground">
              {exercise.muscleGroup.replace("_", " ")}
            </span>
          </div>
        </div>
      </header>

      <ExerciseViewer exerciseId={exerciseId} />

      <section aria-label="Muscles" className="space-y-2">
        {LEVELS.map(({ level, label, field }) => {
          const muscles = exercise[field] as MuscleId[];
          if (muscles.length === 0) return null;
          return (
            <div key={level} className="flex items-start gap-3">
              <span className="w-20 shrink-0 pt-0.5 text-xs text-muted-foreground">{label}</span>
              <div className="flex flex-wrap gap-1.5">
                {muscles.map((m) => (
                  <Badge
                    key={m}
                    variant={level === "primary" ? "default" : "secondary"}
                    className="text-[11px]"
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
            <span className="w-20 shrink-0 pt-0.5 text-xs text-muted-foreground">Go easy if sore</span>
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
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px] text-muted-foreground">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {media.sourceName !== exercise.name && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Steps and photos show &ldquo;{media.sourceName}&rdquo; from the free-exercise-db
              public-domain set.
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
                  href={`/exercises/${id}`}
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

      <Card>
        <CardContent className="pt-4">
          <E1RMChart exerciseId={exerciseId} exerciseName={exercise.name} />
        </CardContent>
      </Card>
    </div>
  );
}
