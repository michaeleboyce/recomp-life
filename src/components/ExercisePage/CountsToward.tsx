"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EXERCISES } from "@/lib/exercises";
import { formatMuscle } from "@/lib/muscles";
import type { StrengthSet } from "@/lib/strength";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/section-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Term } from "@/components/ui/term";
import { LIFT_NAMES, type MainLiftId } from "@/components/Progress/lifts";
import { displayLiftName, exercisePageHref } from "@/components/Today/todayModel";
import {
  homeCountsToward,
  liftHomeVersions,
  ratioBasisText,
  type ExerciseKind,
} from "./exercisePageModel";

const LINK = "-my-3 flex min-h-11 items-center gap-0.5 font-bold text-accent-primary";

/**
 * A home version: the program lift's pooled estimate, what this exercise's latest
 * session says the lift is ("≈ squat 205"), the ratio and its pairs, and the lift's page.
 * A placeholder while the strength sets load (`sets` undefined).
 */
function HomeCounts({
  exerciseId,
  liftId,
  sets,
}: {
  exerciseId: string;
  liftId: MainLiftId;
  sets: readonly StrengthSet[] | undefined;
}) {
  const { label, short } = LIFT_NAMES[liftId];
  const counts = homeCountsToward(sets, liftId, exerciseId);
  return (
    <>
      <SectionHeader
        title="Counts toward"
        action={
          <Link href={exercisePageHref(liftId)} className={LINK}>
            Open {label}
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        }
      />
      {sets === undefined ? (
        <SkeletonCard />
      ) : (
        <div data-testid="counts-toward" className="flex flex-col gap-2 rounded-xl bg-card px-4 py-3">
          <p className="flex items-baseline justify-between gap-3 text-sm">
            <span>
              Your {short} <Term id="e1rm">strength estimate</Term>
            </span>
            <b data-testid="pooled-estimate" className="font-mono tabular-nums">
              {counts.pooled != null ? `${counts.pooled} lbs` : "–"}
            </b>
          </p>
          {counts.says != null && (
            <p data-testid="counts-says" className="text-[13px] text-muted-foreground">
              {counts.fromTarget ? "The weight you set says" : "Your latest session says"}{" "}
              <b className="font-mono text-foreground">
                ≈ {short} {counts.says}
              </b>
              .
            </p>
          )}
          {counts.ratio && (
            <div className="flex items-start gap-2 border-t border-border pt-2">
              <p data-testid="counts-ratio" className="flex-1 text-[13px] text-muted-foreground">
                {displayLiftName(exerciseId)} is about{" "}
                <b className="font-mono text-foreground">{counts.ratio.ratio.toFixed(2)}</b> of your {short},{" "}
                {ratioBasisText(counts.ratio)}.
              </p>
              <EvidenceLine ruleId="transfer-ratio" variant="icon" />
              <EvidenceLine ruleId="strength-pooling" variant="icon" />
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** A barbell lift: its home versions, each with its ratio, linking to its page. */
function LiftHomeVersions({ liftId, sets }: { liftId: MainLiftId; sets: readonly StrengthSet[] | undefined }) {
  const { short } = LIFT_NAMES[liftId];
  const versions = liftHomeVersions(sets, liftId);
  if (versions.length === 0) return null;
  return (
    <>
      <SectionHeader title="Home versions" action={<EvidenceLine ruleId="transfer-ratio" variant="icon" />} />
      <p className="text-[13px] text-muted-foreground">Their sessions count toward your {short} estimate.</p>
      <ul>
        {versions.map(({ exerciseId, ratio }) => (
          <li key={exerciseId} className="border-b border-border last:border-b-0">
            <Link
              href={exercisePageHref(exerciseId)}
              data-testid="home-version-row"
              className="flex min-h-[52px] items-center gap-3 py-2"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold text-foreground">{displayLiftName(exerciseId)}</span>
                {ratio && (
                  <span className="text-xs text-muted-foreground">
                    <span className="font-mono">{ratio.ratio.toFixed(2)}</span> of {short}, {ratioBasisText(ratio)}
                  </span>
                )}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Anything else: the muscles it trains most, linking to the muscle view. */
function MusclesTrained({ exerciseId }: { exerciseId: string }) {
  const muscles = EXERCISES[exerciseId]?.primaryMuscles ?? [];
  if (muscles.length === 0) return null;
  return (
    <>
      <SectionHeader
        title="Counts toward"
        action={
          <Link href="/progress?tab=muscles" className={LINK}>
            Muscles
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        }
      />
      <div data-testid="muscles-trained" className="flex flex-wrap gap-1.5">
        {muscles.map((m) => (
          <Badge key={m} asChild variant="secondary" className="text-[12px]">
            <Link href="/progress?tab=muscles">{formatMuscle(m)}</Link>
          </Badge>
        ))}
      </div>
    </>
  );
}

/** The one card on the Training tab about something other than this exercise (E9). */
export function CountsToward({
  exerciseId,
  kind,
  sets,
}: {
  exerciseId: string;
  kind: ExerciseKind;
  sets: readonly StrengthSet[] | undefined;
}) {
  return (
    <section aria-label="Counts toward" className="flex flex-col gap-2">
      {kind.kind === "home" ? (
        <HomeCounts exerciseId={exerciseId} liftId={kind.liftId} sets={sets} />
      ) : kind.kind === "lift" ? (
        <LiftHomeVersions liftId={kind.liftId} sets={sets} />
      ) : (
        <MusclesTrained exerciseId={exerciseId} />
      )}
    </section>
  );
}
