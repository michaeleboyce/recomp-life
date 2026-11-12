"use client";

import {
  Component,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { Bone } from "lucide-react";
import type { MuscleId } from "@/types";
import type { MuscleHeat } from "@/lib/muscleLoad";
import { cn } from "@/lib/utils";
import { MuscleMap } from "./MuscleMap";
import type { Anatomy3DHandle } from "./Anatomy3DScene";

const Scene = dynamic(() => import("./Anatomy3DScene"), { ssr: false });

interface Anatomy3DProps {
  heat?: MuscleHeat;
  colors?: Partial<Record<MuscleId, string>>;
  selected?: MuscleId | null;
  onMusclePress?: (muscle: MuscleId) => void;
  /** "horizontal" (default) keeps page scrolling working; "free" for a dedicated screen. */
  orbit?: "horizontal" | "free";
  initialView?: "front" | "back";
  /** Show the front/back and skeleton buttons. */
  controls?: boolean;
  /** Must give the viewer a height, e.g. "h-80". */
  className?: string;
  label?: string;
}

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

class SceneBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Rotatable 3D anatomy model coloured by muscle. Shows the 2D muscle map while
 * the model loads, and keeps it if WebGL is unavailable or the model fails.
 */
export function Anatomy3D({
  heat,
  colors,
  selected,
  onMusclePress,
  orbit = "horizontal",
  initialView = "front",
  controls = true,
  className,
  label = "3D muscle map",
}: Anatomy3DProps) {
  // null until checked on the client; the 2D map covers the gap.
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const handle = useRef<Anatomy3DHandle>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );

  useEffect(() => {
    // One-time capability probe; there is no external store to subscribe to.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebgl(detectWebGL());
  }, []);

  const fallback = (
    <MuscleMap
      heat={heat}
      colors={colors}
      selected={selected}
      onMusclePress={onMusclePress}
      className="h-full"
      label={label}
    />
  );

  if (webgl !== true) {
    return (
      <div className={cn("relative", className)} data-anatomy="2d">
        {fallback}
      </div>
    );
  }

  return (
    <div
      className={cn("relative", className)}
      data-anatomy={ready ? "3d" : "loading"}
      role="group"
      aria-label={label}
    >
      {!ready && <div className="absolute inset-0">{fallback}</div>}
      <SceneBoundary fallback={fallback}>
        <Suspense fallback={null}>
          <div
            className={cn(
              "absolute inset-0 transition-opacity",
              reducedMotion ? "duration-0" : "duration-500",
              ready ? "opacity-100" : "opacity-0"
            )}
          >
            <Scene
              heat={heat}
              colors={colors}
              selected={selected}
              onMusclePress={onMusclePress}
              orbit={orbit}
              initialView={initialView}
              showSkeleton={showSkeleton}
              reducedMotion={reducedMotion}
              onReady={() => setReady(true)}
              handleRef={handle}
            />
          </div>
        </Suspense>
      </SceneBoundary>

      {controls && ready && (
        <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background/80 p-1 backdrop-blur">
          {(["front", "back"] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => handle.current?.setView(view)}
              className="rounded-full px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              {view === "front" ? "Front" : "Back"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowSkeleton((v) => !v)}
            aria-pressed={showSkeleton}
            aria-label="Show skeleton"
            className={cn(
              "rounded-full p-1.5",
              showSkeleton ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <Bone className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
