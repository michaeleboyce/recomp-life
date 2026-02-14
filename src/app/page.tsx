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
      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-foreground">ReComp Life</h1>
        <Link
          href="/settings"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </header>

      {/* Dashboard sections */}
      <div className="space-y-4">
        {/* Greeting + Weight */}
        <WeightTrend />

        {/* Active Pain Banner */}
        <ActivePainBanner />

        {/* Recovery Status */}
        <RecoveryStatusBars />

        {/* Week Summary */}
        <WeekSummary />

        {/* Next Workout */}
        <NextWorkoutCard />

        {/* E1RM Summary */}
        <E1RMSummary />

        {/* Last Workout Recap */}
        <GymDebtBanner />
      </div>
    </div>
  );
}
