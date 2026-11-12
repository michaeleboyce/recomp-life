import * as React from "react"
import { Dumbbell, Home } from "lucide-react"

import { cn } from "@/lib/utils"
import type { WorkoutLocation } from "@/types"

const LOCATION = {
  gym: { label: "Gym", Icon: Dumbbell, className: "bg-accent-primary-soft text-accent-primary" },
  home: { label: "Home", Icon: Home, className: "bg-info-soft text-info" },
} as const

/**
 * Which training location is in effect. Same look everywhere: gym in the accent
 * colour, home in the info colour.
 */
function LocationChip({
  location,
  size = "md",
  detail,
  className,
}: {
  location: WorkoutLocation
  size?: "sm" | "md"
  /** Extra context, e.g. "80 lb dumbbells". */
  detail?: React.ReactNode
  className?: string
}) {
  const { label, Icon, className: tone } = LOCATION[location]
  return (
    <span
      data-slot="location-chip"
      data-location={location}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        tone,
        className
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} aria-hidden="true" />
      <span>{label}</span>
      {detail && (
        <>
          <span aria-hidden="true" className="opacity-60">
            ·
          </span>
          <span className="font-medium opacity-80">{detail}</span>
        </>
      )}
    </span>
  )
}

export { LocationChip }
