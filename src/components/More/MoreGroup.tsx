import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { ListRow } from "@/components/ui/list-row";
import { SectionHeader } from "@/components/ui/section-header";
import { cn } from "@/lib/utils";

/** A Lucide icon in a small tinted square, the leading element of every More row. */
export function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 items-center justify-center rounded-lg bg-accent-primary-soft text-accent-primary",
        className
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

/** A titled group: rows share one rounded card with hairline dividers. */
export function MoreGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <SectionHeader title={title} className="px-1" />
      <div className="overflow-hidden rounded-2xl bg-card">{children}</div>
    </section>
  );
}

export function MoreRow({
  icon,
  title,
  subtitle,
  href,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: React.ReactNode;
  href: string;
}) {
  return (
    <ListRow
      href={href}
      title={title}
      subtitle={subtitle}
      leading={<IconTile icon={icon} />}
      className="px-4"
    />
  );
}
