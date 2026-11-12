"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { getExerciseMedia } from "@/lib/exerciseMedia";
import { cn } from "@/lib/utils";

interface ExercisePhotosProps {
  exerciseId: string;
  /** Must give the viewer a height, e.g. "h-72". */
  className?: string;
}

const HOLD_MS = 1400;

/**
 * Two reference photos (start and end of the movement) cross-faded in a loop.
 * Renders nothing when the exercise has no photos.
 */
export function ExercisePhotos({ exerciseId, className }: ExercisePhotosProps) {
  const media = getExerciseMedia(exerciseId);
  const [frame, setFrame] = useState<0 | 1>(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || !media) return;
    const id = window.setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), HOLD_MS);
    return () => window.clearInterval(id);
  }, [playing, media]);

  if (!media) return null;

  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-black", className)}>
      {media.frames.map((src, i) => (
        // Plain <img>: these are small local files that must work offline.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={`${media.sourceName}: position ${i + 1} of 2`}
          className={cn(
            "absolute inset-0 h-full w-full object-contain transition-opacity duration-500",
            frame === i ? "opacity-100" : "opacity-0"
          )}
        />
      ))}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent px-2 pb-2 pt-6">
        <div className="flex items-center gap-1 rounded-full bg-black/50 p-1">
          {/* Numbered, not "start/end": the source photos are not always in that order. */}
          {(["1", "2"] as const).map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setPlaying(false);
                setFrame(i as 0 | 1);
              }}
              aria-pressed={frame === i}
              aria-label={`Show position ${label}`}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium",
                frame === i ? "bg-white text-black" : "text-white/80"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause" : "Play"}
          className="rounded-full bg-black/50 p-2 text-white"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
