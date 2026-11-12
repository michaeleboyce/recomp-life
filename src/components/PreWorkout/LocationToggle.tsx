"use client";

import { Dumbbell, Home } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { WorkoutLocation } from "@/types";

interface LocationToggleProps {
  location: WorkoutLocation;
  onChange: (location: WorkoutLocation) => void;
  className?: string;
}

export function LocationToggle({ location, onChange, className }: LocationToggleProps) {
  return (
    <SegmentedControl<WorkoutLocation>
      value={location}
      onChange={onChange}
      className={className}
      options={[
        { value: "gym", label: "Gym", icon: <Dumbbell className="size-4" aria-hidden="true" /> },
        { value: "home", label: "Home", icon: <Home className="size-4" aria-hidden="true" /> },
      ]}
    />
  );
}
