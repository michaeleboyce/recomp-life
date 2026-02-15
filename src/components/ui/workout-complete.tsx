"use client"

import { useEffect, useState } from "react"
import { AnimatedNumber } from "./animated-number"

interface WorkoutCompleteProps {
  setsCompleted: number
  duration: string
}

export function WorkoutComplete({ setsCompleted, duration }: WorkoutCompleteProps) {
  const [showCheck, setShowCheck] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShowCheck(true), 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-6">
      {/* Animated checkmark */}
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 24 24" className="w-full h-full">
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke="oklch(0.65 0.10 160 / 0.2)"
            strokeWidth="1.5"
          />
          <path
            d="M7 13l3 3 7-7"
            fill="none"
            stroke="oklch(0.65 0.10 160)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="24"
            strokeDashoffset={showCheck ? "0" : "24"}
            style={{
              transition: "stroke-dashoffset 500ms cubic-bezier(0.22, 1, 0.36, 1)",
              transitionDelay: "200ms",
            }}
          />
        </svg>
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Workout Complete</h2>
        <p className="text-muted-foreground">
          <AnimatedNumber value={setsCompleted} suffix=" sets" /> &middot; {duration}
        </p>
      </div>
    </div>
  )
}
