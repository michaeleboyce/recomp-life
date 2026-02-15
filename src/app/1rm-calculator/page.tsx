"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EXERCISES } from "@/lib/exercises";
import { calculateE1RM } from "@/lib/e1rm";

const MAIN_EXERCISE_IDS = ["squat", "bench", "deadlift", "ohp"];

export default function OneRMCalculatorPage() {
  const [selectedExercise, setSelectedExercise] = useState("bench");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  const exerciseOptions = useMemo(
    () =>
      Object.values(EXERCISES)
        .filter((e) => e.type === "barbell" || MAIN_EXERCISE_IDS.includes(e.id))
        .concat(
          Object.values(EXERCISES).filter(
            (e) => e.type !== "barbell" && !MAIN_EXERCISE_IDS.includes(e.id)
          )
        ),
    []
  );

  const weightNum = parseFloat(weight);
  const repsNum = parseInt(reps, 10);
  const e1rm =
    !isNaN(weightNum) && weightNum > 0 && !isNaN(repsNum) && repsNum >= 2
      ? calculateE1RM(weightNum, repsNum)
      : null;

  const percentages = useMemo(() => {
    if (!e1rm) return [];
    return [100, 95, 90, 85, 80, 75, 70, 65, 60].map((pct) => ({
      pct,
      weight: Math.round((e1rm * pct) / 100 / 5) * 5,
      reps: pct >= 95 ? "1-2" : pct >= 85 ? "3-5" : pct >= 75 ? "6-8" : pct >= 65 ? "8-12" : "12+",
    }));
  }, [e1rm]);

  return (
    <div className="mx-auto max-w-lg px-5 pt-5 pb-28">
      <header className="flex items-center gap-3 mb-6">
        <Link
          href="/tools"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">1RM Calculator</h1>
      </header>

      <div className="space-y-4">
        {/* Exercise selector */}
        <Card>
          <CardContent className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Exercise
            </h2>
            <select
              value={selectedExercise}
              onChange={(e) => setSelectedExercise(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              {exerciseOptions.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        {/* Input */}
        <Card>
          <CardContent className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Set
            </h2>
            <p className="text-xs text-muted-foreground">
              Enter the weight and reps from a recent working set (2+ reps).
            </p>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">
                  Weight (lbs)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="185"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">
                  Reps completed
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="5"
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Result */}
        {e1rm !== null && (
          <Card>
            <CardContent className="space-y-4">
              <div className="text-center py-2">
                <p className="text-xs text-muted-foreground mb-1">
                  Estimated 1RM for {EXERCISES[selectedExercise]?.name}
                </p>
                <p className="text-4xl font-bold font-mono tabular-nums text-primary">{e1rm} lbs</p>
                <p className="text-xs text-muted-foreground mt-1 font-mono tabular-nums">
                  Based on {weight} lbs x {reps} reps (Epley formula)
                </p>
              </div>

              {/* Percentage table */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Training Percentages
                </h3>
                <div className="space-y-1">
                  {percentages.map(({ pct, weight: w, reps: r }) => (
                    <div
                      key={pct}
                      className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm ${
                        pct === 100
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-foreground"
                      }`}
                    >
                      <span className="text-muted-foreground w-12 font-mono tabular-nums">{pct}%</span>
                      <span className="font-medium font-mono tabular-nums">{w} lbs</span>
                      <span className="text-xs text-muted-foreground w-12 text-right font-mono tabular-nums">
                        {r}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Hint when no result */}
        {e1rm === null && weight && reps && (
          <p className="text-xs text-muted-foreground text-center">
            Enter at least 2 reps to calculate an estimate.
          </p>
        )}
      </div>
    </div>
  );
}
