import * as React from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

const rowClass =
  "flex min-h-[52px] w-full items-center gap-3 border-b border-border py-2.5 text-left last:border-b-0"
const interactiveClass =
  "outline-none transition-colors hover:bg-card/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-card"

function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  value,
  valueSub,
  href,
  onClick,
  showChevron,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  leading?: React.ReactNode
  trailing?: React.ReactNode
  value?: React.ReactNode
  valueSub?: React.ReactNode
  href?: string
  onClick?: () => void
  /** Defaults to true when the row is a link or button. */
  showChevron?: boolean
  className?: string
}) {
  const interactive = Boolean(href || onClick)
  const chevron = showChevron ?? interactive

  const content = (
    <>
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold text-foreground">{title}</span>
        {subtitle && <span className="truncate text-[13px] text-muted-foreground">{subtitle}</span>}
      </span>
      {(value !== undefined || valueSub !== undefined) && (
        <span className="flex shrink-0 flex-col items-end">
          {value !== undefined && (
            <span className="font-mono text-[15px] font-semibold tabular-nums">{value}</span>
          )}
          {valueSub !== undefined && <span className="text-xs">{valueSub}</span>}
        </span>
      )}
      {trailing && <span className="shrink-0">{trailing}</span>}
      {chevron && (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        data-slot="list-row"
        className={cn(rowClass, interactiveClass, className)}
      >
        {content}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-slot="list-row"
        className={cn(rowClass, interactiveClass, className)}
      >
        {content}
      </button>
    )
  }
  return (
    <div data-slot="list-row" className={cn(rowClass, className)}>
      {content}
    </div>
  )
}

export { ListRow }
