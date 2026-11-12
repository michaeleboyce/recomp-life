"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useBodyweightLog } from "@/hooks";
import { logBodyweight, updateBodyweight } from "@/lib/data/records";
import type { TimeOfDay } from "@/types";
import { PageShell } from "@/components/ui/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function getDefaultTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  return hour < 12 ? "morning" : "evening";
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function timeOfDayLabel(tod: TimeOfDay): string {
  if (tod === "morning") return "AM";
  if (tod === "evening") return "PM";
  return "";
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function WeighInPage() {
  const router = useRouter();
  const [weight, setWeight] = useState("");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(getDefaultTimeOfDay());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bodyweightLog = useBodyweightLog();

  // Last 14 entries, newest first, for trend calculation (need 14 for two 7-day windows)
  const recentEntries = useMemo(
    () => (bodyweightLog ?? []).slice(-14).reverse(),
    [bodyweightLog]
  );

  // The last 5 for display
  const last5 = recentEntries.slice(0, 5);

  // Pre-fill weight from last entry
  useEffect(() => {
    if (recentEntries.length > 0 && weight === "") {
      setWeight(String(recentEntries[0].weight));
    }
  }, [recentEntries, weight]);

  // Check if already logged today
  const todayEntry = useMemo(() => {
    const todayStart = startOfDay(new Date());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    // The log is oldest first, so the first match is the earliest entry today.
    return (
      (bodyweightLog ?? []).find((e) => {
        const t = new Date(e.date).getTime();
        return t >= todayStart.getTime() && t < tomorrowStart.getTime();
      }) ?? null
    );
  }, [bodyweightLog]);

  // Calculate 7-day average (from first 7 entries)
  const avg7Day =
    recentEntries.length > 0
      ? recentEntries
          .slice(0, Math.min(7, recentEntries.length))
          .reduce((sum, e) => sum + e.weight, 0) /
        Math.min(7, recentEntries.length)
      : null;

  // Calculate previous 7-day average (entries 8-14) for trend
  const prev7Day =
    recentEntries.length > 7
      ? recentEntries
          .slice(7, Math.min(14, recentEntries.length))
          .reduce((sum, e) => sum + e.weight, 0) /
        Math.min(7, recentEntries.length - 7)
      : null;

  // Trend: difference per week
  const trendPerWeek =
    avg7Day !== null && prev7Day !== null ? avg7Day - prev7Day : null;

  const handleSave = useCallback(async () => {
    setError(null);

    const parsedWeight = parseFloat(weight);
    if (isNaN(parsedWeight) || parsedWeight < 50 || parsedWeight > 500) {
      setError("Please enter a valid weight between 50 and 500 lbs.");
      return;
    }

    setSaving(true);

    try {
      if (todayEntry) {
        // Update existing entry for today
        await updateBodyweight(todayEntry.id, {
          weight: parsedWeight,
          timeOfDay,
        });
      } else {
        // Create new entry
        await logBodyweight({
          date: startOfDay(new Date()),
          weight: parsedWeight,
          timeOfDay,
        });
      }
      router.push("/");
    } catch {
      setError("Failed to save. Please try again.");
      setSaving(false);
    }
  }, [weight, timeOfDay, todayEntry, router]);

  if (bodyweightLog === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-40 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <PageShell>
      {/* Header */}
      <header className="flex items-center gap-3 mb-6">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Log Weight</h1>
      </header>

      <div className="space-y-4">
        {/* Weight Input */}
        <Card>
          <CardContent>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Today&apos;s Weight
            </h2>
            <div className="flex items-center justify-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="50"
                max="500"
                value={weight}
                onChange={(e) => {
                  setWeight(e.target.value);
                  setError(null);
                }}
                placeholder="0.0"
                className="w-40 rounded-lg border border-input bg-background px-4 py-3 text-center text-3xl font-bold font-mono tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <span className="text-lg text-muted-foreground">lbs</span>
            </div>
            {todayEntry && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Updating today&apos;s existing entry
              </p>
            )}
            {error && (
              <p className="text-xs text-destructive text-center mt-2">
                {error}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Time of Day Selector */}
        <Card>
          <CardContent>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Time of Day
            </h2>
            <div className="flex gap-2">
              {(["morning", "evening", "other"] as const).map((tod) => (
                <button
                  key={tod}
                  type="button"
                  onClick={() => setTimeOfDay(tod)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                    timeOfDay === tod
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-input bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {tod}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Entries */}
        {last5.length > 0 && (
          <Card>
            <CardContent>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Last {last5.length} Entries
              </h2>
              <div className="space-y-2">
                {last5.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">
                      {formatDate(entry.date)}
                    </span>
                    <span className="font-medium font-mono tabular-nums text-foreground">
                      {entry.weight} lbs
                      {entry.timeOfDay !== "other" && (
                        <span className="text-muted-foreground ml-1">
                          ({timeOfDayLabel(entry.timeOfDay)})
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        {(avg7Day !== null || trendPerWeek !== null) && (
          <Card>
            <CardContent>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Stats
              </h2>
              <div className="space-y-2">
                {avg7Day !== null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">7-day avg</span>
                    <span className="font-medium font-mono tabular-nums text-foreground">
                      {avg7Day.toFixed(1)} lbs
                    </span>
                  </div>
                )}
                {trendPerWeek !== null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Trend</span>
                    <span
                      className={`font-medium ${
                        trendPerWeek < -0.1
                          ? "text-success"
                          : trendPerWeek > 0.1
                            ? "text-warning"
                            : "text-foreground"
                      }`}
                    >
                      {trendPerWeek < 0 ? "\u2193" : trendPerWeek > 0 ? "\u2191" : "\u2192"}{" "}
                      <span className="font-mono tabular-nums">{Math.abs(trendPerWeek).toFixed(1)} lbs/week</span>
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Save Button */}
        <Button
          className="w-full h-12 text-base font-semibold"
          onClick={handleSave}
          disabled={saving || weight === ""}
        >
          {saving ? "Saving..." : "Save Weight"}
        </Button>
      </div>
    </PageShell>
  );
}
