"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { getGroupedExercises, filterGroupsByMuscle } from "@/lib/exerciseCategories";
import ExerciseRow from "@/components/Exercises/ExerciseRow";
import { MuscleFilter } from "@/components/Exercises/MuscleFilter";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SkeletonCard } from "@/components/ui/skeleton";
import type { ExercisePreference, ExercisePreferences, MuscleGroup, MuscleId } from "@/types";

type FilterTab = "all" | "push" | "pull" | "legs" | "core";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "push", label: "Push" },
  { value: "pull", label: "Pull" },
  { value: "legs", label: "Legs" },
  { value: "core", label: "Core" },
];

export default function ExercisesPage() {
  const [dbReady, setDbReady] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [muscle, setMuscle] = useState<MuscleId | null>(null);

  useEffect(() => {
    initializeDatabase().then(() => setDbReady(true));
  }, []);

  const profile = useLiveQuery(
    () => db.userProfile.toCollection().first(),
    [],
    undefined
  );

  const preferences = profile?.settings.exercisePreferences ?? {};

  const groups = filterGroupsByMuscle(
    getGroupedExercises(filter === "all" ? undefined : (filter as MuscleGroup)),
    muscle
  );

  const handlePreferenceChange = useCallback(
    async (exerciseId: string, pref: ExercisePreference) => {
      if (!profile) return;
      const updated: ExercisePreferences = {
        ...profile.settings.exercisePreferences,
      };
      if (pref === "normal") {
        delete updated[exerciseId];
      } else {
        updated[exerciseId] = pref;
      }
      await db.userProfile.update(profile.id, {
        settings: { ...profile.settings, exercisePreferences: updated },
        synced: false,
      });
    },
    [profile]
  );

  if (!dbReady || !profile) {
    return (
      <div className="mx-auto max-w-lg px-5 pt-5 pb-28 space-y-4">
        <div className="h-5 w-24 rounded bg-muted animate-pulse mb-6" />
        <div className="h-9 rounded-lg bg-muted animate-pulse mb-4" />
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-5 pt-5 pb-28">
      {/* Header */}
      <header className="flex items-center gap-3 mb-6">
        <Link
          href="/more"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Exercises</h1>
      </header>

      {/* Filter tabs */}
      <SegmentedControl
        value={filter}
        onChange={setFilter}
        options={FILTER_TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
        className="mb-4"
      />

      <MuscleFilter value={muscle} onChange={setMuscle} />

      {groups.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No exercises match this filter.
        </p>
      )}

      {/* Grouped sections */}
      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.label}>
            <div className="mb-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h2>
              <p className="text-xs text-muted-foreground">
                {group.description}
              </p>
            </div>
            <div className="space-y-2">
              {group.exercises.map((exercise) => (
                <ExerciseRow
                  key={exercise.id}
                  exercise={exercise}
                  preferences={preferences}
                  onPreferenceChange={handlePreferenceChange}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
