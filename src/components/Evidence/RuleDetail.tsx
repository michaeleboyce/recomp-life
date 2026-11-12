import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DESIGN_LABELS,
  STRENGTH_DESCRIPTIONS,
  getRule,
  getSources,
  type RuleId,
  type SourceWithId,
} from "@/lib/evidence";
import { StrengthBadge } from "./StrengthBadge";

const LINK_CLASS =
  "inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline";

/** One cited paper: who, what kind of study, what it found, and links to it. */
export function SourceCard({
  source,
  className,
}: {
  source: SourceWithId;
  className?: string;
}) {
  return (
    <div
      data-source={source.id}
      className={cn("rounded-lg border border-border bg-card p-3", className)}
    >
      <p className="text-sm font-medium text-foreground">
        {source.authors} ({source.year})
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{source.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="italic">{source.journal}</span>
        {" · "}
        {DESIGN_LABELS[source.design]}
        {" · "}
        {source.population}
      </p>
      <p className="mt-2 text-sm text-foreground">{source.finding}</p>
      <div className="mt-1 flex flex-wrap gap-x-4">
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS}
        >
          Read the paper
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        {source.fullTextUrl && (
          <a
            href={source.fullTextUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
          >
            Free full text
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>
    </div>
  );
}

function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {heading}
      </h3>
      {children}
    </section>
  );
}

/**
 * The full explanation of a coaching rule: what the app does, why, how strong
 * the evidence is, its limits, and the linked sources. Shared by the detail
 * sheet and the research page.
 */
export function RuleDetail({
  ruleId,
  className,
}: {
  ruleId: RuleId;
  className?: string;
}) {
  const rule = getRule(ruleId);
  const sources = getSources(ruleId);

  return (
    <div className={cn("space-y-5", className)}>
      <Section heading="What the app does">
        <p className="text-sm text-foreground">{rule.appBehavior}</p>
      </Section>

      <Section heading="Why">
        <p className="text-sm text-foreground">{rule.rationale}</p>
      </Section>

      <Section heading="Evidence">
        <StrengthBadge strength={rule.strength} />
        <p className="text-xs text-muted-foreground">
          {STRENGTH_DESCRIPTIONS[rule.strength]}
        </p>
      </Section>

      {rule.caveat && (
        <Section heading="Limits">
          <p className="text-sm text-muted-foreground">{rule.caveat}</p>
        </Section>
      )}

      {rule.status === "planned" && rule.activationNotes && (
        <Section heading="Before this is switched on">
          <p className="text-sm text-muted-foreground">{rule.activationNotes}</p>
        </Section>
      )}

      {/* Heuristics and program rules have no sources; the Evidence section
          above already says so, so no empty Sources section is shown. */}
      {sources.length > 0 && (
        <Section heading={sources.length === 1 ? "Source" : "Sources"}>
          <div className="space-y-2">
            {sources.map((source) => (
              <SourceCard key={source.id} source={source} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
