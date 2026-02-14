"use client";

import { Button } from "@/components/ui/button";

interface RPESelectorProps {
  selectedRPE: number | null;
  onSelectRPE: (rpe: number | null) => void;
}

const RPE_VALUES = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];

function getRPEColor(rpe: number): string {
  if (rpe <= 7) return "text-green-400";
  if (rpe <= 8) return "text-yellow-400";
  if (rpe <= 9) return "text-orange-400";
  return "text-red-400";
}

export function RPESelector({ selectedRPE, onSelectRPE }: RPESelectorProps) {
  return (
    <div className="px-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          RPE (optional):
        </p>
        {selectedRPE !== null && (
          <Button
            variant="ghost"
            size="xs"
            className="text-xs text-muted-foreground"
            onClick={() => onSelectRPE(null)}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {RPE_VALUES.map((rpe) => (
          <Button
            key={rpe}
            variant={selectedRPE === rpe ? "default" : "outline"}
            size="sm"
            className={`min-w-[3rem] text-sm font-semibold ${
              selectedRPE === rpe ? "" : getRPEColor(rpe)
            }`}
            onClick={() => onSelectRPE(selectedRPE === rpe ? null : rpe)}
          >
            {rpe % 1 === 0 ? rpe : rpe.toFixed(1)}
          </Button>
        ))}
      </div>
    </div>
  );
}
