"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/db/local";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { RunType, RunCategory, RunLog } from "@/types";

const RUN_TYPES: { value: RunType; label: string }[] = [
  { value: "outdoor", label: "Outdoor" },
  { value: "treadmill", label: "Treadmill" },
  { value: "trail", label: "Trail" },
];

const RUN_CATEGORIES: { value: RunCategory; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "tempo", label: "Tempo" },
  { value: "intervals", label: "Intervals" },
  { value: "long", label: "Long" },
  { value: "other", label: "Other" },
];

const EFFORT_LABELS: Record<number, string> = {
  1: "Easy",
  2: "Light",
  3: "Moderate",
  4: "Hard",
  5: "All-out",
};

export default function RunLogger() {
  const router = useRouter();

  const [durationMinutes, setDurationMinutes] = useState<string>("");
  const [distanceMiles, setDistanceMiles] = useState<string>("");
  const [runType, setRunType] = useState<RunType>("outdoor");
  const [category, setCategory] = useState<RunCategory>("easy");
  const [perceivedEffort, setPerceivedEffort] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);

    const duration = Number(durationMinutes);
    if (!duration || duration <= 0) {
      setError("Please enter a valid duration.");
      return;
    }

    const distance = distanceMiles.trim()
      ? Number(distanceMiles)
      : null;
    if (distance !== null && (isNaN(distance) || distance < 0)) {
      setError("Please enter a valid distance or leave it blank.");
      return;
    }

    setSaving(true);

    try {
      const id = uuidv4();
      const run: RunLog = {
        id,
        clientId: id,
        date: new Date(),
        durationMinutes: duration,
        distanceMiles: distance,
        type: runType,
        category,
        notes: notes.trim(),
        perceivedEffort,
        synced: false,
      };

      await db.runs.add(run);
      router.push("/?runSaved=1");
    } catch (err) {
      setError("Failed to save run. Please try again.");
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Log a Run</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Duration */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Duration (minutes) <span className="text-destructive">*</span>
          </label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="30"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Distance */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Distance (miles)
          </label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.1}
            placeholder="3.0"
            value={distanceMiles}
            onChange={(e) => setDistanceMiles(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Run Type */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Type</label>
          <div className="flex gap-2">
            {RUN_TYPES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setRunType(value)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                  runType === value
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Category</label>
          <div className="flex flex-wrap gap-2">
            {RUN_CATEGORIES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                  category === value
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Perceived Effort */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Perceived Effort
          </label>
          <div className="flex gap-2">
            {([1, 2, 3, 4, 5] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setPerceivedEffort(level)}
                className={`flex-1 flex flex-col items-center gap-0.5 rounded-md border px-2 py-2 text-xs transition-colors ${
                  perceivedEffort === level
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                <span className="text-sm font-semibold">{level}</span>
                <span className="text-[10px] leading-tight">
                  {EFFORT_LABELS[level]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Notes</label>
          <textarea
            rows={2}
            placeholder="How did it feel?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* Save Button */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "SAVE RUN"}
        </Button>
      </CardContent>
    </Card>
  );
}
