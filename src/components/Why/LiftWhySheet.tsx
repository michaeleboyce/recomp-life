"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { XIcon } from "lucide-react";
import { useDecisionTrace, useNextWorkout, useTrainingLocation, useWeightChances } from "@/hooks";
import { cn } from "@/lib/utils";
import { tierStyle } from "@/lib/tierStyle";
import type { DecisionTrace, WorkoutLocation } from "@/types";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Stripes } from "@/components/ui/stripes";
import { formatLbs, formatSetsReps } from "@/components/Today/format";
import { displayLiftName } from "@/components/Today/todayModel";
import { WhySteps } from "./WhySteps";
import { YourCall } from "./YourCall";
import { WHY_PARAM, parseWhyParam, setWhyInUrl, type WhyTarget } from "./whyParam";

/** Where lighter or heavier is chosen: the Ready screen, which has "Edit workout". */
export const EDIT_WORKOUT_HREF = "/workout/configure";

type Part = "weight" | "rest";

/** 210 -> "3:30". */
function clock(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function checksLine(trace: DecisionTrace): string {
  const count = trace.steps.length;
  return `${count === 1 ? "One check" : `${count} checks`}, in the order the app ran them`;
}

/**
 * The why sheet for the lift named in `?why=<exerciseId>:<tier>`, at the saved
 * training location. Closing it removes the parameter. Renders nothing (and reads
 * nothing) while the parameter is absent.
 */
export function LiftWhySheet() {
  const target = parseWhyParam(useSearchParams()?.get(WHY_PARAM));
  if (!target) return null;
  return <LiftWhySheetFor key={`${target.exerciseId}:${target.tier}`} target={target} />;
}

function LiftWhySheetFor({ target }: { target: WhyTarget }) {
  const { location, isLoading } = useTrainingLocation();
  if (isLoading) return null;
  return <LiftWhySheetAt target={target} location={location} />;
}

function LiftWhySheetAt({ target, location }: { target: WhyTarget; location: WorkoutLocation }) {
  const [part, setPart] = useState<Part>("weight");
  const weight = useDecisionTrace({ ...target, location });
  const rest = useDecisionTrace({ ...target, kind: "rest", location });
  const next = useNextWorkout(location);
  const alternatives = weight?.alternatives ?? [];
  const chances = useWeightChances({
    ...target,
    location,
    weights: alternatives.map((alt) => alt.value),
  });

  // A lift that is not in the next workout (an old link): nothing to explain.
  if (weight === undefined || next === undefined) return null;
  const entry = next?.plan.find(
    (candidate) =>
      !candidate.isWarmUp &&
      candidate.exerciseId === target.exerciseId &&
      candidate.tier === target.tier
  );
  if (weight === null || !entry) return null;

  const close = () => setWhyInUrl(null);
  const liftName = displayLiftName(target.exerciseId);
  const shownName = displayLiftName(entry.substituteExerciseId ?? target.exerciseId);
  const style = tierStyle(target.tier);
  const scheme = formatSetsReps(entry);
  const planned = typeof weight.result === "number" ? weight.result : entry.weight;
  const trace = part === "rest" && rest ? rest : weight;
  const result =
    trace.unit === "s" && typeof trace.result === "number" ? clock(trace.result) : String(trace.result);
  const unitWord = trace.unit === "lb" ? "lb" : "";
  const whatWord = part === "rest" ? "rest" : "weight";
  const home = location === "home" && !!entry.substituteExerciseId;

  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        // Focus the sheet itself, so a screen reader starts at its title and no
        // focus ring sits on the close button.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
        className={cn(
          "outline-none",
          "max-h-[92dvh] gap-0 overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)]",
          // The light theme reads as squared paper (board PaperWhy).
          "bg-[linear-gradient(color-mix(in_oklab,var(--border)_45%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklab,var(--border)_45%,transparent)_1px,transparent_1px)] bg-[length:26px_26px] dark:bg-none"
        )}
      >
        <SheetHeader className="relative gap-2 px-5 pb-2">
          <div className="flex items-center justify-between gap-2 pr-12">
            <SheetTitle className={cn("text-xs font-semibold tracking-[0.16em] uppercase", style.text)}>
              {style.label} · {shownName} · why this {whatWord}
            </SheetTitle>
            <Link
              href={`/research`}
              className="hidden h-8 shrink-0 items-center rounded-full bg-secondary px-3 text-xs font-bold text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:inline-flex"
            >
              Research
            </Link>
          </div>
          {/* Light theme: the calculation's question as the heading. */}
          <p
            aria-hidden="true"
            className="font-display text-4xl leading-none font-extrabold uppercase dark:hidden"
          >
            Why {result}
            {unitWord ? ` ${unitWord}` : ""}?
          </p>
          <div className="hidden items-end justify-between gap-3 dark:flex">
            <div className="flex items-baseline gap-2">
              <span
                data-slot="why-result"
                className="font-display text-6xl leading-[0.9] font-extrabold tabular-nums"
              >
                {result}
              </span>
              <span className="font-display text-base font-bold whitespace-nowrap text-muted-foreground uppercase">
                {[unitWord, part === "weight" ? scheme : ""].filter(Boolean).join(" · ")}
              </span>
            </div>
            <span aria-hidden="true" className="max-w-[8rem] text-right text-xs text-muted-foreground">
              {checksLine(trace)}
            </span>
          </div>
          <SheetDescription className="sr-only">
            {result} {unitWord === "lb" ? "pounds" : ""}. {checksLine(trace)}.
          </SheetDescription>
          <Stripes className="w-20" />
          <SheetClose className="absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden">
            <XIcon className="size-5" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </SheetClose>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-5 pb-6">
          {rest && (
            <div role="group" aria-label="What to explain" className="grid grid-cols-2 gap-1 rounded-full bg-secondary p-1">
              {(["weight", "rest"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={part === value}
                  onClick={() => setPart(value)}
                  className={cn(
                    "h-11 rounded-full text-sm font-bold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    part === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {value === "weight" ? `Weight · ${formatLbs(planned)} lb` : `Rest · ${clock(Number(rest.result))}`}
                </button>
              ))}
            </div>
          )}

          {home && (
            <p className="rounded-xl bg-secondary px-3 py-2.5 text-[13px] leading-snug">
              <b>At home: {shownName}.</b> The steps start from your {liftName.toLowerCase()} weight
              and convert it for dumbbells. A workout adapted for home counts toward progression
              like the gym one.
            </p>
          )}

          <WhySteps trace={trace} />

          {part === "weight" && alternatives.length > 0 && (
            <YourCall
              alternatives={alternatives}
              planned={planned}
              liftName={liftName}
              chances={chances}
              editHref={EDIT_WORKOUT_HREF}
              noChanceReason={
                home
                  ? "No new-best chance at home: a dumbbell version does not count toward the barbell best."
                  : "No new-best forecast for this lift: the app forecasts the last set of main lifts with a best to beat."
              }
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
