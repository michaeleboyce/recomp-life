export const DEFAULT_EMPTY_MESSAGE = "No data in this range yet.";

/** The quiet inline message a chart shows instead of an empty frame. */
export function ChartEmpty({ message, height }: { message?: string; height?: number }) {
  return (
    <p
      className="flex items-center text-xs text-muted-foreground"
      style={{ minHeight: height ? Math.min(height, 64) : undefined }}
    >
      {message ?? DEFAULT_EMPTY_MESSAGE}
    </p>
  );
}
