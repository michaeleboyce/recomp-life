"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import type { UserProfile, UserSettings, TrainingPhase, EquipmentProfile } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import EquipmentProfileEditor from "@/components/Equipment/EquipmentProfileEditor";

function formatHeight(totalInches: number): string {
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

const PHASE_MESSAGES: Record<string, string> = {
  "cutting": "Cutting mode active. Auto-regulation will be more aggressive, rest timers extended, accessory caps tightened.",
  "maintaining": "Switching to Maintenance. Recovery thresholds relaxed, you can add more accessories.",
  "bulking": "Bulking mode. More volume permitted, deload triggers less sensitive.",
};

export default function SettingsPage() {
  const [dbReady, setDbReady] = useState(false);
  const [phaseAlert, setPhaseAlert] = useState<string | null>(null);

  useEffect(() => {
    initializeDatabase().then(() => setDbReady(true));
  }, []);

  const profile = useLiveQuery(
    () => db.userProfile.toCollection().first(),
    [],
    undefined
  );

  const updateSettings = useCallback(
    async (updates: Partial<UserSettings>) => {
      if (!profile) return;
      await db.userProfile.update(profile.id, {
        settings: { ...profile.settings, ...updates },
      });
    },
    [profile]
  );

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!profile) return;
      await db.userProfile.update(profile.id, updates);
    },
    [profile]
  );

  const handlePhaseChange = useCallback(
    async (mode: TrainingPhase["mode"]) => {
      if (!profile || profile.settings.trainingPhase.mode === mode) return;
      const newPhase: TrainingPhase = {
        mode,
        ...(mode === "cutting"
          ? {
              dailyDeficit: profile.settings.trainingPhase.dailyDeficit ?? 750,
              proteinGramsPerDay:
                profile.settings.trainingPhase.proteinGramsPerDay ?? 160,
            }
          : {}),
      };
      await updateSettings({ trainingPhase: newPhase });
      setPhaseAlert(PHASE_MESSAGES[mode]);
      setTimeout(() => setPhaseAlert(null), 5000);
    },
    [profile, updateSettings]
  );

  const handleEquipmentChange = useCallback(
    async (equipment: EquipmentProfile) => {
      await updateSettings({ equipment });
    },
    [updateSettings]
  );

  const handleThemeToggle = useCallback(
    async (isDark: boolean) => {
      const theme = isDark ? "dark" : "light";
      document.documentElement.classList.toggle("dark", isDark);
      document.documentElement.classList.toggle("light", !isDark);
      await updateSettings({ theme });
    },
    [updateSettings]
  );

  if (!dbReady || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  const { settings } = profile;

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      {/* Header */}
      <header className="flex items-center gap-3 mb-6">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Settings</h1>
      </header>

      <div className="space-y-4">
        {/* Profile Section */}
        <Card>
          <CardContent>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Profile
            </h2>
            <div className="space-y-3">
              <ProfileField
                label="Name"
                value={profile.name}
                onSave={(value) => updateProfile({ name: value })}
              />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Height</span>
                <span className="text-sm font-medium text-foreground">
                  {formatHeight(profile.heightInches)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Training Phase Section */}
        <Card>
          <CardContent>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Training Phase
            </h2>

            {phaseAlert && (
              <Alert className="mb-3">
                <AlertDescription>{phaseAlert}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              {(["cutting", "maintaining", "bulking"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handlePhaseChange(mode)}
                  className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors ${
                    settings.trainingPhase.mode === mode
                      ? "border-primary bg-primary/10 font-medium text-foreground"
                      : "border-input bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      settings.trainingPhase.mode === mode
                        ? "border-primary"
                        : "border-muted-foreground"
                    }`}
                  >
                    {settings.trainingPhase.mode === mode && (
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </span>
                  <span className="capitalize">{mode}</span>
                </button>
              ))}
            </div>

            {/* Cutting-specific fields */}
            {settings.trainingPhase.mode === "cutting" && (
              <div className="mt-4 space-y-3">
                <NumberField
                  label="Daily deficit"
                  value={settings.trainingPhase.dailyDeficit ?? 750}
                  suffix="cal"
                  onSave={(value) =>
                    updateSettings({
                      trainingPhase: {
                        ...settings.trainingPhase,
                        dailyDeficit: value,
                      },
                    })
                  }
                />
                <NumberField
                  label="Protein target"
                  value={settings.trainingPhase.proteinGramsPerDay ?? 160}
                  suffix="g/day"
                  onSave={(value) =>
                    updateSettings({
                      trainingPhase: {
                        ...settings.trainingPhase,
                        proteinGramsPerDay: value,
                      },
                    })
                  }
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Equipment Section */}
        <Card>
          <CardContent>
            <EquipmentProfileEditor
              equipment={settings.equipment}
              onChange={handleEquipmentChange}
            />
          </CardContent>
        </Card>

        {/* App Preferences Section */}
        <Card>
          <CardContent>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              App Preferences
            </h2>
            <div className="space-y-4">
              <SettingsToggle
                label="Theme"
                description={settings.theme === "dark" ? "Dark" : "Light"}
                checked={settings.theme === "dark"}
                onCheckedChange={handleThemeToggle}
              />
              <Separator />
              <SettingsToggle
                label="Timer audio"
                checked={settings.restTimerAudio}
                onCheckedChange={(checked) =>
                  updateSettings({ restTimerAudio: checked })
                }
              />
              <SettingsToggle
                label="Timer vibration"
                checked={settings.restTimerVibration}
                onCheckedChange={(checked) =>
                  updateSettings({ restTimerVibration: checked })
                }
              />
              <Separator />
              <SettingsToggle
                label="Show warm-ups"
                checked={settings.showWarmUps}
                onCheckedChange={(checked) =>
                  updateSettings({ showWarmUps: checked })
                }
              />
              <SettingsToggle
                label="Show RPE"
                checked={settings.showRPE}
                onCheckedChange={(checked) =>
                  updateSettings({ showRPE: checked })
                }
              />
              <Separator />
              <SettingsToggle
                label="Weigh-in reminder"
                checked={settings.morningWeighInReminder}
                onCheckedChange={(checked) =>
                  updateSettings({ morningWeighInReminder: checked })
                }
              />
              {settings.morningWeighInReminder && (
                <div className="flex items-center justify-between pl-1">
                  <span className="text-sm text-muted-foreground">
                    Reminder time
                  </span>
                  <input
                    type="time"
                    value={settings.weighInReminderTime}
                    onChange={(e) =>
                      updateSettings({ weighInReminderTime: e.target.value })
                    }
                    className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Data Section */}
        <Card>
          <CardContent>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Data
            </h2>
            <div className="space-y-2">
              <Button variant="outline" className="w-full" disabled>
                Export Data (JSON)
              </Button>
              <Button variant="outline" className="w-full" disabled>
                Import Data
              </Button>
              <p className="text-xs text-muted-foreground text-center pt-1">
                Coming in a future update
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Version Footer */}
        <div className="text-center text-xs text-muted-foreground py-4">
          Version 0.1.0
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function SettingsToggle({
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

function ProfileField({
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

function NumberField({
  label,
  value,
  suffix,
  onSave,
}: {
  label: string;
  value: number;
  suffix: string;
  onSave: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

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
                setDraft(String(value));
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
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
        className="text-sm font-medium text-foreground hover:text-primary transition-colors"
      >
        {value} {suffix}
      </button>
    </div>
  );
}
