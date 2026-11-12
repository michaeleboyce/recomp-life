import * as React from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { cn } from "@/lib/utils"

function PageShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="page-shell"
      className={cn("mx-auto max-w-lg px-5 pt-5 pb-28", className)}
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
  backHref?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <header
      data-slot="page-header"
      className={cn("flex items-center gap-3", className)}
    >
      {backHref && (
        <Link
          href={backHref}
          aria-label="Back"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>
      )}
      <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-foreground">
        {title}
      </h1>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </header>
  )
}

export { PageShell, PageHeader }
