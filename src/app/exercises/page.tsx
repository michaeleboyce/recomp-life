"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { getGroupedExercises } from "@/lib/exerciseCategories";
import ExerciseRow from "@/components/Exercises/ExerciseRow";
import type { ExercisePreference, ExercisePreferences, MuscleGroup } from "@/types";

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

  useEffect(() => {
    initializeDatabase().then(() => setDbReady(true));
  }, []);

  const profile = useLiveQuery(
    () => db.userProfile.toCollection().first(),
    [],
    undefined
  );

  const preferences = profile?.settings.exercisePreferences ?? {};

  const groups = getGroupedExercises(
    filter === "all" ? undefined : (filter as MuscleGroup)
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
      });
    },
    [profile]
  );

  if (!dbReady || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-4 pb-24">
      {/* Header */}
      <header className="flex items-center gap-3 mb-6">
        <Link
          href="/tools"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Exercises</h1>
      </header>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg bg-muted/50 p-1 mb-4">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilter(tab.value)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
              filter === tab.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

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
