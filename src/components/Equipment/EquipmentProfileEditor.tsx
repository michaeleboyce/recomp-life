"use client";

import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";
import type { EquipmentProfile } from "@/types";

interface EquipmentProfileEditorProps {
  equipment: EquipmentProfile;
  onChange: (updated: EquipmentProfile) => void;
}

export default function EquipmentProfileEditor({
  equipment,
  onChange,
}: EquipmentProfileEditorProps) {
  const update = (partial: Partial<EquipmentProfile>) => {
    onChange({ ...equipment, ...partial });
  };

  return (
    <div className="space-y-6">
      {/* Home Gym Section */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Equipment -- Home Gym
        </h3>

        {/* Max Dumbbell Weight Stepper */}
        <div className="space-y-2">
          <label className="text-sm text-foreground">Max dumbbell weight</label>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                update({
                  maxDumbbellWeight: Math.max(5, equipment.maxDumbbellWeight - 5),
                })
              }
              disabled={equipment.maxDumbbellWeight <= 5}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-lg font-bold tabular-nums min-w-[4rem] text-center">
              {equipment.maxDumbbellWeight} lbs
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                update({
                  maxDumbbellWeight: Math.min(150, equipment.maxDumbbellWeight + 5),
                })
              }
              disabled={equipment.maxDumbbellWeight >= 150}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Adjusts in 5 lb steps</p>
        </div>

        {/* Home Equipment Checkboxes */}
        <div className="mt-4 space-y-3">
          <label className="text-sm text-foreground">Equipment</label>
          <CheckboxRow
            label="Flat/incline bench"
            checked={equipment.hasBench}
            onChange={(checked) => update({ hasBench: checked })}
          />
          <CheckboxRow
            label="Resistance bands"
            checked={equipment.hasResistanceBands}
            onChange={(checked) => update({ hasResistanceBands: checked })}
          />
          <CheckboxRow
            label="Pull-up bar"
            checked={equipment.hasPullUpBar}
            onChange={(checked) => update({ hasPullUpBar: checked })}
          />
        </div>
      </div>

      {/* Gym Section */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Equipment -- Gym
        </h3>

        {/* Smallest Plate */}
        <div className="space-y-2">
          <label className="text-sm text-foreground">
            Smallest plate available
          </label>
          <div className="flex gap-2">
            <RadioOption
              label="5 lbs (standard)"
              selected={equipment.gymBarbellIncrementLbs === 10}
              onSelect={() => {
                update({
                  gymBarbellIncrementLbs: 10,
                  availablePlates: equipment.availablePlates.filter((p) => p !== 2.5),
                });
              }}
            />
            <RadioOption
              label="2.5 lbs (microplates)"
              selected={equipment.gymBarbellIncrementLbs === 5}
              onSelect={() => {
                const plates = equipment.availablePlates.includes(2.5)
                  ? equipment.availablePlates
                  : [...equipment.availablePlates, 2.5].sort((a, b) => b - a);
                update({
                  gymBarbellIncrementLbs: 5,
                  availablePlates: plates,
                });
              }}
            />
          </div>
        </div>

        {/* Barbell Weight */}
        <div className="mt-4 space-y-2">
          <label className="text-sm text-foreground">Barbell weight</label>
          <div className="flex gap-2">
            <RadioOption
              label="45 lbs"
              selected={equipment.barWeight === 45}
              onSelect={() => update({ barWeight: 45 })}
            />
            <RadioOption
              label="35 lbs"
              selected={equipment.barWeight === 35}
              onSelect={() => update({ barWeight: 35 })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div
        role="checkbox"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
          checked
            ? "bg-primary border-primary text-primary-foreground"
            : "border-input bg-background"
        }`}
      >
        {checked && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 6l3 3 5-5" />
          </svg>
        )}
      </div>
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

function RadioOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
        selected
          ? "border-primary bg-primary/10 text-foreground font-medium"
          : "border-input bg-background text-muted-foreground hover:bg-accent"
      }`}
    >
      <span className="flex items-center gap-2">
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
            selected ? "border-primary" : "border-muted-foreground"
          }`}
        >
          {selected && (
            <span className="h-2 w-2 rounded-full bg-primary" />
          )}
        </span>
        {label}
      </span>
    </button>
  );
}
