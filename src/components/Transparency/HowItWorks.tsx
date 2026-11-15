"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { Stripes } from "@/components/ui/stripes";
import { Starburst } from "@/components/ui/starburst";
import { STRENGTH_LABELS, STRENGTH_ORDER } from "@/lib/evidence";
import { allModelStats, registryTotals } from "@/lib/glass/modelMap";
import { FEED_HREFS } from "@/lib/adjustments";
import { GradeMix, GradeSwatch } from "./GradeMix";

/** The kinds of data the app reads. Words only: no numbers are typed in here. */
const DATA_KINDS = [
  "Sets and reps",
  "Effort",
  "Bodyweight",
  "Sleep",
  "Stress",
  "Pain and soreness",
  "Runs and activity",
  "Apple Health",
] as const;

const SEEN_TILES = [
  { title: "Plan", sub: "today", href: "/" },
  { title: "Forecasts", sub: "what to expect", href: FEED_HREFS.forecasts },
  { title: "Log", sub: "of changes", href: "/more/adjustments" },
  { title: "Record", sub: "how often right", href: FEED_HREFS.trackRecord },
] as const;

/** A numbered band heading, as on the board: a round numeral and a small-caps title. */
function Band({
  n,
  title,
  aside,
  children,
}: {
  n: number;
  title: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`band-${n}`} className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-full bg-primary font-display text-xs font-bold text-primary-foreground"
        >
          {n}
        </span>
        <h2
          id={`band-${n}`}
          className="font-display text-sm font-bold tracking-wide text-foreground uppercase"
        >
          {title}
        </h2>
        {aside && <span className="ml-auto text-xs text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function HowItWorks() {
  const models = allModelStats();
  const totals = registryTotals();

  return (
    <PageShell className="flex flex-col gap-6">
      <div className="relative flex flex-col gap-3">
        <Starburst
          className="absolute -top-1 right-0 size-14 text-primary opacity-80"
          rays={24}
        />
        <PageHeader title="How the app decides" backHref="/more" className="pr-16" />
        <Stripes />
        <p className="text-sm text-muted-foreground">
          Nothing is hidden. It reads {DATA_KINDS.length} kinds of data, runs {models.length}{" "}
          models built from {totals.active} written rules, and shows its working every time.
        </p>
      </div>

      <Band n={1} title="What it reads">
        <ul className="flex flex-wrap gap-2">
          {DATA_KINDS.map((kind) => (
            <li
              key={kind}
              className="rounded-full bg-card px-3.5 py-2 text-sm font-semibold text-foreground"
            >
              {kind}
            </li>
          ))}
        </ul>
      </Band>

      <Band n={2} title="How it reasons" aside="evidence behind each">
        <ul className="flex flex-col">
          {models.map(({ model, active, planned, byGrade }) => (
            <li key={model.id} className="border-b border-border last:border-b-0">
              <Link
                href={`/research?model=${model.id}`}
                className="flex min-h-11 items-center gap-3 py-3 outline-none transition-colors hover:bg-card/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold text-foreground">{model.label}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {model.blurb}{" "}
                    {active === 0
                      ? `${planned} written, not switched on yet`
                      : `${active} ${active === 1 ? "rule" : "rules"}${
                          planned > 0 ? `, ${planned} more not on yet` : ""
                        }`}
                  </span>
                </span>
                <GradeMix counts={byGrade} />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </Band>

      <Band n={3} title="What you see">
        <ul className="grid grid-cols-2 gap-2.5">
          {SEEN_TILES.map((tile) => (
            <li key={tile.title}>
              <Link
                href={tile.href}
                className="flex min-h-16 flex-col items-center justify-center rounded-2xl bg-card px-3 py-3 text-center outline-none transition-colors hover:bg-card/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className="font-display text-lg font-bold text-foreground">{tile.title}</span>
                <span className="text-xs text-muted-foreground">{tile.sub}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 pt-1">
          <p className="text-xs font-semibold text-muted-foreground">
            How well research backs the {totals.active} rules
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {STRENGTH_ORDER.filter((s) => totals.byGrade[s] > 0).map((s) => (
              <li key={s} className="flex items-center gap-1.5 text-xs text-foreground">
                <GradeSwatch strength={s} />
                {STRENGTH_LABELS[s]} · {totals.byGrade[s]}
              </li>
            ))}
          </ul>
          <Link
            href="/research"
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Read every rule and its research
          </Link>
        </div>
      </Band>
    </PageShell>
  );
}
