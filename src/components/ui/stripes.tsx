import { cn } from "@/lib/utils"

const STRIPES = ["bg-[var(--stripe-1)]", "bg-[var(--stripe-2)]", "bg-[var(--stripe-3)]"]

/** Three thin coloured bands under a display heading. Decorative. */
function Stripes({ className }: { className?: string }) {
  return (
    <span
      data-slot="stripes"
      aria-hidden="true"
      className={cn("flex w-21 flex-col gap-[3px]", className)}
    >
      {STRIPES.map((bg) => (
        <i key={bg} className={cn("block h-1 rounded-sm", bg)} />
      ))}
    </span>
  )
}

export { Stripes }
