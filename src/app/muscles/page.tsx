"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import type { MuscleId, RecoveryStatus, TrainingPhase } from "@/types";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { getMonday } from "@/lib/dates";
import {
  getMuscleLastTrained,
  getMuscleRecovery,
  getWeeklyMuscleLoad,
  weeklyHeatLevels,
} from "@/lib/muscleLoad";
import { getWeeklyVolumeSummary } from "@/lib/volumeTracking";
import { MUSCLE_GROUPS, MUSCLE_GROUP_ORDER, formatMuscle } from "@/lib/muscles";
import { HEAT_COLORS, RECOVERY_COLORS } from "@/lib/anatomy/palette";
import { Anatomy3D } from "@/components/Anatomy/Anatomy3D";
import { MuscleLegend } from "@/components/Anatomy/MuscleLegend";
import { MuscleInfoSheet } from "@/components/Anatomy/MuscleInfoSheet";
import BodyMapSVG from "@/components/BodyMap/BodyMapSVG";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SkeletonCard } from "@/components/ui/skeleton";

type Mode = "volume" | "recovery" | "pain";

const MODES: { value: Mode; label: string }[] = [
  { value: "volume", label: "This Week" },
  { value: "recovery", label: "Recovery" },
  { value: "pain", label: "Pain" },
];

const RECOVERY_LABELS: Record<RecoveryStatus, string> = {
  recovering: "Recovering",
  ready: "Ready",
  primed: "Primed",
  detraining: "Long break",
};

const WEEKLY_TARGET_SETS = 10;

function formatSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function MusclesPage() {
  const router = useRouter();
  const [dbReady, setDbReady] = useState(false);
  const [mode, setMode] = useState<Mode>("volume");
  const [selected, setSelected] = useState<MuscleId | null>(null);

  useEffect(() => {
    initializeDatabase().then(() => setDbReady(true));
  }, []);

  const workouts = useLiveQuery(() => db.workouts.toArray(), [], undefined);
  const profile = useLiveQuery(() => db.userProfile.toCollection().first(), [], undefined);
  const painEntries = useLiveQuery(
    async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const all = await db.painEntries.toArray();
      return all.filter((e) => new Date(e.date) >= cutoff);
    },
    [],
    []
  );

  const data = useMemo(() => {
    const list = workouts ?? [];
    const now = new Date();
    const monday = getMonday(now);
    const phase: TrainingPhase = profile?.settings?.trainingPhase ?? { mode: "maintaining" };
    const weekLoad = getWeeklyMuscleLoad(list, monday);
    const recovery = getMuscleRecovery(list, now, phase);
    return {
      weekLoad,
      weekHeat: weeklyHeatLevels(weekLoad),
      weekVolume: getWeeklyVolumeSummary(list, monday).muscleGroups,
      lastTrained: getMuscleLastTrained(list),
      recovery,
      recoveryColors: Object.fromEntries(
        Object.entries(recovery).map(([m, status]) => [m, RECOVERY_COLORS[status]])
      ) as Record<MuscleId, string>,
    };
  }, [workouts, profile]);

  if (!dbReady || workouts === undefined) {
    return (
      <div className="mx-auto max-w-lg px-5 pt-5 pb-28 space-y-4">
        <div className="h-5 w-24 rounded bg-muted animate-pulse mb-6" />
        <div className="h-9 rounded-lg bg-muted animate-pulse mb-4" />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-5 pt-5 pb-28">
      <header className="flex items-center gap-3 mb-5">
        <Link
          href="/more"
          aria-label="Back to tools"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Muscles</h1>
      </header>

      <SegmentedControl
        value={mode}
        onChange={setMode}
        options={MODES}
        className="mb-4"
      />

      {mode === "pain" ? (
        <section className="space-y-4">
          <BodyMapSVG
            activeEntries={painEntries}
            selectedRegion={null}
            onRegionTap={() => router.push("/body-check")}
          />
          <p className="text-center text-xs text-muted-foreground">
            {painEntries.length === 0
              ? "No pain or soreness logged in the last 30 days."
              : "Pain and soreness logged in the last 30 days."}
          </p>
          <Link href="/body-check" className="block">
            <Button variant="outline" className="w-full">
              Open Body Check
            </Button>
          </Link>
        </section>
      ) : (
        <>
          <Anatomy3D
            heat={mode === "volume" ? data.weekHeat : undefined}
            colors={mode === "recovery" ? data.recoveryColors : undefined}
            selected={selected}
            onMusclePress={setSelected}
            orbit="free"
            className="h-[380px] max-h-[56vh]"
            label={
              mode === "volume"
                ? "Training load this week by muscle"
                : "Recovery status by muscle"
            }
          />
          <MuscleLegend variant={mode === "volume" ? "weekly" : "recovery"} className="mt-3" />

          <div className="mt-5 space-y-4">
            {MUSCLE_GROUP_ORDER.map((group) => (
              <section key={group}>
                <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </h2>
                <ul className="space-y-1">
                  {MUSCLE_GROUPS[group].map((muscle) => {
                    const sets = data.weekLoad[muscle] ?? 0;
                    const status = data.recovery[muscle];
                    return (
                      <li key={muscle}>
                        <button
                          type="button"
                          onClick={() => setSelected(muscle)}
                          className="flex w-full items-center gap-3 rounded-lg bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-muted/70"
                        >
                          <span className="w-28 shrink-0 text-sm">{formatMuscle(muscle)}</span>
                          {mode === "volume" ? (
                            <>
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                <span
                                  className="block h-full rounded-full"
                                  style={{
                                    width: `${Math.min(100, (sets / WEEKLY_TARGET_SETS) * 100)}%`,
                                    backgroundColor: HEAT_COLORS[data.weekHeat[muscle] ?? 1],
                                  }}
                                />
                              </span>
                              <span className="w-[4.5rem] shrink-0 whitespace-nowrap text-right font-mono text-xs tabular-nums text-muted-foreground">
                                {formatSets(sets)} sets
                              </span>
                            </>
                          ) : (
                            <span
                              className="flex-1 text-right text-xs font-medium"
                              style={{ color: RECOVERY_COLORS[status] }}
                            >
                              {RECOVERY_LABELS[status]}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      <MuscleInfoSheet
        muscle={selected}
        onClose={() => setSelected(null)}
        volume={selected ? data.weekVolume[selected] : undefined}
        lastTrained={selected ? data.lastTrained[selected] : undefined}
        recovery={selected ? data.recovery[selected] : undefined}
      />
    </div>
  );
}
