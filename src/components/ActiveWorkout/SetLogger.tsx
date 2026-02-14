"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface SetLoggerProps {
  targetReps: number;
  onSelectReps: (reps: number) => void;
  selectedReps: number | null;
}

export function SetLogger({
  targetReps,
  onSelectReps,
  selectedReps,
}: SetLoggerProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customReps, setCustomReps] = useState("");

  const handleCustomSubmit = () => {
    const val = parseInt(customReps, 10);
    if (!isNaN(val) && val > 0) {
      onSelectReps(val);
      setShowCustomInput(false);
      setCustomReps("");
    }
  };

  return (
    <div className="px-4 space-y-3">
      <p className="text-sm font-medium text-muted-foreground">
        How many reps?
      </p>

      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((rep) => (
          <Button
            key={rep}
            variant={
              selectedReps === rep
                ? "default"
                : rep === targetReps
                  ? "outline"
                  : "ghost"
            }
            className={`h-12 text-lg font-bold ${
              rep === targetReps && selectedReps !== rep
                ? "border-2 border-primary"
                : ""
            }`}
            onClick={() => onSelectReps(rep)}
          >
            {rep}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-2">
        {[6, 7, 8, 9].map((rep) => (
          <Button
            key={rep}
            variant={
              selectedReps === rep
                ? "default"
                : rep === targetReps
                  ? "outline"
                  : "ghost"
            }
            className={`h-12 text-lg font-bold ${
              rep === targetReps && selectedReps !== rep
                ? "border-2 border-primary"
                : ""
            }`}
            onClick={() => onSelectReps(rep)}
          >
            {rep}
          </Button>
        ))}
        <Button
          variant={
            selectedReps !== null && selectedReps >= 10 ? "default" : "ghost"
          }
          className="h-12 text-sm font-bold"
          onClick={() => setShowCustomInput(true)}
        >
          10+
        </Button>
      </div>

      {showCustomInput && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="10"
            value={customReps}
            onChange={(e) => setCustomReps(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCustomSubmit();
            }}
            placeholder="Enter reps..."
            className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm"
            autoFocus
          />
          <Button size="sm" onClick={handleCustomSubmit}>
            OK
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setShowCustomInput(false);
              setCustomReps("");
            }}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
