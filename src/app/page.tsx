"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { initializeDatabase } from "@/db/init";
import WeightTrend from "@/components/Dashboard/WeightTrend";
import ActivePainBanner from "@/components/Dashboard/ActivePainBanner";
import RecoveryStatusBars from "@/components/Dashboard/RecoveryStatusBars";
import WeekSummary from "@/components/Dashboard/WeekSummary";
import NextWorkoutCard from "@/components/Dashboard/NextWorkoutCard";
import E1RMSummary from "@/components/Dashboard/E1RMSummary";
import GymDebtBanner from "@/components/Dashboard/GymDebtBanner";

export default function DashboardPage() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initializeDatabase().then(() => setDbReady(true));
  }, []);

  if (!dbReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
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
        <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both" style={{ animationDelay: "60ms", animationDuration: "300ms" }}>
          <RecoveryStatusBars />
        </div>

        {/* Week Summary */}
        <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both" style={{ animationDelay: "120ms", animationDuration: "300ms" }}>
          <WeekSummary />
        </div>

        {/* Next Workout */}
        <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both" style={{ animationDelay: "180ms", animationDuration: "300ms" }}>
          <NextWorkoutCard />
        </div>

        {/* E1RM Summary */}
        <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both" style={{ animationDelay: "240ms", animationDuration: "300ms" }}>
          <E1RMSummary />
        </div>

        {/* Last Workout Recap */}
        <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both" style={{ animationDelay: "300ms", animationDuration: "300ms" }}>
          <GymDebtBanner />
        </div>
      </div>
    </div>
  );
}
