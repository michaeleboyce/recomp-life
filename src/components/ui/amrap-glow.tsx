import { cn } from "@/lib/utils"

interface AMRAPGlowProps {
  active: boolean
  children: React.ReactNode
  className?: string
}

export function AMRAPGlow({ active, children, className }: AMRAPGlowProps) {
  return (
    <div
      className={cn(
        "rounded-xl border transition-all",
        active && "animate-[amrap-glow_2s_ease-in-out_infinite]",
        className
      )}
    >
      {children}
    </div>
  )
}
