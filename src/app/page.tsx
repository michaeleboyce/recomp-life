"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton";
import WeightTrend from "@/components/Dashboard/WeightTrend";
import ActivePainBanner from "@/components/Dashboard/ActivePainBanner";
import RecoveryStatusBars from "@/components/Dashboard/RecoveryStatusBars";
import WeekSummary from "@/components/Dashboard/WeekSummary";
import NextWorkoutCard from "@/components/Dashboard/NextWorkoutCard";
import MuscleHeatCard from "@/components/Dashboard/MuscleHeatCard";
import E1RMSummary from "@/components/Dashboard/E1RMSummary";
import GymDebtBanner from "@/components/Dashboard/GymDebtBanner";
import type { PainSorenessEntry } from "@/types";

export default function DashboardPage() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initializeDatabase().then(() => setDbReady(true));
  }, []);

  // Pain auto-clear: find pain entries older than 7 days
  const stalePainEntries = useLiveQuery(async () => {
    if (!dbReady) return [];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const allEntries = await db.painEntries.toArray();
    return allEntries.filter(
      (entry) =>
        entry.sensation === "pain" &&
        new Date(entry.date).getTime() < sevenDaysAgo.getTime()
    );
  }, [dbReady]) ?? [];

  const handlePainResolved = useCallback(async (entryId: string) => {
    try {
      await db.painEntries.delete(entryId);
    } catch (err) {
      console.error("Failed to delete pain entry:", err);
    }
  }, []);

  const handlePainStillThere = useCallback(async (entryId: string) => {
    try {
      await db.painEntries.update(entryId, { date: new Date() });
    } catch (err) {
      console.error("Failed to update pain entry:", err);
    }
  }, []);

  if (!dbReady) {
    return (
      <div className="mx-auto max-w-lg px-5 pt-5 pb-28 space-y-4">
        <div className="space-y-2 mb-4">
          <div className="h-5 w-40 rounded bg-muted animate-pulse" />
          <div className="h-8 w-24 rounded bg-muted animate-pulse" />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
            style={{ animationDelay: `${i * 50}ms`, animationDuration: "300ms" }}
          >
            <SkeletonCard />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-5 pt-5 pb-28">
      {/* Header with ambient gradient */}
      <div className="relative mb-4">
        <div className="absolute inset-0 -mx-4 -mt-4 h-48 bg-gradient-to-b from-indigo-950/30 via-slate-950/20 to-transparent pointer-events-none" />
        <div className="relative">
          <header className="flex items-center justify-between mb-4">
            <h1 className="text-lg font-bold text-foreground">ReComp Life</h1>
            <Link
              href="/settings"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings className="h-5 w-5" />
            </Link>
          </header>
          <WeightTrend />
        </div>
      </div>

      {/* Dashboard sections */}
      <div className="space-y-4">
        {/* Active Pain Banner */}
        <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both" style={{ animationDelay: "0ms", animationDuration: "300ms" }}>
          <ActivePainBanner />
        </div>

        {/* Recovery Status */}
        <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both" style={{ animationDelay: "50ms", animationDuration: "300ms" }}>
          <RecoveryStatusBars />
        </div>

        {/* Week Summary */}
        <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both" style={{ animationDelay: "100ms", animationDuration: "300ms" }}>
          <WeekSummary />
        </div>

        {/* Next Workout */}
        <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both" style={{ animationDelay: "150ms", animationDuration: "300ms" }}>
          <NextWorkoutCard />
        </div>

        {/* Muscles This Week */}
        <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both" style={{ animationDelay: "175ms", animationDuration: "300ms" }}>
          <MuscleHeatCard />
        </div>

        {/* E1RM Summary */}
        <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both" style={{ animationDelay: "200ms", animationDuration: "300ms" }}>
          <E1RMSummary />
        </div>

        {/* Gym Debt */}
        <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both" style={{ animationDelay: "250ms", animationDuration: "300ms" }}>
          <GymDebtBanner />
        </div>

        {/* Pain Auto-Clear Prompt */}
        {stalePainEntries.length > 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both space-y-3" style={{ animationDelay: "300ms", animationDuration: "300ms" }}>
            {stalePainEntries.map((entry) => {
              const daysAgo = Math.floor(
                (Date.now() - new Date(entry.date).getTime()) / (1000 * 60 * 60 * 24)
              );
              const regionLabel = entry.region.replace(/_/g, " ");
              return (
                <Card key={entry.id}>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground mb-3">
                      {regionLabel.charAt(0).toUpperCase() + regionLabel.slice(1)} pain (logged {daysAgo} day{daysAgo !== 1 ? "s" : ""} ago) -- Still bothering you?
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePainStillThere(entry.id)}
                      >
                        Still there
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handlePainResolved(entry.id)}
                      >
                        Resolved!
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
