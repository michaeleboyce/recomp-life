import * as React from "react"

import { cn } from "@/lib/utils"
import { tierStyle } from "@/lib/tierStyle"
import type { Tier } from "@/types"

function TierBadge({
  tier,
  variant = "solid",
  className,
}: {
  tier: Tier
  variant?: "solid" | "soft"
  className?: string
}) {
  const style = tierStyle(tier)
  return (
    <span
      data-slot="tier-badge"
      data-tier={tier}
      data-variant={variant}
      className={cn(
        "inline-flex w-fit shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-xs font-medium",
        variant === "solid" ? style.solid : style.soft,
        className
      )}
    >
      {style.label}
    </span>
  )
}

export { TierBadge }
