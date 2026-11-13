"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EXERCISES } from "@/lib/exercises";
import { formatMuscle } from "@/lib/muscles";
import { PROJECTION_COEFFICIENTS } from "@/lib/projection/coefficients";
import {
  formatAmount,
  liftShortName,
  type ProjectionBaseline,
  type ProjectionScenario,
} from "@/lib/projection";
import type { TrainingPhase } from "@/types";
import { TermIcon } from "@/components/ui/term";
import { ScenarioSlider } from "./ScenarioSlider";

type Phase = TrainingPhase["mode"];

const PHASES: { value: Phase; label: string }[] = [
  { value: "cutting", label: "Cutting" },
  { value: "maintaining", label: "Maintaining" },
  { value: "bulking", label: "Bulking" },
];

const percent = (v: number) => `${Math.round(v)}%`;

/** Where the browser would place the baseline on a slider with this step. */
function snap(value: number, min: number, max: number, step: number): number {
  const snapped = min + Math.round((value - min) / step) * step;
  return Math.min(max, Math.max(min, Number(snapped.toFixed(4))));
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

interface ScenarioControlsProps {
  baseline: ProjectionBaseline;
  scenario: ProjectionScenario;
  onChange: (scenario: ProjectionScenario) => void;
  onReset: () => void;
}

/** "Try an alternative": one control per scenario field, each against "now". */
export function ScenarioControls({ baseline, scenario, onChange, onReset }: ScenarioControlsProps) {
  const lift = liftShortName(baseline.exerciseId);
  const primary = (EXERCISES[baseline.exerciseId]?.primaryMuscles ?? []).map((m) =>
    formatMuscle(m).toLowerCase()
  );
  const setsMax = (base: number) => Math.max(20, Math.ceil(base * 2));

  /**
   * Sets one field. Moving a slider back onto the baseline's position removes the
   * field, so the scenario is empty again rather than off by a rounding step.
   */
  function update<K extends keyof ProjectionScenario>(
    key: K,
    value: ProjectionScenario[K],
    baselinePosition: ProjectionScenario[K]
  ) {
    const next = { ...scenario };
    if (value === baselinePosition || value === baseline[key]) delete next[key];
    else next[key] = value;
    onChange(next);
  }

  const changed = Object.keys(scenario).length > 0;
  const directMax = setsMax(baseline.directWeeklySets);
  const relatedMax = setsMax(baseline.relatedWeeklySets);

  return (
    <section aria-labelledby="try-alternative" className="flex flex-col gap-3 rounded-2xl bg-card p-4">
      <SectionHeader
        title={<span id="try-alternative">Try an alternative</span>}
        action={
          <Button variant="ghost" size="sm" onClick={onReset} disabled={!changed} className="min-h-11">
            <RotateCcw aria-hidden="true" />
            Reset
          </Button>
        }
      />
      <ScenarioSlider
        label={`${lift[0].toUpperCase()}${lift.slice(1)} sessions a week`}
        value={scenario.sessionsPerWeek ?? baseline.sessionsPerWeek}
        baseline={baseline.sessionsPerWeek}
        // Down to 0: with no sets of the lift either, the model has nothing to scale
        // (flatReason "no-dose") and the summary says so.
        min={0}
        max={3}
        step={0.5}
        format={formatAmount}
        onChange={(v) => update("sessionsPerWeek", v, snap(baseline.sessionsPerWeek, 0, 3, 0.5))}
      />
      <ScenarioSlider
        label={`Sets of ${lift} a week`}
        term="weekly-sets"
        value={scenario.directWeeklySets ?? baseline.directWeeklySets}
        baseline={baseline.directWeeklySets}
        min={0}
        max={directMax}
        step={1}
        format={formatAmount}
        onChange={(v) => update("directWeeklySets", v, snap(baseline.directWeeklySets, 0, directMax, 1))}
      />
      <ScenarioSlider
        label="Other work for the same muscles, sets a week"
        value={scenario.relatedWeeklySets ?? baseline.relatedWeeklySets}
        baseline={baseline.relatedWeeklySets}
        min={0}
        max={relatedMax}
        step={1}
        format={formatAmount}
        onChange={(v) =>
          update("relatedWeeklySets", v, snap(baseline.relatedWeeklySets, 0, relatedMax, 1))
        }
        helper={
          primary.length > 0
            ? `Sets from other exercises that train your ${joinList(primary)}. Each counts as ${PROJECTION_COEFFICIENTS.relatedSetTransfer} of a ${lift} set.`
            : undefined
        }
      />
      <ScenarioSlider
        label="Sessions passed"
        // No glossary entry for "passed" yet; fail-and-reset says what a pass is.
        term="fail-reset"
        value={(scenario.passRate ?? baseline.passRate) * 100}
        baseline={baseline.passRate * 100}
        min={50}
        max={100}
        step={1}
        format={percent}
        onChange={(v) =>
          update("passRate", v / 100, snap(baseline.passRate * 100, 50, 100, 1) / 100)
        }
      />
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-1 text-sm text-foreground">
          <span id="phase-label">
            Training phase <span className="text-muted-foreground">now {baseline.phase}</span>
          </span>
          <TermIcon id="training-phase" />
        </span>
        <div role="group" aria-labelledby="phase-label">
          <SegmentedControl
            value={scenario.phase ?? baseline.phase}
            onChange={(phase) => update("phase", phase, baseline.phase)}
            options={PHASES}
            className="min-h-11"
          />
        </div>
      </div>
    </section>
  );
}
