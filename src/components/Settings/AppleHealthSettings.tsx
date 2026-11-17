"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { HealthImportResult } from "@/lib/data/health";
import {
  getHealthSettings,
  HEALTH_CHANGED_EVENT,
  saveHealthSettings,
  type HealthDeviceSettings,
} from "@/lib/health/deviceSettings";
import { plural } from "@/lib/text";
import { HEALTH_CATEGORIES, type HealthAvailability, type HealthCategory } from "@/lib/health/types";
import {
  connectAppleHealth,
  disconnectAppleHealth,
  getHealthSource,
  importFromAppleHealth,
} from "@/native/appleHealth";

const CATEGORY_TEXT: Record<HealthCategory, { label: string; detail: string }> = {
  bodyweight: { label: "Bodyweight", detail: "Weights from a scale or the Health app become weigh-ins." },
  sleep: {
    label: "Sleep",
    detail: "Last night's sleep fills in the pre-workout check; nightly hours get a trend.",
  },
  workouts: {
    label: "Workouts",
    detail:
      "Runs, rides, hikes, walks and yoga appear in your log. A strength workout on your watch adds heart rate to the lifting session.",
  },
  daily: {
    label: "Activity and heart",
    detail: "Steps, resting heart rate, heart rate variability, energy, VO2 max and body fat, as trends only.",
  },
};


/** "Added 2 weigh-ins and 1 run.", or a plain "nothing new". */
export function describeImport(result: HealthImportResult): string {
  const parts = [
    result.weighIns > 0 && plural(result.weighIns, "weigh-in", "weigh-ins"),
    result.runs > 0 && plural(result.runs, "run", "runs"),
    result.activities > 0 && plural(result.activities, "activity", "activities"),
    result.days > 0 && plural(result.days, "day of health data", "days of health data"),
  ].filter((part): part is string => Boolean(part));
  const extras = [
    result.matched > 0 &&
      `${plural(result.matched, "session", "sessions")} you had logged by hand ${result.matched === 1 ? "was" : "were"} linked, not duplicated`,
    result.sessions > 0 &&
      `heart rate was added to ${plural(result.sessions, "lifting session", "lifting sessions")}`,
  ].filter((part): part is string => Boolean(part));

  const join = (items: string[]) =>
    items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  if (parts.length === 0 && extras.length === 0) return "Nothing new in Apple Health.";
  const added = parts.length > 0 ? `Added ${join(parts)}.` : "";
  const extra = extras.length > 0 ? `${extras.map((e) => e[0].toUpperCase() + e.slice(1)).join(". ")}.` : "";
  return [added, extra].filter(Boolean).join(" ");
}

function formatLastImport(at: number | null): string {
  if (at === null) return "Never";
  return new Date(at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Connect Apple Health, choose what to import, and import on demand. */
export function AppleHealthSettings() {
  const [availability, setAvailability] = useState<HealthAvailability | null>(null);
  const [settings, setSettings] = useState<HealthDeviceSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => setSettings(getHealthSettings());
    refresh();
    getHealthSource()
      .isAvailable()
      .then((result) => {
        if (!cancelled) setAvailability(result);
      })
      .catch(() => {
        if (!cancelled) setAvailability({ available: false, reason: "Apple Health could not be reached." });
      });
    window.addEventListener(HEALTH_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(HEALTH_CHANGED_EVENT, refresh);
    };
  }, []);

  if (!availability || !settings) return <Skeleton className="h-48 w-full" />;

  if (!availability.available) {
    return (
      <Callout variant="info" title="Apple Health needs the iPhone app">
        {availability.reason} Open ReComp Life from its app icon on your iPhone to connect. Anything
        imported there reaches this device through cloud sync.
      </Callout>
    );
  }

  const act = async (work: () => Promise<string | null>) => {
    setBusy(true);
    setFailed(null);
    setMessage(null);
    try {
      setMessage(await work());
    } catch (error) {
      console.error("Apple Health:", error);
      setFailed("Apple Health did not respond. Nothing was changed; try again.");
    } finally {
      setBusy(false);
    }
  };

  const importNow = () =>
    act(async () => {
      const result = await importFromAppleHealth({ force: true });
      return result ? describeImport(result) : "Nothing to import: no category is switched on.";
    });

  const connect = () =>
    act(async () => {
      await connectAppleHealth(settings.categories);
      const result = await importFromAppleHealth({ force: true });
      return result ? describeImport(result) : null;
    });

  const toggle = (category: HealthCategory, on: boolean) => {
    const categories = HEALTH_CATEGORIES.filter((c) =>
      c === category ? on : settings.categories.includes(c)
    );
    if (settings.connected && on) {
      // A newly switched-on category needs its own permission.
      act(async () => {
        await connectAppleHealth(categories);
        return null;
      });
    } else {
      saveHealthSettings({ categories });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What to import
          </h2>
          <ul>
            {HEALTH_CATEGORIES.map((category) => {
              const { label, detail } = CATEGORY_TEXT[category];
              const id = `health-${category}`;
              return (
                <li key={category} className="flex items-start gap-3 border-b border-border py-3 last:border-b-0">
                  <label htmlFor={id} className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{label}</span>
                    <span className="block text-xs text-muted-foreground">{detail}</span>
                  </label>
                  <Switch
                    id={id}
                    checked={settings.categories.includes(category)}
                    disabled={busy}
                    onCheckedChange={(on) => toggle(category, on)}
                  />
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {settings.connected ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Last import</span>
              <span className="text-sm font-medium">{formatLastImport(settings.lastImportAt)}</span>
            </div>
            <Button onClick={importNow} disabled={busy || settings.categories.length === 0}>
              {busy ? "Importing…" : "Import now"}
            </Button>
            <p className="text-xs text-muted-foreground">
              New data is also imported each time you open the app. If something is missing, check
              that ReComp Life is allowed to read it in the Health app under Sharing, Apps. iPhone
              does not tell an app when a permission is switched off; the data is just empty.
            </p>
            <Button variant="ghost" onClick={disconnectAppleHealth} disabled={busy}>
              Stop importing on this iPhone
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              ReComp Life only reads from Apple Health; it never writes to it. Sleep can fill in the
              pre-workout check. Everything else is shown as a trend and never changes your weights
              or suggestions.
            </p>
            <Button onClick={connect} disabled={busy || settings.categories.length === 0}>
              {busy ? "Connecting…" : "Connect Apple Health"}
            </Button>
          </CardContent>
        </Card>
      )}

      {message && (
        <p role="status" className="text-sm text-foreground">
          {message}
        </p>
      )}
      {failed && (
        <Callout variant="danger" title="Import failed">
          {failed}
        </Callout>
      )}
    </div>
  );
}
