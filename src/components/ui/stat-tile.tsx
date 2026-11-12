import * as React from "react"
import Link from "next/link"

import { cn } from "@/lib/utils"

const tileClass =
  "relative flex flex-col gap-1 overflow-hidden rounded-[14px] bg-card p-3.5 text-card-foreground"

function StatTile({
  label,
  value,
  unit,
  delta,
  sparkline,
  href,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  unit?: string
  delta?: React.ReactNode
  sparkline?: React.ReactNode
  href?: string
  className?: string
}) {
  const body = (
    <>
      <span data-slot="stat-tile-label" className="text-xs text-muted-foreground">
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <span
          data-slot="stat-tile-value"
          className="font-mono text-[22px] leading-tight font-bold tabular-nums"
        >
          {value}
        </span>
        {unit && (
          <span data-slot="stat-tile-unit" className="text-xs text-muted-foreground">
            {unit}
          </span>
        )}
      </span>
      {delta && <span data-slot="stat-tile-delta">{delta}</span>}
      {sparkline && (
        <div data-slot="stat-tile-sparkline" className="mt-1 h-8 w-full">
          {sparkline}
        </div>
      )}
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        data-slot="stat-tile"
        className={cn(
          tileClass,
          "outline-none transition-colors hover:bg-card-raised focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.98]",
          className
        )}
      >
        {body}
      </Link>
    )
  }

  return (
    <div data-slot="stat-tile" className={cn(tileClass, className)}>
      {body}
    </div>
  )
}

export { StatTile }
