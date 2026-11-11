import * as React from "react"

import { cn } from "@/lib/utils"

function Stagger({
  children,
  stepMs = 50,
  className,
}: {
  children: React.ReactNode
  stepMs?: number
  className?: string
}) {
  // toArray drops null/undefined/boolean children, so they use no delay step.
  const items = React.Children.toArray(children)
  return (
    <div data-slot="stagger" className={className}>
      {items.map((child, index) => (
        <div
          key={React.isValidElement(child) && child.key != null ? child.key : index}
          className={cn(
            "animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
          )}
          style={{
            animationDelay: `${index * stepMs}ms`,
            animationDuration: "300ms",
          }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}

export { Stagger }
