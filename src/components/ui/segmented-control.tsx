"use client"

import { useRef, useState, useEffect } from "react"
import { cn } from "@/lib/utils"

interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; icon?: React.ReactNode }[]
  className?: string
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const activeIndex = options.findIndex((o) => o.value === value)
    const buttons = container.querySelectorAll<HTMLButtonElement>("[data-segment]")
    const activeButton = buttons[activeIndex]

    if (activeButton) {
      setPillStyle({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      })
    }
  }, [value, options])

  return (
    <div
      ref={containerRef}
      className={cn("relative flex rounded-lg bg-muted/40 p-1", className)}
    >
      {/* Sliding pill */}
      <div
        className="absolute top-1 bottom-1 rounded-md bg-card shadow-sm transition-all duration-200"
        style={{
          left: pillStyle.left,
          width: pillStyle.width,
          transitionTimingFunction: "var(--ease-out-soft, cubic-bezier(0.22, 1, 0.36, 1))",
        }}
      />

      {options.map((option) => (
        <button
          key={option.value}
          data-segment
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "relative z-10 flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === option.value
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  )
}
