"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, Info, Sparkles, type LucideIcon } from "lucide-react";
import type { Takeaway, TakeawayTone } from "@/lib/review";
import { cn } from "@/lib/utils";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { SectionHeader } from "@/components/ui/section-header";

const ICON: Record<TakeawayTone, { Icon: LucideIcon; className: string }> = {
  good: { Icon: Sparkles, className: "text-success" },
  warn: { Icon: AlertTriangle, className: "text-warning" },
  info: { Icon: Info, className: "text-muted-foreground" },
};

/** Up to three sentences on how the week went, each linking to its detail. */
export function Takeaways({ items }: { items: Takeaway[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="takeaways-title" className="flex flex-col gap-1">
      <SectionHeader title={<span id="takeaways-title">Takeaways</span>} />
      <ul className="flex flex-col">
        {items.map((item) => (
          <TakeawayRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

function TakeawayRow({ item }: { item: Takeaway }) {
  const { Icon, className } = ICON[item.tone];
  const text = (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-sm font-medium text-foreground">{item.text}</span>
      {item.detail && <span className="text-[13px] text-muted-foreground">{item.detail}</span>}
    </span>
  );
  return (
    <li
      data-testid="takeaway"
      data-tone={item.tone}
      className="flex items-start gap-3 border-t border-border py-2.5 first:border-t-0"
    >
      <Icon className={cn("mt-0.5 size-[18px] shrink-0", className)} aria-hidden="true" />
      {item.href ? (
        <Link href={item.href} className="flex min-w-0 flex-1 items-start gap-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          {text}
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : (
        text
      )}
      {item.evidenceId && <EvidenceLine ruleId={item.evidenceId} variant="icon" />}
    </li>
  );
}
