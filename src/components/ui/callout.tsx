import * as React from "react"
import { cva } from "class-variance-authority"
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react"

import { cn } from "@/lib/utils"

export type CalloutVariant = "info" | "success" | "warning" | "danger"

const calloutVariants = cva("flex items-start gap-3 rounded-xl border p-4", {
  variants: {
    variant: {
      info: "bg-info-soft border-info/30",
      success: "bg-success-soft border-success/30",
      warning: "bg-warning-soft border-warning/30",
      danger: "bg-destructive-soft border-destructive/30",
    },
  },
  defaultVariants: { variant: "info" },
})

const accentText: Record<CalloutVariant, string> = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
}

const DefaultIcon: Record<
  CalloutVariant,
  React.ComponentType<{ className?: string }>
> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertOctagon,
}

function Callout({
  variant = "info",
  title,
  icon,
  actions,
  children,
  className,
}: {
  variant?: CalloutVariant
  title?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  const Icon = DefaultIcon[variant]
  const iconNode =
    icon === undefined ? (
      <Icon className={cn("size-4", accentText[variant])} aria-hidden="true" />
    ) : (
      icon
    )

  return (
    <div
      data-slot="callout"
      data-variant={variant}
      role={variant === "warning" || variant === "danger" ? "alert" : "status"}
      className={cn(calloutVariants({ variant }), className)}
    >
      {iconNode !== null && (
        <div data-slot="callout-icon" className="mt-0.5 shrink-0">
          {iconNode}
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        {title && (
          <p
            data-slot="callout-title"
            className={cn("text-sm font-semibold", accentText[variant])}
          >
            {title}
          </p>
        )}
        {children && (
          <div
            data-slot="callout-body"
            className="text-sm text-muted-foreground"
          >
            {children}
          </div>
        )}
        {actions && (
          <div
            data-slot="callout-actions"
            className="flex flex-wrap gap-2 pt-2"
          >
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}

export { Callout, calloutVariants }
