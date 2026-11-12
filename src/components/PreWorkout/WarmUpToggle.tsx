"use client";

import { Switch } from "@/components/ui/switch";

interface WarmUpToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function WarmUpToggle({ enabled, onChange }: WarmUpToggleProps) {
  return (
    <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      Warm-ups
      <Switch checked={enabled} onCheckedChange={onChange} aria-label="Warm-up sets" />
    </label>
  );
}
