import { cn } from "@/lib/utils";

/** The "Imported" label on every row and sheet that shows history from another app's export. */
export function ImportedTag({ className }: { className?: string }) {
  return (
    <span
      data-slot="imported-tag"
      className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-secondary px-2 py-0.5 text-[12px] font-medium text-secondary-foreground",
        className
      )}
    >
      Imported
    </span>
  );
}
