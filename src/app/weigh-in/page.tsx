"use client";

import { Suspense, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useBodyweightLog, useMetric } from "@/hooks";
import { logBodyweight, updateBodyweight } from "@/lib/data/records";
import type { TimeOfDay } from "@/types";
import { PageShell } from "@/components/ui/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { backTarget } from "@/components/nav/backTarget";
import { BackButton } from "@/components/nav/BackButton";
import { useGoBack } from "@/components/nav/useNavHistory";
import { DateField, dateFromInput, toDateInputValue } from "@/components/Activity/DateField";
import { STALE_WEIGH_IN_DAYS } from "@/components/Today/GlanceTiles";
import {
  averageOfLatest,
  currentRate,
  defaultTimeOfDay,
  entryOnDay,
  MAX_BODYWEIGHT_LBS,
  MIN_BODYWEIGHT_LBS,
  parseBodyweight,
  startOfDay,
} from "@/lib/weighIn";

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

function WeighInScreen() {
  // Back, and Save, return to the previous screen; with none, a known `from` is
  // used and anything else goes to Today.
  const target = backTarget(useSearchParams()?.get("from"));
  const goBack = useGoBack(target.href);
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  // What the user has typed; empty until they do.
  const [typedWeight, setWeight] = useState("");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(() => defaultTimeOfDay(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When the screen opened, read once.
  const [openedAt] = useState(() => Date.now());

  const bodyweightLog = useBodyweightLog();
  // The same weekly rate Today shows.
  const rate = useMetric("lossRate");

  // Last 14 entries, newest first, for trend calculation (need 14 for two 7-day windows)
  const recentEntries = useMemo(
    () => (bodyweightLog ?? []).slice(-14).reverse(),
    [bodyweightLog]
  );

  // The last 5 for display
  const last5 = recentEntries.slice(0, 5);

  // The last weight is only a hint; Save stays off until a weight is typed.
  const weight = typedWeight;
  const lastWeight = recentEntries.length > 0 ? String(recentEntries[0].weight) : null;

  // The entry already logged on the chosen day, if any
  const todayEntry = useMemo(
    () => entryOnDay(bodyweightLog ?? [], dateFromInput(date)),
    [bodyweightLog, date]
  );

  // The average of the latest 7 entries
  const avg7Day = averageOfLatest(recentEntries, 7);

  // Rate of change per week from the shared metric, and not when it is out of date
  // (judged against when the screen opened: rendering never reads the clock).
  const trendPerWeek = currentRate(rate?.full.points.at(-1), openedAt, STALE_WEIGH_IN_DAYS);

  const handleSave = useCallback(async () => {
    setError(null);

    const parsedWeight = parseBodyweight(weight);
    if (parsedWeight === null) {
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
          date: startOfDay(dateFromInput(date)),
          weight: parsedWeight,
          timeOfDay,
        });
      }
      toast({ message: "Weight saved" });
      goBack();
    } catch {
      setError("Failed to save. Please try again.");
      setSaving(false);
    }
  }, [weight, timeOfDay, todayEntry, goBack, date]);

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
        <BackButton fallback={target.href}>
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </BackButton>
        <h1 className="text-lg font-bold text-foreground">Log Weight</h1>
      </header>

      <div className="space-y-4">
        {/* Weight Input */}
        <Card>
          <CardContent>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {date === toDateInputValue(new Date()) ? "Today's Weight" : "Weight"}
            </h2>
            <div className="flex items-center justify-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={MIN_BODYWEIGHT_LBS}
                max={MAX_BODYWEIGHT_LBS}
                aria-label="Weight in pounds"
                value={weight}
                onChange={(e) => {
                  setWeight(e.target.value);
                  setError(null);
                }}
                placeholder={lastWeight ?? "0.0"}
                className="w-40 rounded-lg border border-input bg-background px-4 py-3 text-center text-3xl font-bold font-mono tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <span className="text-lg text-muted-foreground">lbs</span>
            </div>
            {todayEntry && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Updating the existing entry for this day
              </p>
            )}
            {error && (
              <p role="alert" className="text-xs text-destructive text-center mt-2">
                {error}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <DateField id="weigh-in-date" value={date} onChange={setDate} />
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

export default function WeighInPage() {
  return (
    // Reading the query string suspends while the page is prerendered.
    <Suspense fallback={null}>
      <WeighInScreen />
    </Suspense>
  );
}
