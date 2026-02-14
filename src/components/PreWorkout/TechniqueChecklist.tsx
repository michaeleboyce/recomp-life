"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface TechniqueChecklistProps {
  exerciseType: "squat" | "deadlift";
  onNext: () => void;
  onSkip: () => void;
}

const SQUAT_CUES = [
  { id: "pain", label: "Any pain right now?" },
  { id: "brace", label: "Brace cue: big belly breath, tight core" },
  { id: "rom", label: "ROM feels normal today" },
];

const DEADLIFT_CUES = [
  { id: "pain", label: "Any pain right now?" },
  { id: "hinge", label: "Hip hinge cue: push hips back, chest up" },
  { id: "rom", label: "ROM feels normal today" },
];

export function TechniqueChecklist({
  exerciseType,
  onNext,
  onSkip,
}: TechniqueChecklistProps) {
  const cues = exerciseType === "squat" ? SQUAT_CUES : DEADLIFT_CUES;
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggleCheck = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const title =
    exerciseType === "squat" ? "Squat Day Prep" : "Deadlift Day Prep";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">
          {"\uD83C\uDFCB\uFE0F"} {title}
        </h2>
        <p className="text-sm text-muted-foreground">Quick check:</p>
      </div>

      <div className="space-y-3">
        {cues.map((cue) => (
          <label
            key={cue.id}
            className="flex items-start gap-3 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={checked[cue.id] || false}
              onChange={() => toggleCheck(cue.id)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-sm">{cue.label}</span>
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={onNext}>
          Got it {"\u2192"} Next
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}
