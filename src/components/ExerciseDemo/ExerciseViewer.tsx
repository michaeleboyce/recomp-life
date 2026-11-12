"use client";

import { useMemo, useState } from "react";
import { hasExercisePhotos } from "@/lib/exerciseMedia";
import { activationHeatLevels, bestViewForExercise } from "@/lib/muscleLoad";
import { EXERCISES } from "@/lib/exercises";
import { Anatomy3D } from "@/components/Anatomy/Anatomy3D";
import { MuscleLegend } from "@/components/Anatomy/MuscleLegend";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { hasMotion } from "@/lib/motion/sample";
import { ExercisePhotos } from "./ExercisePhotos";
import { Mannequin } from "./Mannequin";

type Tab = "demo" | "muscles" | "photos";

interface ExerciseViewerProps {
  exerciseId: string;
  /** Height of the viewing area, e.g. "h-80". */
  heightClassName?: string;
  className?: string;
}

/**
 * The visual for one exercise: the muscles it works on the 3D body, and
 * reference photos when the exercise has them. Tabs with no content are not
 * shown.
 */
export function ExerciseViewer({
  exerciseId,
  heightClassName = "h-80",
  className,
}: ExerciseViewerProps) {
  const photos = hasExercisePhotos(exerciseId);
  const demo = hasMotion(exerciseId);
  const tabs = useMemo(() => {
    const list: { value: Tab; label: string }[] = [];
    if (demo) list.push({ value: "demo", label: "3D Demo" });
    list.push({ value: "muscles", label: "Muscles" });
    if (photos) list.push({ value: "photos", label: "Photos" });
    return list;
  }, [demo, photos]);

  const [tab, setTab] = useState<Tab>(demo ? "demo" : "muscles");
  const active = tabs.some((t) => t.value === tab) ? tab : tabs[0].value;
  const heat = useMemo(() => activationHeatLevels(exerciseId), [exerciseId]);
  const name = EXERCISES[exerciseId]?.name ?? "exercise";

  return (
    <div className={cn("space-y-3", className)}>
      {tabs.length > 1 && <SegmentedControl value={active} onChange={setTab} options={tabs} />}

      {active === "demo" && (
        // Taller than the other tabs: the controls sit under the figure.
        <Mannequin exerciseId={exerciseId} className={cn(heightClassName, "min-h-[22rem]")} />
      )}

      {active === "muscles" && (
        <div>
          <Anatomy3D
            heat={heat}
            initialView={bestViewForExercise(exerciseId)}
            className={heightClassName}
            label={`Muscles worked by ${name}`}
          />
          <MuscleLegend variant="activation" className="mt-2" />
        </div>
      )}

      {active === "photos" && (
        <ExercisePhotos exerciseId={exerciseId} className={heightClassName} />
      )}
    </div>
  );
}
