"use client";

import { Component, Suspense, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Pause, Play, Route } from "lucide-react";
import { getMotionInfo } from "@/lib/motion/sample";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { MannequinHandle, MannequinView } from "./MannequinScene";

const Scene = dynamic(() => import("./MannequinScene"), { ssr: false });

interface MannequinProps {
  exerciseId: string;
  /** Must give the viewer a height, e.g. "h-80". */
  className?: string;
}

const VIEWS: { value: MannequinView; label: string }[] = [
  { value: "front", label: "Front" },
  { value: "threeQuarter", label: "3/4" },
  { value: "side", label: "Side" },
];

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <p className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
          The 3D demo is not available on this device.
        </p>
      );
    }
    return this.props.children;
  }
}

/**
 * Animated 3D mannequin performing one exercise, with play/pause, slow
 * motion, a scrubber, view presets and an optional path trace.
 */
export function Mannequin({ exerciseId, className }: MannequinProps) {
  const info = getMotionInfo(exerciseId);
  const handle = useRef<MannequinHandle>(null);
  const [playing, setPlaying] = useState(true);
  const [slow, setSlow] = useState(false);
  const [scrubT, setScrubT] = useState(0);
  const [showTrace, setShowTrace] = useState(true);

  if (!info) return null;

  const togglePlay = () => {
    if (playing) setScrubT(handle.current?.getT() ?? 0);
    setPlaying(!playing);
  };

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="relative min-h-0 flex-1">
        <SceneBoundary>
          <Suspense fallback={null}>
            <Scene
              exerciseId={exerciseId}
              playing={playing}
              speed={slow ? 0.4 : 1}
              scrubT={scrubT}
              showTrace={showTrace}
              handleRef={handle}
            />
          </Suspense>
        </SceneBoundary>
        <div className="absolute left-1/2 top-1 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background/80 p-1 backdrop-blur">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => handle.current?.setView(v.value)}
              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="rounded-full border border-border p-2 text-foreground"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <Slider
          aria-label="Position in the rep"
          min={0}
          max={100}
          step={1}
          value={[Math.round(scrubT * 100)]}
          onValueChange={([value]) => {
            setPlaying(false);
            setScrubT(value / 100);
          }}
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => setSlow(!slow)}
          aria-pressed={slow}
          className={cn(
            "rounded-full border border-border px-2.5 py-1 text-[11px] font-medium",
            slow ? "bg-primary/15 text-foreground" : "text-muted-foreground"
          )}
        >
          Slow
        </button>
        {info.trace && (
          <button
            type="button"
            onClick={() => setShowTrace(!showTrace)}
            aria-pressed={showTrace}
            aria-label="Show movement path"
            className={cn(
              "rounded-full border border-border p-2",
              showTrace ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <Route className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className="pt-1.5 text-center text-[11px] text-muted-foreground">{info.caption}</p>
    </div>
  );
}
