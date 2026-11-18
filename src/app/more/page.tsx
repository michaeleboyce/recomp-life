"use client";

import {
  BookOpen,
  Calculator,
  CalendarClock,
  Cloud,
  Compass,
  History,
  Disc,
  Dumbbell,
  FlaskConical,
  PersonStanding,
  Settings,
  Star,
  Trash2,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { Stripes } from "@/components/ui/stripes";
import { MoreGroup, MoreRow } from "@/components/More/MoreGroup";
import { TrainingLocationRow } from "@/components/More/TrainingLocationRow";
import { useHasSyncKey } from "@/components/More/useHasSyncKey";
import { templateTitle } from "@/lib/workoutNames";
import { useDueTemplateId, useFavoriteWorkouts, useSettings } from "@/hooks";
import { plural } from "@/lib/text";
import packageJson from "../../../package.json";

const PHASE_LABEL = { cutting: "Cutting", maintaining: "Maintaining", bulking: "Bulking" } as const;

export default function MorePage() {
  const dueTemplateId = useDueTemplateId();
  const settings = useSettings();
  const favorites = useFavoriteWorkouts();
  const hasSyncKey = useHasSyncKey();
  const phase = settings?.trainingPhase.mode;

  return (
    <PageShell className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageHeader title="More" />
        <Stripes />
      </div>

      <MoreGroup title="Training">
        <MoreRow
          icon={CalendarClock}
          title="Coming up"
          subtitle={dueTemplateId ? `Next: ${templateTitle(dueTemplateId)}` : "The next workouts in your rotation"}
          href="/progress/upcoming"
        />
        <MoreRow
          icon={Star}
          title="Favourites"
          subtitle={
            favorites === undefined
              ? "Saved workouts you can start again"
              : favorites.length === 0
                ? "None saved yet"
                : plural(favorites.length, "saved workout")
          }
          href="/favorites"
        />
        <MoreRow
          icon={Dumbbell}
          title="Exercises"
          subtitle="Browse exercises and set your preferences"
          href="/exercises"
        />
        <MoreRow
          icon={PersonStanding}
          title="Muscles"
          subtitle="Weekly volume, recovery and pain on the body"
          href="/progress?tab=muscles"
        />
      </MoreGroup>

      <MoreGroup title="Tools">
        <MoreRow
          icon={Disc}
          title="Plate calculator"
          subtitle="Which plates to load for a target weight"
          href="/plate-calculator"
        />
        <MoreRow
          icon={Calculator}
          title="1RM calculator"
          subtitle="Estimate your one-rep max from a recent set"
          href="/1rm-calculator"
        />
      </MoreGroup>

      <MoreGroup title="Learn">
        <MoreRow
          icon={BookOpen}
          title="Glossary"
          subtitle="What AMRAP, T1, reps left and the rest mean"
          href="/more/glossary"
        />
        <MoreRow
          icon={FlaskConical}
          title="How the app coaches"
          subtitle="Every coaching rule and the research behind it"
          href="/research"
        />
        <MoreRow
          icon={Compass}
          title="How the app decides"
          subtitle="What it reads, the models it runs, and the evidence behind each"
          href="/more/how-it-works"
        />
        <MoreRow
          icon={History}
          title="Adjustment log"
          subtitle="Every change to your plan, forecasts and rules, with the reason"
          href="/more/adjustments"
        />
      </MoreGroup>

      <MoreGroup title="You">
        <TrainingLocationRow />
        <MoreRow
          icon={Settings}
          title="Settings"
          subtitle={phase ? `${PHASE_LABEL[phase]} · profile, equipment, data` : "Profile, equipment, training phase, data"}
          href="/settings"
        />
        <MoreRow
          icon={Cloud}
          title="Cloud sync"
          subtitle={`${hasSyncKey ? "On" : "Off"}. Jumps to the sync section of Settings`}
          href="/settings#sync"
        />
        <MoreRow
          icon={Trash2}
          title="Recently deleted"
          subtitle="Restore entries deleted in the last 30 days"
          href="/more/deleted"
        />
      </MoreGroup>

      <p className="text-center text-xs text-muted-foreground">Version {packageJson.version}</p>
    </PageShell>
  );
}
