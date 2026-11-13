"use client";

import Link from "next/link";
import { BarSeries } from "@/components/chart-kit";
import { Delta } from "@/components/ui/delta";
import { ListRow } from "@/components/ui/list-row";
import { SectionHeader } from "@/components/ui/section-header";
import { Term } from "@/components/ui/term";
import type { VolumeReview } from "@/lib/review";
import { whole } from "./format";

/** Hard sets per muscle group (last week's in each label) and the week's tonnage. */
export function VolumeSection({ volume }: { volume: VolumeReview }) {
  const data = volume.groups.map((g) => ({
    key: g.group,
    label: `${g.group} (${g.previous})`,
    value: g.sets,
  }));
  return (
    <section aria-labelledby="volume-title" className="flex flex-col gap-2">
      <SectionHeader
        title={<span id="volume-title">Volume</span>}
        action={
          <Link href="/progress?tab=muscles" className="font-semibold text-primary">
            Muscles
          </Link>
        }
      />
      <p className="text-xs text-muted-foreground">
        <Term id="hard-set">Hard sets</Term> per muscle group; last week in brackets.
      </p>
      <BarSeries
        data={data}
        ariaLabel="Hard sets per muscle group this week"
        emptyMessage="No sets logged this week"
      />
      <ListRow
        href="/progress?tab=muscles"
        title="Tonnage"
        subtitle={`${whole(volume.previousTonnage)} lbs the week before`}
        value={`${whole(volume.tonnage)} lbs`}
        valueSub={
          <Delta value={Math.round(volume.tonnage - volume.previousTonnage)} unit="lbs" better="up" format={whole} />
        }
      />
    </section>
  );
}
