"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";
import type { RuleId } from "@/lib/evidence";
import {
  NOT_PROOF,
  VERDICT_LABELS,
  formatSignedReps,
  type PersonalEvidence,
  type PersonalGroup,
} from "@/lib/evidence/personal";
import { usePersonalEvidence } from "@/hooks/usePersonalEvidence";

function count(n: number, unit: PersonalEvidence["unit"]): string {
  return `${n} ${n === 1 ? unit.one : unit.many}`;
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Stat({ value, group, unit }: { value: number; group: PersonalGroup; unit: PersonalEvidence["unit"] }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span
        data-slot="personal-average"
        className="font-display text-[28px] leading-none font-extrabold text-foreground tabular-nums"
      >
        {formatSignedReps(value)}
      </span>
      <span className="text-xs leading-snug text-muted-foreground">
        {group.label} ({count(group.count, unit)})
      </span>
    </div>
  );
}

function more(n: number, unit: PersonalEvidence["unit"]): string {
  return `${n} more ${n === 1 ? unit.one : unit.many}`;
}

/** What is still needed: "Needs 5 more heavy sets after a short rest and 5 more after the full rest." */
function neededSentence({ needed, exposed, reference, unit }: PersonalEvidence): string {
  const parts: string[] = [];
  if (needed.exposed > 0) parts.push(`${more(needed.exposed, unit)} ${exposed.name}`);
  if (needed.reference > 0) {
    parts.push(
      parts.length > 0
        ? `${needed.reference} more ${reference.name}`
        : `${more(needed.reference, unit)} ${reference.name}`
    );
  }
  return `Needs ${parts.join(" and ")}.`;
}

function NotYet({ evidence }: { evidence: PersonalEvidence }) {
  const { exposed, reference, unit, minPerGroup, unmatched, unmatchedReason } = evidence;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[15px] text-foreground">Not enough in your log yet to compare.</p>
      <p className="text-sm text-foreground">{neededSentence(evidence)}</p>
      <p className="text-xs text-muted-foreground">
        So far: {count(exposed.count, unit)} {exposed.name}, and {reference.count}{" "}
        {reference.name}. Numbers appear once each has {minPerGroup}.
      </p>
      {unmatched > 0 && unmatchedReason && (
        <p className="text-xs text-muted-foreground">
          {sentenceCase(count(unmatched, unit))} wait for a match: {unmatchedReason}
        </p>
      )}
    </div>
  );
}

/**
 * "Your own numbers" for a rule: what the user's own log says about the question the
 * research answers. Below the minimum sample it shows no numbers, only how many more
 * are needed. Never claims a cause.
 */
export function PersonalNumbers({ evidence }: { evidence: PersonalEvidence }) {
  const headingId = useId();
  const { result, exposed, reference, unit } = evidence;
  const total = exposed.count + reference.count;

  return (
    <section
      aria-labelledby={headingId}
      data-personal-evidence={evidence.ruleId}
      className="flex flex-col gap-3 rounded-2xl bg-card p-4 text-card-foreground"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id={headingId}
          className="font-display text-xs font-bold tracking-wider text-primary uppercase"
        >
          Your own numbers
        </h2>
        {result && <span className="text-xs text-muted-foreground">{count(total, unit)}</span>}
      </div>

      {result ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat value={result.exposedMean} group={exposed} unit={unit} />
            <Stat value={result.referenceMean} group={reference} unit={unit} />
          </div>
          <p className="text-sm text-foreground">
            Gap <span className="font-semibold tabular-nums">{formatSignedReps(result.difference)}</span>{" "}
            reps, with a rough {Math.round(result.level * 100)}% range of{" "}
            <span className="font-semibold tabular-nums">{formatSignedReps(result.low)}</span> to{" "}
            <span className="font-semibold tabular-nums">{formatSignedReps(result.high)}</span>.
          </p>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold text-foreground" data-verdict={result.verdict}>
              {sentenceCase(VERDICT_LABELS[result.verdict])}.
            </p>
            <p className="text-xs text-muted-foreground">{NOT_PROOF}.</p>
          </div>
        </>
      ) : (
        <NotYet evidence={evidence} />
      )}

      <details className="group -mb-2 border-t border-border">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm font-medium text-foreground">
          How this is worked out
          <ChevronDown
            className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <ul className="flex flex-col gap-2 pb-3 text-xs text-muted-foreground">
          {evidence.method.map((sentence) => (
            <li key={sentence}>{sentence}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** The card on a rule page, for the rules that have one; nothing for the rest or while loading. */
export function PersonalNumbersCard({ ruleId }: { ruleId: RuleId }) {
  const evidence = usePersonalEvidence(ruleId);
  if (!evidence) return null;
  return <PersonalNumbers evidence={evidence} />;
}
