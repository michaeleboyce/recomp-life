"use client";

import { Button } from "@/components/ui/button";
import type { WorkoutLocation } from "@/types";

interface LocationToggleProps {
  location: WorkoutLocation;
  onChange: (location: WorkoutLocation) => void;
}

export function LocationToggle({ location, onChange }: LocationToggleProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">
        Location
      </label>
      <div className="flex gap-2">
        <Button
          variant={location === "gym" ? "default" : "outline"}
          className="flex-1"
          onClick={() => onChange("gym")}
        >
          <span className="mr-1" role="img" aria-label="gym">
            {"\uD83C\uDFCB\uFE0F"}
          </span>
          Gym
        </Button>
        <Button
          variant={location === "home" ? "default" : "outline"}
          className="flex-1"
          onClick={() => onChange("home")}
        >
          <span className="mr-1" role="img" aria-label="home">
            {"\uD83C\uDFE0"}
          </span>
          Home
        </Button>
      </div>
    </div>
  );
}
