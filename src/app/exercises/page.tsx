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
import { CurrentLocationMarks } from "@/components/Exercises/PreferenceControl";
import { LocationChip } from "@/components/ui/location-chip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useTrainingLocation } from "@/hooks";
import { SkeletonCard } from "@/components/ui/skeleton";
import { resolvePreferences, setScopedPreference } from "@/lib/exercisePreferences";
import type {
  ExercisePreference,
  ExercisePreferences,
  MuscleGroup,
  MuscleId,
  PreferenceScope,
} from "@/types";

const SCOPE_OPTIONS: { value: PreferenceScope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "gym", label: "Gym" },
  { value: "home", label: "Home" },
];

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
  const [scope, setScope] = useState<PreferenceScope>("all");
  const { location } = useTrainingLocation();

  useEffect(() => {
    initializeDatabase().then(() => setDbReady(true));
  }, []);

  const profile = useLiveQuery(
    () => db.userProfile.toCollection().first(),
    [],
    undefined
  );

  // Rows show and edit the preference for the chosen scope. For Gym or Home
  // that is the value in effect there (the overall one unless overridden).
  const overall = profile?.settings.exercisePreferences;
  const byLocation = profile?.settings.exercisePreferencesByLocation;
  const preferences: ExercisePreferences =
    scope === "all" ? (overall ?? {}) : resolvePreferences(overall, byLocation, scope);
  const overrideIds = new Set(scope === "all" ? [] : Object.keys(byLocation?.[scope] ?? {}));

  const groups = filterGroupsByMuscle(
    getGroupedExercises(filter === "all" ? undefined : (filter as MuscleGroup)),
    muscle
  );

  const handlePreferenceChange = useCallback(
    async (exerciseId: string, pref: ExercisePreference) => {
      if (!profile) return;
      const next = setScopedPreference(
        profile.settings.exercisePreferences,
        profile.settings.exercisePreferencesByLocation,
        scope,
        exerciseId,
        pref
      );
      await db.userProfile.update(profile.id, {
        settings: {
          ...profile.settings,
          exercisePreferences: next.overall,
          exercisePreferencesByLocation: next.byLocation,
        },
        synced: false,
      });
    },
    [profile, scope]
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

      {/* Which preferences are being edited is a separate question from where you train. */}
      <div className="mb-4 space-y-1.5" data-testid="preference-scope">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Training at <LocationChip location={location} size="sm" className="align-middle" />.
          Preferences set for &lsquo;All&rsquo; apply everywhere; Gym or Home ones apply only
          there.
        </p>
        <div className="space-y-0.5">
          <span className="text-xs text-muted-foreground">Editing preferences for</span>
          <SegmentedControl value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
          <CurrentLocationMarks location={location} />
        </div>
        {scope !== "all" && (
          <p className="text-[11px] text-muted-foreground">
            Changes here apply to {scope === "gym" ? "Gym" : "Home"} workouts only.
          </p>
        )}
      </div>

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
                  overrideLabel={
                    overrideIds.has(exercise.id)
                      ? scope === "gym"
                        ? "Gym only"
                        : "Home only"
                      : undefined
                  }
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
