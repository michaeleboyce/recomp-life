import { cn } from "@/lib/utils"
import { getExerciseMedia } from "@/lib/exerciseMedia"

/** Source photo size (all exercise photos are 850×567). */
const PHOTO_WIDTH = 850
const PHOTO_HEIGHT = 567

/** True when the exercise has a photo, so callers can fall back to the figure. */
export function hasExercisePhoto(exerciseId: string): boolean {
  return getExerciseMedia(exerciseId) !== null
}

export type ExerciseImageVariant = "hero" | "arch" | "thumb"

const VARIANT: Record<ExerciseImageVariant, string> = {
  // Full-width banner; the caller may stretch it with className (e.g. "absolute inset-0").
  hero: "w-full aspect-[850/567]",
  // Rounded top, small bottom corners, as on the progress cards.
  arch: "w-24 h-22 rounded-t-full rounded-b-[14px]",
  thumb: "size-12 rounded-xl",
}

export interface ExerciseImageProps {
  exerciseId: string
  variant: ExerciseImageVariant
  /** Which of the two photos: 0 start position (default), 1 end position. */
  frame?: 0 | 1
  /** Leave empty (default) when the image is decorative next to the exercise name. */
  alt?: string
  /** CSS object-position, to keep the lifter in frame, e.g. "30% 38%". */
  position?: string
  /** Hero only: fade the bottom into the page background (default true). */
  fade?: boolean
  className?: string
}

/**
 * An exercise photo in the house style: greyscale with a colour layer in
 * `--photo-tint`. Renders nothing when the exercise has no photo; check
 * `hasExercisePhoto` to show something else instead.
 */
function ExerciseImage({
  exerciseId,
  variant,
  frame = 0,
  alt = "",
  position,
  fade = true,
  className,
}: ExerciseImageProps) {
  const media = getExerciseMedia(exerciseId)
  if (!media) return null

  return (
    <span
      data-slot="exercise-image"
      data-variant={variant}
      className={cn("relative block shrink-0 overflow-hidden bg-secondary", VARIANT[variant], className)}
    >
      {/* Plain <img>: local files that must work offline and in the static iPhone build. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={media.frames[frame]}
        alt={alt}
        width={PHOTO_WIDTH}
        height={PHOTO_HEIGHT}
        loading={variant === "hero" ? "eager" : "lazy"}
        decoding="async"
        className="absolute inset-0 block size-full object-cover grayscale"
        style={position ? { objectPosition: position } : undefined}
      />
      <span
        aria-hidden="true"
        data-slot="photo-tint"
        className="absolute inset-0 bg-[var(--photo-tint)] mix-blend-color"
      />
      {variant === "hero" && fade && (
        <span
          aria-hidden="true"
          data-slot="photo-fade"
          className="absolute inset-0 bg-linear-to-b from-background/50 via-background/10 via-35% to-background"
        />
      )}
    </span>
  )
}

export { ExerciseImage }
