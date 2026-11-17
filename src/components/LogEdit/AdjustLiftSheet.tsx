"use client";

import { useMemo, useState, type ReactNode } from "react";
import { v4 as uuidv4 } from "uuid";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { Term } from "@/components/ui/term";
import { homeNextSession, homeScheme, homeWeightLine, isPerHand, withHomeAdjustment } from "@/components/Lift/homeVersion";
import { useHomePlanContext } from "@/components/Lift/useHomePlanContext";
import { displayLiftName, nameInSentence } from "@/components/Today/todayModel";
import { tierStyle } from "@/lib/tierStyle";
import { useLiftStates } from "@/hooks";
import type { LogChange } from "@/lib/rebuild";
import type { LiftAdjustment, LiftState, T1Stage, T2Stage, Tier } from "@/types";
import { EditSheetFrame } from "./EditSheetFrame";
import { FieldError, FieldLabel, StepperField } from "./fields";
import { liftName } from "./format";
import { WEIGHT_MAX } from "./setChanges";
import { useCommitLogChange } from "./useCommitLogChange";
import { BACK_TO_PLAN_NOTE } from "@/lib/workout/variant";

type AdjustTier = "T1" | "T2" | "T3";
const T1_STAGES: T1Stage[] = ["5x3", "6x2", "10x1"];
const T2_STAGES: T2Stage[] = ["3x10", "3x8", "3x6"];
const TIERS = [
  { value: "T1", label: "T1" },
  { value: "T2", label: "T2" },
  { value: "T3", label: "T3" },
];

/**
 * The `adjustLift` change for a manual weight (and stage) change from `at` on. With
 * `variantExerciseId` it is for that home exercise standing in for `exerciseId` at the
 * tier: the rebuild sets the home exercise's own weight (as lifted) and leaves the
 * barbell lift alone. `note` BACK_TO_PLAN_NOTE puts a home exercise back on the plan's
 * weight, ending its override.
 */
export function buildManualAdjustment(
  exerciseId: string,
  tier: AdjustTier,
  weight: number,
  stage: T1Stage | T2Stage | null,
  at: Date = new Date(),
  newId: () => string = uuidv4,
  variantExerciseId?: string,
  note?: string
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
    adjustment: {
      id,
      clientId: id,
      exerciseId,
      at,
      source: "manual",
      set,
      ...(variantExerciseId ? { variant: { exerciseId: variantExerciseId, tier } } : {}),
      ...(note ? { note } : {}),
      synced: false,
    },
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
  weightHint,
}: {
  exerciseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submit: ReturnType<typeof useCommitLogChange>["submit"];
  weightHint?: ReactNode;
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
      <p data-testid="tier-terms" className="-mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span>
          <Term id="t1" className={tierStyle("T1").text}>T1</Term> heavy
        </span>
        <span>
          <Term id="t2" className={tierStyle("T2").text}>T2</Term> moderate
        </span>
        <span>
          <Term id="t3" className={tierStyle("T3").text}>T3</Term> light
        </span>
      </p>
      <StepperField
        label="Weight"
        unit="lbs"
        value={weightText}
        onChange={setWeight}
        step={5}
        max={WEIGHT_MAX}
        hint={
          weightHint ? (
            <p data-testid="weight-hint" className="text-xs text-muted-foreground">
              {weightHint}
            </p>
          ) : undefined
        }
      />
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

const HOME_TIERS = TIERS.filter((t) => t.value !== "T3");

/**
 * The Adjust weight form for a home exercise standing in for `exerciseId`: its own
 * weight as lifted (per hand where it is per hand), in dumbbell steps up to the
 * heaviest dumbbell, starting from the weight its next home session is planned at (the
 * number the lift page and Today show), with that next session previewed as the change
 * would leave it. Saved as a `LiftAdjustment` with `variant`; the barbell lift is not
 * touched.
 */
function HomeAdjustForm({
  exerciseId,
  substituteId,
  initialTier,
  open,
  onOpenChange,
  submit,
}: {
  exerciseId: string;
  substituteId: string;
  initialTier: "T1" | "T2";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submit: ReturnType<typeof useCommitLogChange>["submit"];
}) {
  const ctx = useHomePlanContext();
  const [tier, setTier] = useState<"T1" | "T2">(initialTier);
  const [weight, setWeight] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = displayLiftName(substituteId);
  const perHand = isPerHand(substituteId);
  const unit = perHand ? "lbs a hand" : "lbs";
  const now = useMemo(() => (ctx ? homeNextSession(exerciseId, substituteId, ctx, tier) : null), [ctx, exerciseId, substituteId, tier]);
  const weightText = weight ?? String(now?.weight ?? 0);
  const stageValue = stage ?? now?.stage ?? null;
  const barbell = ctx?.liftStates.find((s) => s.exerciseId === exerciseId);
  const barbellWeight = tier === "T1" ? barbell?.t1Weight : barbell?.t2Weight;
  const max = ctx?.equipment.maxDumbbellWeight ?? WEIGHT_MAX;
  const description = "Saved as a dated change from today on. Past sessions are not altered.";

  const preview = useMemo(() => {
    const w = Number(weightText);
    if (!ctx || !now || weightText.trim() === "" || !Number.isFinite(w) || w <= 0 || w > max) return null;
    const variantStates = withHomeAdjustment(ctx.variantStates, ctx.liftStates, ctx.equipment, {
      liftId: exerciseId,
      exerciseId: substituteId,
      tier,
      weight: w,
      stage: stageValue as T1Stage | T2Stage | null,
    });
    // Planned again from the changed states, not from Today's plan.
    const after = homeNextSession(
      exerciseId,
      substituteId,
      { ...ctx, next: ctx.next ? { templateId: ctx.next.templateId } : undefined, variantStates },
      tier
    );
    return { after, typed: w };
  }, [ctx, now, weightText, stageValue, exerciseId, substituteId, tier, max]);

  async function save() {
    if (!now) return;
    const w = Number(weightText);
    if (weightText.trim() === "" || !Number.isFinite(w) || w < 0 || w > max) {
      setInvalid(`Enter a weight from 0 to ${max} lbs, your heaviest dumbbell.`);
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
      const change = buildManualAdjustment(exerciseId, tier, w, stageChanged, new Date(), uuidv4, substituteId);
      const result = await submit(change, { message: `${name} ${tier} weight saved` });
      if (result !== "error") onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  if (!ctx || !now) {
    return (
      <EditSheetFrame open={open} onOpenChange={onOpenChange} title={`Adjust ${name}`} description={description} onSave={() => undefined} busy>
        <p className="text-sm text-muted-foreground">Loading the current weight.</p>
      </EditSheetFrame>
    );
  }

  const step = ctx.equipment.dumbbellIncrementLbs;
  return (
    <EditSheetFrame
      open={open}
      onOpenChange={onOpenChange}
      title={`Adjust ${name}`}
      description={description}
      onSave={() => void save()}
      busy={busy}
    >
      <FieldLabel>Tier</FieldLabel>
      <ChipGroup
        ariaLabel="Tier"
        options={HOME_TIERS}
        value={tier}
        onChange={(v) => {
          setTier(v as "T1" | "T2");
          setWeight(null);
          setStage(null);
        }}
      />
      <StepperField
        label="Weight"
        unit={unit}
        value={weightText}
        onChange={setWeight}
        step={step}
        max={max}
        hint={
          <p data-testid="weight-hint" className="text-xs text-muted-foreground">
            {name}&apos;s own weight{perHand ? ", for each dumbbell" : ", one dumbbell"}. The barbell{" "}
            {liftName(exerciseId).toLowerCase()} stays at {barbellWeight ?? 0} lbs.
          </p>
        }
      />
      <FieldLabel>Stage</FieldLabel>
      <ChipGroup
        ariaLabel="Stage"
        options={(tier === "T1" ? T1_STAGES : T2_STAGES).map((s) => ({ value: s, label: s }))}
        value={stageValue ?? ""}
        onChange={setStage}
      />
      {preview && (
        <p data-testid="home-adjust-preview" className="rounded-lg bg-accent-primary-soft px-3 py-2 text-[13px] text-foreground">
          {now.plannedAs ? `Next time you do ${nameInSentence(substituteId)}` : "Next home session"}:{" "}
          <b className="font-mono">
            {preview.after.weight} {unit}
          </b>
          , {homeScheme(preview.after)}.
          {preview.after.weight !== preview.typed &&
            ` The plan takes ${preview.after.weight}: ${homeWeightLine(exerciseId, liftName(exerciseId).toLowerCase(), substituteId, preview.after, ctx.equipment).text}`}
        </p>
      )}
      <FieldError>{invalid}</FieldError>
    </EditSheetFrame>
  );
}

/**
 * Set a lift's T1, T2 or T3 weight (and T1/T2 stage) from now on, as a dated manual
 * adjustment. With `home` it edits that home exercise's own weight instead (see
 * `HomeAdjustForm`). Uncontrolled it renders its own "Adjust weight" button; pass `open`
 * and `onOpenChange` to control it from the screen.
 */
export function AdjustLiftSheet({
  exerciseId,
  open: controlledOpen,
  onOpenChange,
  weightHint,
  home,
}: {
  exerciseId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Says which weight the field edits. */
  weightHint?: ReactNode;
  /** The home exercise to edit, standing in for `exerciseId`, and the tier to start at. */
  home?: { substituteId: string; tier?: Tier };
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
      {home ? (
        <HomeAdjustForm
          key={String(open)}
          exerciseId={exerciseId}
          substituteId={home.substituteId}
          initialTier={home.tier === "T2" ? "T2" : "T1"}
          open={open}
          onOpenChange={setOpen}
          submit={submit}
        />
      ) : (
        <AdjustForm
          key={String(open)}
          exerciseId={exerciseId}
          open={open}
          onOpenChange={setOpen}
          submit={submit}
          weightHint={weightHint}
        />
      )}
      {sheet}
    </>
  );
}

/**
 * "Use 70": puts a home exercise whose weight was set by hand back on the plan's weight
 * (`planWeight`, from `homePlanWeight`), saved as a dated change with
 * BACK_TO_PLAN_NOTE so the override ends and the plan decides again.
 *
 * @evidence target-evidence
 */
export function BackToPlanButton({
  exerciseId,
  substituteId,
  tier,
  planWeight,
  unit,
}: {
  exerciseId: string;
  substituteId: string;
  tier: "T1" | "T2" | "T3";
  planWeight: number;
  unit: string;
}) {
  const { submit, busy, sheet } = useCommitLogChange();
  const name = displayLiftName(substituteId);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-11 shrink-0"
        disabled={busy}
        onClick={() =>
          void submit(
            buildManualAdjustment(exerciseId, tier, planWeight, null, new Date(), uuidv4, substituteId, BACK_TO_PLAN_NOTE),
            { message: `${name} back to the plan's ${planWeight} ${unit}` }
          )
        }
      >
        Use {planWeight}
      </Button>
      {sheet}
    </>
  );
}
