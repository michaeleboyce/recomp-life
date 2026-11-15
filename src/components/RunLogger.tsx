"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logRun } from "@/lib/data/records";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { DateField, dateFromInput, toDateInputValue } from "@/components/Activity/DateField";
import { EffortPicker, type Effort } from "@/components/Activity/EffortPicker";
import type { RunType, RunCategory } from "@/types";

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

/** Form for a run. `returnTo` is where to go after a save (default Today). */
export default function RunLogger({ returnTo = "/" }: { returnTo?: string }) {
  const router = useRouter();

  const [durationMinutes, setDurationMinutes] = useState<string>("");
  const [distanceMiles, setDistanceMiles] = useState<string>("");
  const [runType, setRunType] = useState<RunType>("outdoor");
  const [category, setCategory] = useState<RunCategory>("easy");
  const [perceivedEffort, setPerceivedEffort] = useState<Effort>(3);
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
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
      await logRun({
        date: dateFromInput(date),
        durationMinutes: duration,
        distanceMiles: distance,
        type: runType,
        category,
        notes: notes.trim(),
        perceivedEffort,
      });
      toast({ message: "Run saved" });
      router.push(returnTo);
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
        <DateField id="run-date" value={date} onChange={setDate} />

        {/* Duration */}
        <div className="space-y-1.5">
          <label htmlFor="run-duration" className="text-sm font-medium text-foreground">
            Duration (minutes) <span className="text-destructive">*</span>
          </label>
          <input
            id="run-duration"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="30"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-foreground/30"
          />
        </div>

        {/* Distance */}
        <div className="space-y-1.5">
          <label htmlFor="run-distance" className="text-sm font-medium text-foreground">
            Distance (miles)
          </label>
          <input
            id="run-distance"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.1}
            placeholder="3.0"
            value={distanceMiles}
            onChange={(e) => setDistanceMiles(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-foreground/30"
          />
        </div>

        {/* Run Type */}
        <div className="space-y-1.5">
          <span id="run-type-label" className="block text-sm font-medium text-foreground">Type</span>
          <div role="group" aria-labelledby="run-type-label" className="flex gap-2">
            {RUN_TYPES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setRunType(value)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-all duration-150 ${
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
          <span id="run-category-label" className="block text-sm font-medium text-foreground">Category</span>
          <div role="group" aria-labelledby="run-category-label" className="flex flex-wrap gap-2">
            {RUN_CATEGORIES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className={`rounded-md border px-3 py-2 text-sm transition-all duration-150 ${
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
        <EffortPicker value={perceivedEffort} onChange={setPerceivedEffort} />

        {/* Notes */}
        <div className="space-y-1.5">
          <label htmlFor="run-notes" className="text-sm font-medium text-foreground">Notes</label>
          <textarea
            id="run-notes"
            rows={2}
            placeholder="How did it feel?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-foreground/30 resize-none"
          />
        </div>

        {/* Error */}
        {error && (
          <p role="alert" className="text-sm text-destructive">{error}</p>
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
