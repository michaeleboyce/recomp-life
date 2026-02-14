"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

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
  const profile = useLiveQuery(() => db.userProfile.toCollection().first());

  const recentWeights = useLiveQuery(async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return db.bodyweight
      .where("date")
      .aboveOrEqual(sevenDaysAgo)
      .reverse()
      .sortBy("date");
  });

  const latestWeight = useLiveQuery(async () => {
    const all = await db.bodyweight.orderBy("date").reverse().limit(1).toArray();
    return all[0] ?? null;
  });

  const allRecentWeights = useLiveQuery(async () => {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    return db.bodyweight
      .where("date")
      .aboveOrEqual(fourteenDaysAgo)
      .sortBy("date");
  });

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
        <h2 className="text-xl font-semibold text-foreground">
          {greeting}, {name}
        </h2>
        <div className="mt-2 flex items-center justify-between">
          <div>
            {currentWeight !== null ? (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground">
                  {currentWeight}
                </span>
                <span className="text-sm text-muted-foreground">lbs</span>
                {trend && trend.symbol && (
                  <span
                    className={`text-lg ${
                      trend.label === "losing"
                        ? "text-green-400"
                        : trend.label === "gaining"
                          ? "text-orange-400"
                          : "text-muted-foreground"
                    }`}
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
