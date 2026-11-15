import { cn } from "@/lib/utils"

export interface StarburstProps {
  /** Number of rays (default 16). */
  rays?: number
  /** Inner gap as a fraction of the radius, 0 to 1 (default 0.12). */
  hole?: number
  /** Sets size and colour, e.g. "size-16 text-primary". */
  className?: string
}

/**
 * A mid-century starburst: thin rays from a centre, alternating long and
 * short. Drawn in currentColor. Decorative.
 */
function Starburst({ rays = 16, hole = 0.12, className }: StarburstProps) {
  const lines = Array.from({ length: rays }, (_, i) => {
    const angle = (i / rays) * Math.PI * 2
    const outer = i % 2 === 0 ? 50 : 36
    const inner = 50 * hole
    const r = (n: number) => Math.round(n * 100) / 100
    return {
      x1: r(50 + Math.cos(angle) * inner),
      y1: r(50 + Math.sin(angle) * inner),
      x2: r(50 + Math.cos(angle) * outer),
      y2: r(50 + Math.sin(angle) * outer),
    }
  })
  return (
    <svg
      data-slot="starburst"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 100 100"
      className={cn("size-16 text-primary", className)}
    >
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        {lines.map((l, i) => (
          <line key={i} {...l} />
        ))}
      </g>
      <circle cx="50" cy="50" r="2.5" fill="currentColor" />
    </svg>
  )
}

export { Starburst }
