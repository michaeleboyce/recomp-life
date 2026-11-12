import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

export type DeltaBetter = "up" | "down" | "none"

const deltaVariants = cva("font-mono text-xs font-medium tabular-nums", {
  variants: {
    tone: {
      good: "text-success",
      bad: "text-warning",
      neutral: "text-muted-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
})

function defaultFormat(abs: number): string {
  return Number.isInteger(abs) ? String(abs) : abs.toFixed(1)
}

function toneFor(value: number, better: DeltaBetter) {
  if (value === 0 || better === "none") return "neutral" as const
  const improving = better === "up" ? value > 0 : value < 0
  return improving ? ("good" as const) : ("bad" as const)
}

function Delta({
  value,
  unit,
  better = "none",
  suffix,
  format = defaultFormat,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  value: number
  unit?: string
  better?: DeltaBetter
  suffix?: string
  /** Formats the absolute value; the sign is added by the component. */
  format?: (abs: number) => string
}) {
  const abs = format(Math.abs(value))
  const tail = [unit, suffix].filter(Boolean).join(" ")
  const sign = value > 0 ? "+" : value < 0 ? "−" : ""
  const text = `${sign}${abs}${tail ? ` ${tail}` : ""}`
  const label =
    value === 0
      ? "no change"
      : `${value > 0 ? "up" : "down"} ${abs}${tail ? ` ${tail}` : ""}`

  return (
    <span
      data-slot="delta"
      aria-label={label}
      className={cn(deltaVariants({ tone: toneFor(value, better) }), className)}
      {...props}
    >
      {text}
    </span>
  )
}

export { Delta, deltaVariants }
