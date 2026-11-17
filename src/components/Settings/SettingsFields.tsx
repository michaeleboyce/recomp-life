"use client";

// The rows the settings screen is built from: a switch, a text value and a number
// value, each edited in place.
import { useState } from "react";
import { Switch } from "@/components/ui/switch";

export function SettingsToggle({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <span className="text-sm text-foreground">{label}</span>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function ProfileField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleSave = () => {
    if (draft.trim() && draft !== value) {
      onSave(draft.trim());
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          autoFocus
          className="w-32 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground text-right"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="text-sm font-medium text-foreground hover:text-primary transition-colors"
      >
        {value}
      </button>
    </div>
  );
}

/** A number setting; with no value yet it says "Not set" and starts empty when edited. */
export function NumberField({
  label,
  value,
  suffix,
  onSave,
}: {
  label: string;
  value: number | undefined;
  suffix: string;
  onSave: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value == null ? "" : String(value));

  const handleSave = () => {
    const parsed = parseInt(draft, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed !== value) {
      onSave(parsed);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") {
                setDraft(value == null ? "" : String(value));
                setEditing(false);
              }
            }}
            autoFocus
            className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground text-right"
          />
          <span className="text-xs text-muted-foreground">{suffix}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <button
        type="button"
        aria-label={`${label}: ${value == null ? "not set" : `${value} ${suffix}`}`}
        onClick={() => {
          setDraft(value == null ? "" : String(value));
          setEditing(true);
        }}
        className={
          value == null
            ? "text-sm text-muted-foreground hover:text-primary transition-colors"
            : "text-sm font-medium text-foreground hover:text-primary transition-colors font-mono tabular-nums"
        }
      >
        {value == null ? "Not set" : `${value} ${suffix}`}
      </button>
    </div>
  );
}
