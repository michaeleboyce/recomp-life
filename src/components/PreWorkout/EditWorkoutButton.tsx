"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditWorkoutSheet } from "./EditWorkoutSheet";
import type { WorkoutSetup } from "./useWorkoutSetup";

/** Opens the edit sheet; shows how many changes are in effect. */
export function EditWorkoutButton({ setup }: { setup: WorkoutSetup }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="min-h-11 w-full" onClick={() => setOpen(true)}>
        <Pencil aria-hidden="true" />
        Edit workout
        {setup.edits.length > 0 && (
          <Badge variant="outline" aria-label={`${setup.edits.length} changes`}>
            {setup.edits.length}
          </Badge>
        )}
      </Button>
      <EditWorkoutSheet setup={setup} open={open} onOpenChange={setOpen} />
    </>
  );
}
