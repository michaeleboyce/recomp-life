import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-md bg-[oklch(0.22_0.005_260)]",
        "bg-[length:200%_100%] bg-[linear-gradient(90deg,oklch(0.22_0.005_260)_25%,oklch(0.28_0.005_260)_50%,oklch(0.22_0.005_260)_75%)]",
        "animate-[shimmer_1.5s_ease-in-out_infinite]",
        className
      )}
      {...props}
    />
  )
}

function SkeletonText({ className, width = "60%" }: { className?: string; width?: string }) {
  return <Skeleton className={cn("h-4", className)} style={{ width }} />
}

function SkeletonStat({ className }: { className?: string }) {
  return <Skeleton className={cn("h-8 w-24", className)} />
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 space-y-3", className)}>
      <SkeletonText width="40%" />
      <SkeletonText width="80%" />
      <SkeletonText width="60%" />
    </div>
  )
}

export { Skeleton, SkeletonText, SkeletonStat, SkeletonCard }
