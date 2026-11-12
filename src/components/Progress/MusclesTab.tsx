"use client";

// The body of the Muscles screen (anatomy, weekly load, recovery and pain), shared by
// /muscles and the Progress > Muscles tab. Moved from src/app/muscles/page.tsx without
// changing what it shows; the page keeps its own header.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MuscleId, RecoveryStatus, TrainingPhase } from "@/types";
import { useCompletedWorkouts, usePainEntries, useSettings } from "@/hooks";
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
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
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
const PAIN_WINDOW_DAYS = 30;

function formatSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function MusclesTab() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("volume");
  const [selected, setSelected] = useState<MuscleId | null>(null);

  const workouts = useCompletedWorkouts();
  const settings = useSettings();
  const allPain = usePainEntries();
  const painEntries = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - PAIN_WINDOW_DAYS);
    return (allPain ?? []).filter((e) => new Date(e.date) >= cutoff);
  }, [allPain]);

  const data = useMemo(() => {
    const list = workouts ?? [];
    const now = new Date();
    const monday = getMonday(now);
    const phase: TrainingPhase = settings?.trainingPhase ?? { mode: "maintaining" };
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
  }, [workouts, settings]);

  if (workouts === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-9 rounded-lg bg-muted animate-pulse mb-4" />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div data-testid="muscles-tab">
      <SegmentedControl value={mode} onChange={setMode} options={MODES} className="mb-4" />

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
            label={mode === "volume" ? "Training load this week by muscle" : "Recovery status by muscle"}
          />
          <MuscleLegend variant={mode === "volume" ? "weekly" : "recovery"} className="mt-3" />
          {mode === "volume" && <EvidenceLine ruleId="weekly-volume" className="mt-3" />}

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
