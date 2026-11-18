"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { useSettings } from "@/hooks";
import {
  accessoryLoadStep,
  accessoryPrescription,
  handSetAccessoryWeight,
  type AccessoryPrescription,
} from "@/lib/accessories/index";
import { clearAccessoryWeight, setAccessoryWeight } from "@/lib/data/records";
import { DEFAULT_ACCESSORY_WEIGHTS, EXERCISES } from "@/lib/exercises";
import type { StrengthSet } from "@/lib/strength";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { EditSheetFrame } from "@/components/LogEdit/EditSheetFrame";
import { FieldError, StepperField } from "@/components/LogEdit/fields";
import { weightUnit } from "@/components/SetPlan/setPlanModel";
import { AdjustRow, NextSessionCard, NextSessionSection, PlanYouRow } from "./NextSessionParts";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** "3×12–15": the accessory's sets and rep range. */
export function accessoryScheme(rx: Pick<AccessoryPrescription, "sets" | "reps">): string {
  return `${rx.sets}×${rx.reps.min}–${rx.reps.max}`;
}

/**
 * An accessory's next session: the weight its prescription gives (double progression over
 * the log, its own history for a first time, or a weight set by hand while that is in
 * force), its sets and rep range, "Plan · You" with "Use plan's weight" while a weight
 * set by hand differs from the plan's, and Adjust weight. Accessories are chosen per
 * workout, so this is the weight it gets whenever it is next added.
 */
export function AccessoryNextSession({
  exerciseId,
  name,
  sets,
}: {
  exerciseId: string;
  name: string;
  /** Every set as strength evidence (`useStrengthEvidence`); undefined while loading. */
  sets: readonly StrengthSet[] | undefined;
}) {
  const loaded = useSettings();
  const [now] = useState(() => new Date());
  const settings = loaded ?? DEFAULT_USER_PROFILE.settings;
  const rx = useMemo(
    () =>
      sets === undefined
        ? undefined
        : accessoryPrescription({
            exerciseId,
            sets,
            equipment: settings.equipment,
            handSetWeight: handSetAccessoryWeight(settings, exerciseId, sets),
            now,
          }),
    [exerciseId, sets, settings, now]
  );

  if (loaded === undefined || rx === undefined) return <NextSessionSection loading />;

  const unit = weightUnit(EXERCISES[exerciseId]?.grip === "per_hand");
  const step = accessoryLoadStep(exerciseId, settings.equipment);

  return (
    <NextSessionSection title="Next time you add it">
      <NextSessionCard
        weight={rx.weight ?? 0}
        unit={unit}
        tier="accessory"
        scheme={accessoryScheme(rx)}
        isAMRAP={false}
      >
        <p data-testid="weight-line" className="border-t border-border pt-2 text-[13px] text-muted-foreground">
          {rx.note}
        </p>
        {rx.planWeight != null && rx.weight != null && (
          <PlanYouRow
            planWeight={rx.planWeight}
            weight={rx.weight}
            backToPlan={<UsePlanWeight exerciseId={exerciseId} planWeight={rx.planWeight} unit={unit} name={name} />}
          >
            Set by you. The plan&apos;s own weight stays beside yours until you lift it.
          </PlanYouRow>
        )}
      </NextSessionCard>
      <AdjustRow
        sheet={
          <AdjustAccessoryWeight
            exerciseId={exerciseId}
            name={name}
            unit={unit}
            step={step}
            current={rx.weight ?? DEFAULT_ACCESSORY_WEIGHTS[exerciseId] ?? 0}
          />
        }
      >
        Wrong weight for next time? Set it yourself; your next session of it takes over from there.
      </AdjustRow>
    </NextSessionSection>
  );
}

/** "Use 25": clears the weight set by hand, so the plan decides again. */
function UsePlanWeight({
  exerciseId,
  planWeight,
  unit,
  name,
}: {
  exerciseId: string;
  planWeight: number;
  unit: string;
  name: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-11 shrink-0"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await clearAccessoryWeight(exerciseId);
          toast({ message: `${name} back to the plan's ${planWeight} ${unit}` });
        } catch (e) {
          toast({ message: `Could not go back to the plan's weight: ${errorText(e)}` });
        } finally {
          setBusy(false);
        }
      }}
    >
      Use {planWeight}
    </Button>
  );
}

/** Adjust weight for an accessory: its own weight from now on (`setAccessoryWeight`). */
function AdjustAccessoryWeight({
  exerciseId,
  name,
  unit,
  step,
  current,
}: {
  exerciseId: string;
  name: string;
  unit: string;
  step: number;
  current: number;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(String(current));
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const weight = Number(text);
    if (text.trim() === "" || !Number.isFinite(weight) || weight < 0) {
      setInvalid("Enter a weight of 0 or more.");
      return;
    }
    setInvalid(null);
    if (weight === current) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await setAccessoryWeight(exerciseId, weight);
      toast({ message: `${name} weight saved` });
      setOpen(false);
    } catch (e) {
      setInvalid(`Could not save: ${errorText(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="h-11"
        onClick={() => {
          setText(String(current));
          setInvalid(null);
          setOpen(true);
        }}
      >
        <SlidersHorizontal aria-hidden="true" />
        Adjust weight
      </Button>
      <EditSheetFrame
        open={open}
        onOpenChange={setOpen}
        title={`Adjust ${name}`}
        description="Your weight for its next session. The plan's own weight stays beside it until you lift it."
        onSave={() => void save()}
        busy={busy}
      >
        <StepperField label="Weight" unit={unit} value={text} onChange={setText} step={step} min={0} />
        <FieldError>{invalid}</FieldError>
      </EditSheetFrame>
    </>
  );
}
