import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { SectionHeader } from "@/components/ui/section-header";
import type { Projection } from "@/lib/projection";

interface HowItWorksProps {
  projection: Projection;
  /** Weeks of the lifter's own data the trend was fitted to (`fitWindowWeeks`). */
  dataWeeks: number;
}

/**
 * The projection's assumptions, its known limits, and one evidence line per rule
 * behind it (each opens the rule's sheet and links to /research#<rule-id>).
 */
export function HowItWorks({ projection, dataWeeks }: HowItWorksProps) {
  const weeks = Math.max(1, Math.round(dataWeeks));
  return (
    <section id="how-this-is-worked-out" aria-labelledby="how-heading" className="flex flex-col gap-3">
      <SectionHeader title={<span id="how-heading">How this is worked out</span>} />
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
        {projection.assumptions.map((sentence) => (
          <li key={sentence}>{sentence}</li>
        ))}
      </ul>

      <h3 className="text-sm font-semibold text-foreground">Known limits</h3>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
        <li>
          Extra sets are assumed to keep helping a little, even at volumes where real
          gains level off.
        </li>
        <li>
          One slowing rate is used for everyone, however long they have trained.
        </li>
        <li>
          The estimate is built from about {weeks} week{weeks === 1 ? "" : "s"} of your
          own data. It is an estimate, not a promise.
        </li>
      </ul>

      {projection.evidenceIds.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-foreground">The research behind it</h3>
          {projection.evidenceIds.map((id) => (
            <EvidenceLine key={id} ruleId={id} variant="line" />
          ))}
        </div>
      )}
    </section>
  );
}
