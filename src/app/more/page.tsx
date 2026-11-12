"use client";

import {
  BookOpen,
  Calculator,
  CalendarClock,
  Cloud,
  Disc,
  Dumbbell,
  FlaskConical,
  PersonStanding,
  Settings,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { MoreGroup, MoreRow } from "@/components/More/MoreGroup";
import { TrainingLocationRow } from "@/components/More/TrainingLocationRow";
import { useHasSyncKey } from "@/components/More/useHasSyncKey";
import { templateTitle } from "@/components/ActiveWorkout/templateTitle";
import { useNextWorkout, useSettings } from "@/hooks";
import packageJson from "../../../package.json";

const PHASE_LABEL = { cutting: "Cutting", maintaining: "Maintaining", bulking: "Bulking" } as const;

export default function MorePage() {
  const next = useNextWorkout();
  const settings = useSettings();
  const hasSyncKey = useHasSyncKey();
  const phase = settings?.trainingPhase.mode;

  return (
    <PageShell className="flex flex-col gap-6">
      <PageHeader title="More" />

      <MoreGroup title="Training">
        <MoreRow
          icon={CalendarClock}
          title="Upcoming workouts"
          subtitle={next ? `Next: ${templateTitle(next.templateId)}` : "The next workouts in your rotation"}
          href="/progress/upcoming"
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
          href="/muscles"
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
          subtitle="What AMRAP, T1, RPE and the rest mean"
          href="/more/glossary"
        />
        <MoreRow
          icon={FlaskConical}
          title="How the app coaches"
          subtitle="Every coaching rule and the research behind it"
          href="/research"
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
          subtitle={hasSyncKey ? "On this device" : "Off"}
          href="/settings#sync"
        />
      </MoreGroup>

      <p className="text-center text-xs text-muted-foreground">Version {packageJson.version}</p>
    </PageShell>
  );
}
