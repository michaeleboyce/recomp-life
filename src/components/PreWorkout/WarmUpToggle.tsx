"use client";

import { Switch } from "@/components/ui/switch";

interface WarmUpToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function WarmUpToggle({ enabled, onChange }: WarmUpToggleProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">
        Warm-up sets?
      </label>
      <div className="flex items-center gap-3">
        <Switch checked={enabled} onCheckedChange={onChange} />
        <span className="text-sm">{enabled ? "ON" : "OFF"}</span>
      </div>
    </div>
  );
}
