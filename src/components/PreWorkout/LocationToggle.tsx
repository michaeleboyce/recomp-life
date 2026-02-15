"use client";

import { Button } from "@/components/ui/button";
import { Dumbbell, Home } from "lucide-react";
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
          <Dumbbell className="h-4 w-4 mr-1" />
          Gym
        </Button>
        <Button
          variant={location === "home" ? "default" : "outline"}
          className="flex-1"
          onClick={() => onChange("home")}
        >
          <Home className="h-4 w-4 mr-1" />
          Home
        </Button>
      </div>
    </div>
  );
}
