import * as React from "react"

import { cn } from "@/lib/utils"

function SectionHeader({
  title,
  action,
  as: Heading = "h2",
  className,
}: {
  title: React.ReactNode
  action?: React.ReactNode
  as?: "h1" | "h2" | "h3" | "h4"
  className?: string
}) {
  return (
    <div
      data-slot="section-header"
      className={cn("flex items-center justify-between gap-3", className)}
    >
      <Heading className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </Heading>
      {action && <div className="shrink-0 text-xs">{action}</div>}
    </div>
  )
}

export { SectionHeader }
