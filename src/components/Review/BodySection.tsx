"use client";

import type { DeltaBetter } from "@/components/ui/delta";
import { Delta } from "@/components/ui/delta";
import { ListRow } from "@/components/ui/list-row";
import { SectionHeader } from "@/components/ui/section-header";
import type { BodyweightReview } from "@/lib/review";
import { cn } from "@/lib/utils";
import { lbs, signed } from "./format";

/** 7-day average and weekly rate; nothing when the week has fewer than two weigh-ins. */
export function BodySection({
  body,
  mode,
}: {
  body: BodyweightReview | null;
  mode: "cutting" | "maintaining" | "bulking" | undefined;
}) {
  if (!body) return null;
  const better: DeltaBetter = mode === "cutting" ? "down" : mode === "bulking" ? "up" : "none";
  const band = body.targetBand;
  return (
    <section aria-labelledby="body-title" className="flex flex-col gap-1">
      <SectionHeader title={<span id="body-title">Body</span>} />
      <ListRow
        href="/progress/body"
        title="7-day average"
        subtitle={`${body.weighIns} weigh-ins`}
        value={`${lbs(body.average)} lbs`}
        valueSub={
          body.change === null ? undefined : (
            <Delta value={Number(body.change.toFixed(1))} unit="lbs" better={better} suffix="vs last week" />
          )
        }
      />
      {body.weeklyRate !== null && (
        <ListRow
          href="/progress/body"
          title="Weekly rate"
          subtitle={
            band ? `Target ${signed(band.high, 1)} to ${signed(band.low, 1)} lbs/wk` : "Change per week"
          }
          value={`${signed(body.weeklyRate)} lbs/wk`}
          valueSub={
            body.pace ? (
              <span className={cn("font-semibold", body.pace === "on pace" ? "text-success" : "text-warning")}>
                {body.pace}
              </span>
            ) : undefined
          }
        />
      )}
    </section>
  );
}
