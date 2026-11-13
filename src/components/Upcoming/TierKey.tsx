"use client";

import { Term } from "@/components/ui/term";
import { tierStyle } from "@/lib/tierStyle";

/**
 * One line saying what the tier badges and the "+" mean, each word opening its
 * glossary entry. Configure also explains warm-ups and the rest after each set.
 */
export function TierKey({
  warmUp = false,
  rest = false,
}: {
  /** Add "warm-up: lighter sets before T1". */
  warmUp?: boolean;
  /** Add "rest: timed after every set". */
  rest?: boolean;
}) {
  return (
    <p
      data-testid="tier-key"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
    >
      <span>
        <Term id="t1" className={tierStyle("T1").text}>T1</Term> heavy
      </span>
      <span>
        <Term id="t2" className={tierStyle("T2").text}>T2</Term> moderate
      </span>
      <span>
        <Term id="t3" className={tierStyle("T3").text}>T3</Term> light
      </span>
      <span>
        <Term id="amrap-plus" label="+">+</Term> last set is <Term id="amrap">AMRAP</Term>
      </span>
      {warmUp && (
        <span>
          <Term id="warm-up">warm-up</Term> lighter sets first
        </span>
      )}
      {rest && (
        <span>
          <Term id="rest-timer">rest</Term> timed after every set
        </span>
      )}
    </p>
  );
}
