"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logActivity } from "@/lib/data/records";
import {
  ACTIVITY_KIND_LABELS,
  DISTANCE_KINDS,
  YOGA_STYLES,
  YOGA_STYLE_LABELS,
} from "@/lib/activities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EffortPicker, type Effort } from "@/components/Activity/EffortPicker";
import type { ActivityKind, YogaStyle } from "@/types";

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-foreground/30";

/** Form for a non-running session. Remount it (via `key`) when the kind changes. */
export default function ActivityLogger({ kind }: { kind: ActivityKind }) {
  const router = useRouter();

  const [durationMinutes, setDurationMinutes] = useState("");
  const [distanceMiles, setDistanceMiles] = useState("");
  const [style, setStyle] = useState<YogaStyle>("flow");
  const [perceivedEffort, setPerceivedEffort] = useState<Effort>(2);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = ACTIVITY_KIND_LABELS[kind];
  const showDistance = DISTANCE_KINDS.includes(kind);

  async function handleSave() {
    setError(null);

    const duration = Number(durationMinutes);
    if (!duration || duration <= 0) {
      setError("Please enter a valid duration.");
      return;
    }

    const distance = showDistance && distanceMiles.trim() ? Number(distanceMiles) : null;
    if (distance !== null && (isNaN(distance) || distance < 0)) {
      setError("Please enter a valid distance or leave it blank.");
      return;
    }

    setSaving(true);

    try {
      await logActivity({
        date: new Date(),
        kind,
        durationMinutes: duration,
        style: kind === "yoga" ? style : null,
        distanceMiles: distance,
        notes: notes.trim(),
        perceivedEffort,
      });
      router.push("/?activitySaved=1");
    } catch {
      setError("Failed to save. Please try again.");
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {kind === "other" ? "Log a Session" : `Log ${label}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Duration */}
        <div className="space-y-1.5">
          <label htmlFor="activity-duration" className="text-sm font-medium text-foreground">
            Duration (minutes) <span className="text-destructive">*</span>
          </label>
          <input
            id="activity-duration"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="30"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        {/* Yoga style */}
        {kind === "yoga" && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Style</label>
            <div className="flex gap-2">
              {YOGA_STYLES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={style === value}
                  onClick={() => setStyle(value)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm transition-all duration-150 ${
                    style === value
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  {YOGA_STYLE_LABELS[value]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Distance */}
        {showDistance && (
          <div className="space-y-1.5">
            <label htmlFor="activity-distance" className="text-sm font-medium text-foreground">
              Distance (miles)
            </label>
            <input
              id="activity-distance"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              placeholder="3.0"
              value={distanceMiles}
              onChange={(e) => setDistanceMiles(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        )}

        <EffortPicker value={perceivedEffort} onChange={setPerceivedEffort} />

        {/* Notes */}
        <div className="space-y-1.5">
          <label htmlFor="activity-notes" className="text-sm font-medium text-foreground">
            Notes
          </label>
          <textarea
            id="activity-notes"
            rows={2}
            placeholder="How did it feel?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${INPUT_CLASS} resize-none`}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button className="w-full" size="lg" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "SAVE"}
        </Button>
      </CardContent>
    </Card>
  );
}
