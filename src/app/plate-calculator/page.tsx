"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function calculatePlatesPerSide(
  targetWeight: number,
  barWeight: number,
  availablePlates: number[]
): { plate: number; count: number }[] {
  let remaining = (targetWeight - barWeight) / 2;
  if (remaining <= 0) return [];

  const sorted = [...availablePlates].sort((a, b) => b - a);
  const result: { plate: number; count: number }[] = [];

  for (const plate of sorted) {
    if (remaining <= 0) break;
    const count = Math.floor(remaining / plate);
    if (count > 0) {
      result.push({ plate, count });
      remaining -= plate * count;
    }
  }

  return result;
}

// Plate colors for visual display
const PLATE_COLORS: Record<number, string> = {
  45: "bg-blue-600",
  35: "bg-yellow-500",
  25: "bg-green-600",
  10: "bg-white/90 text-black",
  5: "bg-red-600",
  2.5: "bg-gray-400 text-black",
};

function PlateVisual({ plates }: { plates: { plate: number; count: number }[] }) {
  if (plates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Bar only — no plates needed
      </p>
    );
  }

  // Expand plates into individual items for visual
  const expanded: number[] = [];
  for (const { plate, count } of plates) {
    for (let i = 0; i < count; i++) {
      expanded.push(plate);
    }
  }

  return (
    <div className="space-y-3">
      {/* Visual bar representation */}
      <div className="flex items-center justify-center gap-0.5 py-4">
        {/* Left plates (reversed for visual) */}
        <div className="flex items-center gap-0.5">
          {[...expanded].reverse().map((plate, i) => (
            <div
              key={`l-${i}`}
              className={`rounded-sm flex items-center justify-center text-xs font-bold text-white ${PLATE_COLORS[plate] || "bg-gray-500"}`}
              style={{
                width: `${Math.max(20, plate * 0.6)}px`,
                height: `${Math.min(80, 30 + plate)}px`,
              }}
            >
              {plate >= 10 ? plate : ""}
            </div>
          ))}
        </div>

        {/* Bar */}
        <div className="w-24 h-3 bg-muted-foreground/50 rounded-full" />

        {/* Right plates */}
        <div className="flex items-center gap-0.5">
          {expanded.map((plate, i) => (
            <div
              key={`r-${i}`}
              className={`rounded-sm flex items-center justify-center text-xs font-bold text-white ${PLATE_COLORS[plate] || "bg-gray-500"}`}
              style={{
                width: `${Math.max(20, plate * 0.6)}px`,
                height: `${Math.min(80, 30 + plate)}px`,
              }}
            >
              {plate >= 10 ? plate : ""}
            </div>
          ))}
        </div>
      </div>

      {/* Text breakdown */}
      <div className="text-center space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Per side</p>
        {plates.map(({ plate, count }) => (
          <p key={plate} className="text-sm text-foreground font-mono tabular-nums">
            {count} x {plate} lbs
          </p>
        ))}
      </div>
    </div>
  );
}

export default function PlateCalculatorPage() {
  const [dbReady, setDbReady] = useState(false);
  const [targetWeight, setTargetWeight] = useState(135);

  useEffect(() => {
    initializeDatabase().then(() => setDbReady(true));
  }, []);

  const profile = useLiveQuery(
    () => db.userProfile.toCollection().first(),
    [],
    undefined
  );

  const barWeight = profile?.settings.equipment.barWeight ?? 45;
  const availablePlates = profile?.settings.equipment.availablePlates ?? [45, 35, 25, 10, 5, 2.5];

  // Ensure target weight is at least bar weight
  useEffect(() => {
    if (targetWeight < barWeight) {
      setTargetWeight(barWeight);
    }
  }, [barWeight, targetWeight]);

  const plates = useMemo(
    () => calculatePlatesPerSide(targetWeight, barWeight, availablePlates),
    [targetWeight, barWeight, availablePlates]
  );

  // Calculate actual achievable weight
  const actualWeight = useMemo(() => {
    const perSideWeight = plates.reduce((sum, p) => sum + p.plate * p.count, 0);
    return barWeight + perSideWeight * 2;
  }, [plates, barWeight]);

  if (!dbReady || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-40 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  const quickWeights = [95, 135, 185, 225, 275, 315].filter(w => w >= barWeight);

  return (
    <div className="mx-auto max-w-lg px-5 pt-5 pb-28">
      <header className="flex items-center gap-3 mb-6">
        <Link
          href="/settings"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Plate Calculator</h1>
      </header>

      <div className="space-y-4">
        {/* Weight Input */}
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="text-center">
              <p className="text-4xl font-bold font-mono tabular-nums text-foreground">{targetWeight} lbs</p>
              <p className="text-xs text-muted-foreground mt-1 font-mono tabular-nums">
                Bar: {barWeight} lbs
              </p>
              {actualWeight !== targetWeight && (
                <p className="text-xs text-amber-400 mt-1 font-mono tabular-nums">
                  Closest loadable: {actualWeight} lbs
                </p>
              )}
            </div>

            {/* Slider */}
            <input
              type="range"
              min={barWeight}
              max={500}
              step={5}
              value={targetWeight}
              onChange={(e) => setTargetWeight(Number(e.target.value))}
              className="w-full accent-foreground"
            />

            {/* Quick select buttons */}
            <div className="flex flex-wrap gap-2 justify-center">
              {quickWeights.map((w) => (
                <Button
                  key={w}
                  variant={targetWeight === w ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTargetWeight(w)}
                >
                  {w}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Plate Visual */}
        <Card>
          <CardContent className="pt-4">
            <PlateVisual plates={plates} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
