"use client";

import { Dumbbell, Home, MapPin } from "lucide-react";
import { LocationChip } from "@/components/ui/location-chip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useTrainingLocation } from "@/hooks";
import type { WorkoutLocation } from "@/types";
import { IconTile } from "./MoreGroup";

const OPTIONS = [
  { value: "gym" as const, label: "Gym", icon: <Dumbbell className="size-4" aria-hidden="true" /> },
  { value: "home" as const, label: "Home", icon: <Home className="size-4" aria-hidden="true" /> },
];

/** Shows and switches the default training location in place. */
export function TrainingLocationRow() {
  const { location, setLocation } = useTrainingLocation();
  const handleChange = (next: WorkoutLocation) => {
    setLocation(next).catch((err) => console.error("Failed to save training location:", err));
  };

  return (
    <div
      data-testid="training-location"
      className="flex flex-col gap-3 border-b border-border px-4 py-3 last:border-b-0"
    >
      <div className="flex items-center gap-3">
        <IconTile icon={MapPin} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-semibold text-foreground">Training location</span>
          <span className="text-[13px] text-muted-foreground">
            Sets the equipment, exercise substitutions and preferences the app uses by default
          </span>
        </span>
        <LocationChip location={location} />
      </div>
      <SegmentedControl<WorkoutLocation>
        value={location}
        onChange={handleChange}
        options={OPTIONS}
      />
    </div>
  );
}
