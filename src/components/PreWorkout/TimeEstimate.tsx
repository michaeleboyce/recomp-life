"use client";

interface TimeEstimateProps {
  accessoryCount: number;
}

const BASE_TIME_MINUTES = 40;
const MINUTES_PER_ACCESSORY = 6;

export function TimeEstimate({ accessoryCount }: TimeEstimateProps) {
  const accessoryTime = accessoryCount * MINUTES_PER_ACCESSORY;
  const total = BASE_TIME_MINUTES + accessoryTime;

  return (
    <div className="text-sm text-muted-foreground text-center py-2">
      Est. time: ~{total} min
      {accessoryCount > 0 && (
        <span> ({BASE_TIME_MINUTES} base + {accessoryTime} accessories)</span>
      )}
    </div>
  );
}
