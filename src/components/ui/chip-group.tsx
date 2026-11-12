"use client"

import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const chipVariants = cva(
  "inline-flex min-h-[44px] items-center justify-center rounded-full border font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
  {
    variants: {
      size: {
        sm: "px-3 text-xs",
        md: "px-4 text-sm",
      },
      selected: {
        true: "border-primary bg-primary/15 text-primary",
        false: "border-border bg-transparent text-muted-foreground hover:text-foreground",
      },
    },
    defaultVariants: { size: "md", selected: false },
  }
)

interface ChipOption {
  value: string
  label: string
}

function ChipGroup({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  className,
}: {
  options: ChipOption[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  size?: "sm" | "md"
  className?: string
}) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = options.findIndex((o) => o.value === value)
  const tabbableIndex = selectedIndex >= 0 ? selectedIndex : 0

  function move(from: number, delta: number) {
    const next = (from + delta + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault()
        move(index, 1)
        break
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault()
        move(index, -1)
        break
      case "Home":
        event.preventDefault()
        move(0, 0)
        break
      case "End":
        event.preventDefault()
        move(options.length - 1, 0)
        break
    }
  }

  return (
    <div
      data-slot="chip-group"
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === tabbableIndex ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={chipVariants({ size, selected })}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export { ChipGroup, chipVariants }
