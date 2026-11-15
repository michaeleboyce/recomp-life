"use client";

import Link from "next/link";
import { ChevronRight, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GradeChip } from "@/components/ui/grade-chip";
import { toast } from "@/components/ui/toast";
import {
  AREA_LABELS,
  STRENGTH_DESCRIPTIONS,
  STRENGTH_LABELS,
  formatRegistryDate,
  getAllRules,
  getChangelog,
  getRule,
  getSource,
  getSources,
  type RuleId,
} from "@/lib/evidence";
import { PersonalNumbersCard } from "./PersonalNumbers";
import { SourceCard } from "./RuleDetail";
import { ruleLink } from "./useLinkedRule";
import { getRuleSurfaces } from "./surfaces";

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="font-display text-xs font-bold tracking-wider text-primary uppercase">
        {heading}
      </h2>
      {children}
    </section>
  );
}

/** Copies the link to a rule, with a toast either way. */
export async function shareRule(ruleId: RuleId) {
  const url = ruleLink(window.location.origin, ruleId);
  try {
    await navigator.clipboard.writeText(url);
    toast({ message: "Link copied." });
  } catch {
    toast({ message: "Could not copy the link. Copy it from the address bar." });
  }
}

/**
 * One rule, worth landing on: the question, the grade and what it means, what the app
 * does and why, where it could be wrong, what the user's own log says (for the rules
 * that have "Your own numbers"), the sources, related rules, where the rule shows up in
 * the app, and every change made to it.
 */
export function RulePage({ ruleId, backHref }: { ruleId: RuleId; backHref: string }) {
  const rule = getRule(ruleId);
  const sources = getSources(ruleId);
  const related = getRelated(ruleId);
  const surfaces = getRuleSurfaces(rule.surfaces);
  const changes = getChangelog().filter((c) => c.ruleId === ruleId);

  return (
    <article className="flex flex-col gap-6" data-rule={ruleId}>
      <div className="flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="-ml-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          ‹ All rules
        </Link>
        <Button
          variant="secondary"
          className="min-h-11 gap-1.5 rounded-full px-4 font-bold"
          onClick={() => void shareRule(ruleId)}
        >
          <Share2 className="size-4" aria-hidden="true" />
          Share
        </Button>
      </div>

      <header className="flex flex-col gap-3">
        <p className="font-display text-xs font-bold tracking-wider text-primary uppercase">
          {AREA_LABELS[rule.area]} · Reviewed {formatRegistryDate(rule.reviewedOn)}
        </p>
        <h1 className="font-display text-2xl leading-tight font-bold text-foreground">
          {rule.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <GradeChip strength={rule.strength} size="md" label={STRENGTH_LABELS[rule.strength]} />
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {STRENGTH_DESCRIPTIONS[rule.strength]}
          </p>
        </div>
        {rule.status === "planned" && (
          <p className="rounded-xl bg-card px-3 py-2 text-sm text-muted-foreground">
            Not active yet. This rule is written down but does not affect your training.
          </p>
        )}
      </header>

      <Section heading="What the app does">
        <p className="text-[15px] text-foreground">{rule.appBehavior}</p>
      </Section>

      <Section heading="Why">
        <p className="text-[15px] text-foreground">{rule.rationale}</p>
      </Section>

      <Section heading="Where it could be wrong">
        <p className="text-[15px] text-foreground">
          {rule.caveat ?? "No limits are recorded beyond the grade above."}
        </p>
      </Section>

      <PersonalNumbersCard ruleId={ruleId} />

      {rule.status === "planned" && rule.activationNotes && (
        <Section heading="Before this is switched on">
          <p className="text-[15px] text-muted-foreground">{rule.activationNotes}</p>
        </Section>
      )}

      <Section heading={sources.length === 1 ? "Source" : "Sources"}>
        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {rule.strength === "program"
              ? "Defined by the GZCLP program, not by research."
              : "No direct research. This is a common coaching convention."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {sources.map((source) => (
              <SourceCard key={source.id} source={source} />
            ))}
          </div>
        )}
      </Section>

      {surfaces.length > 0 && (
        <Section heading="Where you see it in the app">
          <ul className="flex flex-wrap gap-2">
            {surfaces.map((surface) => (
              <li
                key={surface}
                className="rounded-full bg-card px-3 py-1.5 text-sm font-medium text-foreground"
              >
                {surface}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {changes.length > 0 && (
        <Section heading="Changes to this rule">
          <ul className="flex flex-col">
            {changes.map((change, index) => (
              <li
                key={`${change.date}-${index}`}
                className="flex flex-col gap-0.5 border-b border-border py-3 last:border-b-0"
              >
                <p className="font-mono text-xs text-muted-foreground">
                  {formatRegistryDate(change.date)}
                </p>
                <p className="text-sm text-foreground">{change.change}</p>
                {change.sources.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {change.sources.map((id) => getSource(id).short).join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {related.length > 0 && (
        <Section heading="Related">
          <ul className="flex flex-col">
            {related.map((other) => (
              <li key={other.id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/research?rule=${other.id}`}
                  className="flex min-h-11 items-center gap-3 py-3"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[15px] font-semibold text-foreground">{other.title}</span>
                    <span>
                      <GradeChip strength={other.strength} />
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </article>
  );
}

/** Other rules in the same area, active ones first. */
function getRelated(ruleId: RuleId) {
  const { area } = getRule(ruleId);
  return getAllRules()
    .filter((r) => r.area === area && r.id !== ruleId)
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active"));
}
