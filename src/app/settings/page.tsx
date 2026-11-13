"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Calculator } from "lucide-react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import type { UserProfile, UserSettings, TrainingPhase, EquipmentProfile, ExercisePreferences } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import EquipmentProfileEditor from "@/components/Equipment/EquipmentProfileEditor";
import ExercisePreferencesEditor from "@/components/Settings/ExercisePreferencesEditor";
import AnatomySettings from "@/components/Settings/AnatomySettings";
import { SkeletonCard } from "@/components/ui/skeleton";
import { LocationChip } from "@/components/ui/location-chip";
import { TrainingLocationRow } from "@/components/More/TrainingLocationRow";
import { getSyncKey, setSyncKey } from "@/lib/syncKey";

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
        synced: false,
      });
    },
    [profile]
  );

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!profile) return;
      await db.userProfile.update(profile.id, { ...updates, synced: false });
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

  const handleExercisePreferencesChange = useCallback(
    async (exercisePreferences: ExercisePreferences) => {
      await updateSettings({ exercisePreferences });
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

  const handleExportData = useCallback(async () => {
    try {
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        workouts: await db.workouts.toArray(),
        sets: await db.sets.toArray(),
        runs: await db.runs.toArray(),
        activities: await db.activities.toArray(),
        bodyweight: await db.bodyweight.toArray(),
        painEntries: await db.painEntries.toArray(),
        estimated1RMs: await db.estimated1RMs.toArray(),
        liftStates: await db.liftStates.toArray(),
        userProfile: await db.userProfile.toArray(),
        readinessLogs: await db.readinessLogs.toArray(),
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recomp-life-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    }
  }, []);

  const handleImportData = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.version || !data.workouts || !data.userProfile) {
          alert("Invalid backup file format.");
          return;
        }

        if (!confirm("This will replace ALL existing data. Are you sure?")) {
          return;
        }

        await db.transaction("rw",
          [db.workouts, db.sets, db.runs, db.activities, db.bodyweight,
          db.painEntries, db.estimated1RMs, db.liftStates,
          db.userProfile, db.readinessLogs],
          async () => {
            await db.workouts.clear();
            await db.sets.clear();
            await db.runs.clear();
            await db.activities.clear();
            await db.bodyweight.clear();
            await db.painEntries.clear();
            await db.estimated1RMs.clear();
            await db.liftStates.clear();
            await db.userProfile.clear();
            await db.readinessLogs.clear();

            if (data.workouts?.length) await db.workouts.bulkAdd(data.workouts);
            if (data.sets?.length) await db.sets.bulkAdd(data.sets);
            if (data.runs?.length) await db.runs.bulkAdd(data.runs);
            if (data.activities?.length) await db.activities.bulkAdd(data.activities);
            if (data.bodyweight?.length) await db.bodyweight.bulkAdd(data.bodyweight);
            if (data.painEntries?.length) await db.painEntries.bulkAdd(data.painEntries);
            if (data.estimated1RMs?.length) await db.estimated1RMs.bulkAdd(data.estimated1RMs);
            if (data.liftStates?.length) await db.liftStates.bulkAdd(data.liftStates);
            if (data.userProfile?.length) await db.userProfile.bulkAdd(data.userProfile);
            if (data.readinessLogs?.length) await db.readinessLogs.bulkAdd(data.readinessLogs);
          }
        );

        window.location.reload();
      } catch (err) {
        console.error("Import failed:", err);
        alert("Import failed. Please check the file format.");
      }
    };
    input.click();
  }, []);

  if (!dbReady || !profile) {
    return (
      <div className="mx-auto max-w-lg px-5 pt-5 pb-28 space-y-4">
        <div className="h-5 w-20 rounded bg-muted animate-pulse mb-6" />
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  const { settings } = profile;

  return (
    <div className="mx-auto max-w-lg px-5 pt-5 pb-28">
      {/* Header */}
      <header className="flex items-center gap-3 mb-6">
        <Link
          href="/more"
          aria-label="Back"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Settings</h1>
      </header>

      <div className="space-y-4">
        {/* Training location: the same default Today, Configure and More use. */}
        <section aria-label="Training location" className="overflow-hidden rounded-2xl bg-card">
          <TrainingLocationRow />
        </section>
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
          <CardContent className="space-y-6">
            <div data-testid="equipment-intro" className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Equipment
              </h2>
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
                <LocationChip
                  location="home"
                  detail={`dumbbells up to ${settings.equipment.maxDumbbellWeight} lbs`}
                />
                <span>What you have at home decides the home substitutes.</span>
              </p>
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
                <LocationChip location="gym" />
                <span>
                  The gym is assumed to have a full barbell setup; only its bar and smallest
                  plate are set here.
                </span>
              </p>
            </div>
            <EquipmentProfileEditor
              equipment={settings.equipment}
              onChange={handleEquipmentChange}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end -mt-2">
          <Link href="/plate-calculator">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
              <Calculator className="h-3.5 w-3.5 mr-1" />
              Plate Calculator
            </Button>
          </Link>
        </div>

        {/* Exercise Preferences Section */}
        <Card>
          <CardContent>
            <ExercisePreferencesEditor
              preferences={settings.exercisePreferences ?? {}}
              onChange={handleExercisePreferencesChange}
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

        {/* Cloud Sync Section */}
        <SyncKeyCard />

        {/* Data Section */}
        <Card>
          <CardContent>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Data
            </h2>
            <div className="space-y-2">
              <Button variant="outline" className="w-full" onClick={handleExportData}>
                Export Data (JSON)
              </Button>
              <Button variant="outline" className="w-full" onClick={handleImportData}>
                Import Data
              </Button>
              <p className="text-xs text-muted-foreground text-center pt-1">
                Export creates a full backup. Import replaces all data.
              </p>
            </div>
          </CardContent>
        </Card>

        <AnatomySettings />

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
        className="text-sm font-medium text-foreground hover:text-primary transition-colors font-mono tabular-nums"
      >
        {value} {suffix}
      </button>
    </div>
  );
}

function SyncKeyCard() {
  const [draft, setDraft] = useState("");
  // Only rendered after the local database is ready (client-side), so reading
  // localStorage during the first render cannot cause a hydration mismatch.
  const [hasKey, setHasKey] = useState(() => getSyncKey() !== null);
  const [saved, setSaved] = useState(false);

  // The card mounts after the database is ready, too late for the browser's own
  // jump to #sync, so scroll to it here.
  useEffect(() => {
    if (window.location.hash === "#sync") {
      document.getElementById("sync")?.scrollIntoView?.({ block: "start" });
    }
  }, []);

  const save = (value: string) => {
    setSyncKey(value);
    setHasKey(getSyncKey() !== null);
    setDraft("");
    setSaved(true);
    window.dispatchEvent(new Event("recomp-sync-key-changed"));
  };

  return (
    // Linked from More as /settings#sync.
    <Card id="sync" className="scroll-mt-4">
      <CardContent>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Cloud Sync
        </h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <span className="text-sm font-medium">
              {hasKey ? "Passphrase saved" : "Off (local only)"}
            </span>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) save(draft);
            }}
          >
            <input
              type="password"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setSaved(false);
              }}
              placeholder={hasKey ? "Replace passphrase" : "Sync passphrase"}
              autoComplete="off"
              aria-label="Sync passphrase"
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
            <Button type="submit" variant="outline" disabled={!draft.trim()}>
              Save
            </Button>
          </form>
          {hasKey && (
            <Button variant="ghost" className="w-full" onClick={() => save("")}>
              Remove passphrase from this device
            </Button>
          )}
          <p className="text-xs text-muted-foreground pt-1">
            {saved && hasKey
              ? "Saved. Syncing now."
              : "Must match the SYNC_SECRET set on the server. Stored on this device only."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
