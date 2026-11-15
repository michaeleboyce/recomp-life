import * as React from "react"

import { BackButton } from "@/components/nav/BackButton"
import { cn } from "@/lib/utils"

function PageShell({
  children,
  className,
  wide = false,
}: {
  children: React.ReactNode
  className?: string
  /** From 768px, widen to max-w-5xl; lay the children out with PageGrid. */
  wide?: boolean
}) {
  return (
    <div
      data-slot="page-shell"
      className={cn(
        "mx-auto max-w-lg px-5 pt-5 pb-28",
        wide && "md:max-w-5xl",
        className
      )}
    >
      {children}
    </div>
  )
}

/** One column by default; a 12-column grid from 768px. Children set their own `md:col-span-*`. */
function PageGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="page-grid"
      className={cn("flex flex-col gap-4 md:grid md:grid-cols-12 md:gap-6", className)}
    >
      {children}
    </div>
  )
}

function PageHeader({
  title,
  backHref,
  action,
  className,
}: {
  title: React.ReactNode
  /** The back arrow's target when there is no in-app previous screen. */
  backHref?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <header
      data-slot="page-header"
      className={cn("flex items-center gap-3", className)}
    >
      {/* Back returns to the previous in-app screen; backHref is where it goes
          when there is none (opened from a link, a reload, the first screen). */}
      {backHref && <BackButton fallback={backHref} />}
      <h1 className="min-w-0 flex-1 truncate font-display text-xl font-bold text-foreground">
        {title}
      </h1>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </header>
  )
}

export { PageShell, PageGrid, PageHeader }
