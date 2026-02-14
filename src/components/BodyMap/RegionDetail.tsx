"use client";

import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Info } from "lucide-react";
import type { BodyRegion, SensationType, PainSorenessEntry } from "@/types";
import { formatRegion } from "@/lib/painModifications";
import { db } from "@/db/local";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";

interface RegionDetailProps {
  region: BodyRegion | null;
  onClose: () => void;
  onSave: (entry: PainSorenessEntry) => void;
  onRedFlagTriggered: (severity: number, region: BodyRegion) => void;
}

const SEVERITY_LABELS: Record<number, string> = {
  1: "Minimal - barely noticeable",
  2: "Mild - noticeable but manageable",
  3: "Moderate - affects movement",
  4: "Significant - limits activity",
  5: "Severe - unable to train normally",
};

export default function RegionDetail({
  region,
  onClose,
  onSave,
  onRedFlagTriggered,
}: RegionDetailProps) {
  const [sensation, setSensation] = useState<SensationType>("soreness");
  const [severity, setSeverity] = useState<number>(1);
  const [notes, setNotes] = useState("");
  const [showTooltip, setShowTooltip] = useState(false);

  const handleSave = async () => {
    if (!region) return;

    const entry: PainSorenessEntry = {
      id: uuidv4(),
      date: new Date(),
      region,
      sensation,
      severity: severity as 1 | 2 | 3 | 4 | 5,
      notes: notes.trim() || undefined,
    };

    await db.painEntries.put(entry);
    onSave(entry);

    // Check if red flag should be triggered (pain only)
    if (sensation === "pain" && severity >= 4) {
      onRedFlagTriggered(severity, region);
    }

    // Reset form
    setSensation("soreness");
    setSeverity(1);
    setNotes("");
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSensation("soreness");
      setSeverity(1);
      setNotes("");
      onClose();
    }
  };

  return (
    <Sheet open={!!region} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="rounded-t-xl max-h-[80vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{region ? formatRegion(region) : ""}</SheetTitle>
          <SheetDescription>
            Log how this area feels right now.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 space-y-6">
          {/* Sensation Type Selector */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm font-medium text-foreground">
                What are you feeling?
              </label>
              <button
                type="button"
                onClick={() => setShowTooltip(!showTooltip)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Learn the difference between soreness and pain"
              >
                <Info className="h-4 w-4" />
              </button>
            </div>

            {showTooltip && (
              <div className="mb-3 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                <p className="mb-1">
                  <strong className="text-foreground">Soreness</strong> is a
                  dull, achy feeling in muscles that were recently trained.
                  It is normal and expected (DOMS). It does not affect workout
                  recommendations.
                </p>
                <p>
                  <strong className="text-foreground">Pain</strong> is a
                  sharp, stabbing, or persistent feeling in a joint, tendon,
                  or specific spot. It may indicate injury risk. Pain entries
                  will generate workout modifications.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={sensation === "soreness" ? "default" : "outline"}
                onClick={() => setSensation("soreness")}
                className="w-full"
              >
                Soreness
              </Button>
              <Button
                variant={sensation === "pain" ? "destructive" : "outline"}
                onClick={() => setSensation("pain")}
                className="w-full"
              >
                Pain
              </Button>
            </div>
          </div>

          {/* Severity Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground">
                Severity
              </label>
              <span className="text-sm font-mono text-muted-foreground">
                {severity}/5
              </span>
            </div>
            <Slider
              value={[severity]}
              onValueChange={(value) => setSeverity(value[0])}
              min={1}
              max={5}
              step={1}
              className="w-full"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {SEVERITY_LABELS[severity]}
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-foreground block mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Started after heavy squats yesterday..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              rows={3}
            />
          </div>
        </div>

        <SheetFooter>
          <Button onClick={handleSave} className="w-full">
            Save Entry
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
