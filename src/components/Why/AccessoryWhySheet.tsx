"use client";

import { XIcon } from "lucide-react";
import { useNextWorkout } from "@/hooks";
import { ACCESSORY_DELOAD_FRACTION, ACCESSORY_STUCK_SESSIONS } from "@/lib/accessories";
import { percent } from "@/lib/text";
import { cn } from "@/lib/utils";
import type { WorkoutLocation } from "@/types";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Stripes } from "@/components/ui/stripes";
import { accessoryRowViews, accessoryScheme, accessoryWeightParts, accessoryWeightText } from "@/components/Today/accessoryRowModel";
import { basisTitle, lastTimeText, rankText, scorePartLines, signed } from "./accessoryWhy";
import { setWhyInUrl } from "./whyParam";

const SECTION = "text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase";

/**
 * Why an accessory is in the next workout, and why at this weight (A7): the reasons it
 * was picked, every part of its score beside the most that part can give, its place on
 * today's list, then where the weight comes from (set by you, double progression over
 * your sessions of it, your history, or none yet) with last time and what comes next.
 */
export function AccessoryWhySheet({ exerciseId, location }: { exerciseId: string; location: WorkoutLocation }) {
  const next = useNextWorkout(location);
  if (!next) return null;
  const planned = next.accessories?.planned.find((p) => p.exerciseId === exerciseId);
  const view = accessoryRowViews(next.plan, next.accessories).find((v) => v.exerciseId === exerciseId);
  if (!planned || !view) return null;
  const { prescription, pick } = planned;
  const ranked = next.accessories ? [...next.accessories.choice.picks, ...next.accessories.choice.others] : [];
  const close = () => setWhyInUrl(null);
  const last = lastTimeText(prescription);
  const rank = pick ? rankText(pick, ranked) : null;
  const top = prescription.reps.max;
  const weight = accessoryWeightParts(view);

  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
        className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)] outline-none"
      >
        <SheetHeader className="relative gap-2 px-5 pb-2">
          <SheetTitle className="pr-12 text-xs font-semibold tracking-[0.16em] text-tier-accessory uppercase">
            Accessory · {view.name}
          </SheetTitle>
          <div className="flex items-baseline gap-2" aria-label={`${accessoryWeightText(view)}, ${accessoryScheme(view.sets, view.reps)}`}>
            <span data-slot="why-result" className="font-display text-6xl leading-[0.9] font-extrabold tabular-nums">
              {weight.value}
            </span>
            <span className="font-display text-base font-bold whitespace-nowrap text-muted-foreground uppercase">
              {[weight.value === "—" ? "no weight yet" : `lb${weight.unit}`, accessoryScheme(view.sets, view.reps)].join(" · ")}
            </span>
          </div>
          <SheetDescription className="text-[13px] text-muted-foreground">
            {pick
              ? `Chosen for you${rank ? `: ${rank}` : ""}. Take every set toward ${top} reps.`
              : `Take every set toward ${top} reps.`}
          </SheetDescription>
          <Stripes className="w-20" />
          <SheetClose className="absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden">
            <XIcon className="size-5" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </SheetClose>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-5 pt-2 pb-6">
          {pick && (
            <section aria-label="Why it was picked" className="flex flex-col gap-2">
              <h3 className={SECTION}>Why it was picked</h3>
              <ul className="flex flex-col gap-1 text-[14px] leading-snug">
                {pick.reasons.map((reason) => (
                  <li key={reason} className="flex gap-2">
                    <span aria-hidden="true" className="text-tier-accessory">
                      •
                    </span>
                    {reason}
                  </li>
                ))}
              </ul>
              <table className="mt-1 w-full text-[13px]" aria-label="The score">
                <tbody>
                  {scorePartLines(pick.parts).map((line) => (
                    <tr key={line.key} className={cn("border-t border-border", line.value === 0 && "text-muted-foreground")}>
                      <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                        {line.label}
                        <span className="block text-xs font-normal text-muted-foreground">{line.hint}</span>
                      </th>
                      <td className="py-1.5 text-right font-mono tabular-nums">
                        <b className={cn(line.value !== 0 && "text-foreground")}>{signed(line.value)}</b>
                        <span className="block text-xs text-muted-foreground">
                          {line.penalty ? `up to −${line.cap}` : `up to ${line.cap}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border">
                    <th scope="row" className="py-1.5 text-left font-semibold">
                      Score
                    </th>
                    <td className="py-1.5 text-right font-mono font-bold tabular-nums">{signed(pick.score)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}

          <section aria-label="Why this weight" className="flex flex-col gap-1.5">
            <h3 className={SECTION}>Why this weight</h3>
            <p className="text-[15px] font-semibold">{basisTitle(prescription)}</p>
            <p className="text-[14px] leading-snug">{prescription.note}.</p>
            {last && <p className="font-mono text-[13px] text-muted-foreground tabular-nums">{last}</p>}
            {prescription.planWeight != null && (
              <p className="text-[13px] text-muted-foreground">The plan alone would give {prescription.planWeight} lb.</p>
            )}
            <p className="text-[13px] leading-snug text-muted-foreground">
              Next time: every set at {top} adds one step; {ACCESSORY_STUCK_SESSIONS} sessions short of it at the
              same weight drop it to {percent(ACCESSORY_DELOAD_FRACTION)} to build back.
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
