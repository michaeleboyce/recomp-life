"use client";

import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { useLiftStates } from "@/hooks";
import type { LogChange } from "@/lib/rebuild";
import type { LiftAdjustment, LiftState, T1Stage, T2Stage } from "@/types";
import { EditSheetFrame } from "./EditSheetFrame";
import { FieldError, FieldLabel, StepperField } from "./fields";
import { liftName } from "./format";
import { WEIGHT_MAX } from "./setChanges";
import { useCommitLogChange } from "./useCommitLogChange";

type AdjustTier = "T1" | "T2" | "T3";
const T1_STAGES: T1Stage[] = ["5x3", "6x2", "10x1"];
const T2_STAGES: T2Stage[] = ["3x10", "3x8", "3x6"];
const TIERS = [
  { value: "T1", label: "T1" },
  { value: "T2", label: "T2" },
  { value: "T3", label: "T3" },
];

/** The `adjustLift` change for a manual weight (and stage) change from `at` on. */
export function buildManualAdjustment(
  exerciseId: string,
  tier: AdjustTier,
  weight: number,
  stage: T1Stage | T2Stage | null,
  at: Date = new Date(),
  newId: () => string = uuidv4
): LogChange {
  const set: LiftAdjustment["set"] =
    tier === "T1"
      ? { t1Weight: weight, ...(stage ? { t1Stage: stage as T1Stage } : {}) }
      : tier === "T2"
        ? { t2Weight: weight, ...(stage ? { t2Stage: stage as T2Stage } : {}) }
        : { t3Weight: weight };
  const id = newId();
  return {
    kind: "adjustLift",
    adjustment: { id, clientId: id, exerciseId, at, source: "manual", set, synced: false },
  };
}

function current(state: LiftState | undefined, tier: AdjustTier) {
  if (!state) return { weight: 0, stage: tier === "T1" ? "5x3" : tier === "T2" ? "3x10" : null };
  if (tier === "T1") return { weight: state.t1Weight, stage: state.t1Stage };
  if (tier === "T2") return { weight: state.t2Weight, stage: state.t2Stage };
  return { weight: state.t3Weight, stage: null };
}

function AdjustForm({
  exerciseId,
  open,
  onOpenChange,
  submit,
}: {
  exerciseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submit: ReturnType<typeof useCommitLogChange>["submit"];
}) {
  const state = useLiftStates()?.find((s) => s.exerciseId === exerciseId);
  const [tier, setTier] = useState<AdjustTier>("T1");
  const now = current(state, tier);
  const [weight, setWeight] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const weightText = weight ?? String(now.weight);
  const stageValue = stage ?? now.stage;
  const name = liftName(exerciseId);

  async function save() {
    const w = Number(weightText);
    if (weightText.trim() === "" || !Number.isFinite(w) || w < 0 || w > WEIGHT_MAX) {
      setInvalid(`Enter a weight from 0 to ${WEIGHT_MAX} lbs.`);
      return;
    }
    setInvalid(null);
    const stageChanged = stageValue !== now.stage ? (stageValue as T1Stage | T2Stage) : null;
    if (w === now.weight && !stageChanged) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      const change = buildManualAdjustment(exerciseId, tier, w, tier === "T3" ? null : stageChanged);
      const result = await submit(change, { message: `${name} ${tier} weight saved` });
      if (result !== "error") onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  // Until the lift's current weight has loaded there is nothing sensible to step from.
  if (!state) {
    return (
      <EditSheetFrame
        open={open}
        onOpenChange={onOpenChange}
        title={`Adjust ${name}`}
        description="Saved as a dated change from today on. Past sessions are not altered."
        onSave={() => undefined}
        busy
      >
        <p className="text-sm text-muted-foreground">Loading the current weight.</p>
      </EditSheetFrame>
    );
  }

  return (
    <EditSheetFrame
      open={open}
      onOpenChange={onOpenChange}
      title={`Adjust ${name}`}
      description="Saved as a dated change from today on. Past sessions are not altered."
      onSave={() => void save()}
      busy={busy}
    >
      <FieldLabel>Tier</FieldLabel>
      <ChipGroup
        ariaLabel="Tier"
        options={TIERS}
        value={tier}
        onChange={(v) => {
          setTier(v as AdjustTier);
          setWeight(null);
          setStage(null);
        }}
      />
      <StepperField label="Weight" unit="lbs" value={weightText} onChange={setWeight} step={5} max={WEIGHT_MAX} />
      {tier !== "T3" && (
        <>
          <FieldLabel>Stage</FieldLabel>
          <ChipGroup
            ariaLabel="Stage"
            options={(tier === "T1" ? T1_STAGES : T2_STAGES).map((s) => ({ value: s, label: s }))}
            value={stageValue ?? ""}
            onChange={setStage}
          />
        </>
      )}
      <FieldError>{invalid}</FieldError>
    </EditSheetFrame>
  );
}

/**
 * Set a lift's T1, T2 or T3 weight (and T1/T2 stage) from now on, as a dated manual
 * adjustment. Uncontrolled it renders its own "Adjust weight" button; pass `open` and
 * `onOpenChange` to control it from the screen.
 */
export function AdjustLiftSheet({
  exerciseId,
  open: controlledOpen,
  onOpenChange,
}: {
  exerciseId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const { submit, sheet } = useCommitLogChange();

  return (
    <>
      {controlledOpen === undefined && (
        <Button variant="outline" className="h-11" onClick={() => setOwnOpen(true)}>
          <SlidersHorizontal aria-hidden="true" />
          Adjust weight
        </Button>
      )}
      <AdjustForm key={String(open)} exerciseId={exerciseId} open={open} onOpenChange={setOpen} submit={submit} />
      {sheet}
    </>
  );
}
