"use client";

import { ChipGroup } from "@/components/ui/chip-group";
import { WORKOUT_ROTATION } from "@/lib/workoutTemplates";

/**
 * Pick which day to do. The day the rotation says is next is marked "due"; doing
 * another day neither moves nor skips the rotation.
 */
export function DaySelector({
  value,
  dueTemplateId,
  onChange,
}: {
  value: string;
  dueTemplateId: string | undefined;
  onChange: (templateId: string) => void;
}) {
  const options = WORKOUT_ROTATION.map((id) => ({
    value: id,
    label: id === dueTemplateId ? `${id} · due` : id,
  }));
  return (
    <div className="flex flex-col gap-1.5">
      <ChipGroup options={options} value={value} onChange={onChange} ariaLabel="Workout day" />
      {dueTemplateId && value !== dueTemplateId && (
        <p className="text-xs text-muted-foreground">
          {value}&rsquo;s lifts will progress if done as prescribed. {dueTemplateId} stays next.
        </p>
      )}
    </div>
  );
}
