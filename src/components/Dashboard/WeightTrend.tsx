"use client";

import { useMemo } from "react";
import { useBodyweightLog, useProfile } from "@/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { AnimatedNumber } from "@/components/ui/animated-number";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getTrendIndicator(
  entries: { date: Date; weight: number }[]
): { symbol: string; label: string } {
  if (entries.length < 3) return { symbol: "", label: "" };

  const sorted = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const recent3 = sorted.slice(0, 3);
  const avgRecent = recent3.reduce((s, e) => s + e.weight, 0) / recent3.length;

  const older = sorted.slice(3, 7);
  if (older.length === 0) return { symbol: "", label: "" };
  const avgOlder = older.reduce((s, e) => s + e.weight, 0) / older.length;

  const diff = avgRecent - avgOlder;
  if (diff < -0.5) return { symbol: "\u2193", label: "losing" };
  if (diff > 0.5) return { symbol: "\u2191", label: "gaining" };
  return { symbol: "\u2192", label: "maintaining" };
}

export default function WeightTrend() {
  const profile = useProfile();
  // Oldest first, so the latest entry is last.
  const log = useBodyweightLog();

  const { recentWeights, latestWeight, allRecentWeights } = useMemo(() => {
    if (!log) {
      return { recentWeights: undefined, latestWeight: undefined, allRecentWeights: undefined };
    }
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    return {
      recentWeights: log.filter((w) => new Date(w.date) >= sevenDaysAgo),
      latestWeight: log[log.length - 1] ?? null,
      allRecentWeights: log.filter((w) => new Date(w.date) >= fourteenDaysAgo),
    };
  }, [log]);

  const greeting = getGreeting();
  const name = profile?.name ?? "there";

  const currentWeight = latestWeight?.weight ?? profile?.bodyweight ?? null;
  const avg7Day =
    recentWeights && recentWeights.length > 0
      ? recentWeights.reduce((s, e) => s + e.weight, 0) / recentWeights.length
      : null;

  const trend = allRecentWeights ? getTrendIndicator(allRecentWeights) : null;

  return (
    <Card className="border-0 bg-transparent shadow-none py-2 gap-2">
      <CardContent className="px-0">
        <h2 className="text-base text-muted-foreground">
          {greeting}, {name}
        </h2>
        <div className="mt-3 mb-1 flex items-center justify-between">
          <div>
            {currentWeight !== null ? (
              <div className="flex items-baseline gap-2">
                <AnimatedNumber value={currentWeight} className="text-3xl font-extrabold" />
                <span className="text-sm text-muted-foreground">lbs</span>
                {trend && trend.symbol && (
                  <span
                    className={`text-lg animate-in fade-in fill-mode-both ${
                      trend.label === "losing"
                        ? "text-success slide-in-from-top-1"
                        : trend.label === "gaining"
                          ? "text-warning slide-in-from-bottom-1"
                          : "text-muted-foreground slide-in-from-left-1"
                    }`}
                    style={{ animationDuration: "200ms" }}
                    title={trend.label}
                  >
                    {trend.symbol}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No weight logged yet
              </p>
            )}
            {avg7Day !== null && (
              <p className="text-xs text-muted-foreground mt-1">
                7-day avg: {avg7Day.toFixed(1)} lbs
              </p>
            )}
            {allRecentWeights && allRecentWeights.length >= 2 && (
              <div className="w-20 h-8 mt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={allRecentWeights.map(w => ({ weight: w.weight }))}>
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="oklch(0.6 0.1 260)"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <Link href="/weigh-in">
            <Button variant="outline" size="sm">
              Log Weight
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
