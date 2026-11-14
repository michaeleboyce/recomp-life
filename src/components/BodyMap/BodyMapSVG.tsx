"use client";

import type { KeyboardEvent } from "react";
import type { BodyRegion, PainSorenessEntry } from "@/types";
import type { FigureShape, FigureViewName } from "@/lib/anatomy/figureTypes";
import {
  ALL_BODY_REGIONS,
  REGION_TARGETS,
  jointPosition,
  regionForShape,
  type BodySide,
  type JointName,
} from "@/lib/anatomy/regionMapping";
import { BODY_MAP_COLORS, painFill } from "@/lib/anatomy/palette";
import { formatRegion } from "@/lib/painModifications";
import { BodyFigure, type ShapeStyle } from "@/components/Anatomy/BodyFigure";
import { useFigure } from "@/components/Anatomy/useFigure";

interface BodyMapSVGProps {
  activeEntries: PainSorenessEntry[];
  onRegionTap: (region: BodyRegion) => void;
  selectedRegion: BodyRegion | null;
}

/** A tappable region with nothing logged. Matches the page legend swatch. */
const NO_ENTRY = { fill: BODY_MAP_COLORS.region, stroke: BODY_MAP_COLORS.regionStroke };
const SELECTED = { fill: BODY_MAP_COLORS.selected, stroke: BODY_MAP_COLORS.selectedStroke };
/** Ring around joint dots so they read as tappable markers, not muscle. */
const JOINT_RING = BODY_MAP_COLORS.jointRing;

/** Joint marker sizes in view-box units (the figure is ~724 wide). */
const JOINT_HIT_RADIUS = 62;
const JOINT_DOT_RADIUS = 26;

const VIEWS: { name: FigureViewName; caption: string }[] = [
  { name: "front", caption: "Front" },
  { name: "back", caption: "Back" },
];

/** The most recent entry for each region. */
function latestByRegion(
  entries: PainSorenessEntry[]
): Partial<Record<BodyRegion, PainSorenessEntry>> {
  const latest: Partial<Record<BodyRegion, PainSorenessEntry>> = {};
  for (const entry of entries) {
    const prev = latest[entry.region];
    if (!prev || new Date(prev.date).getTime() < new Date(entry.date).getTime()) {
      latest[entry.region] = entry;
    }
  }
  return latest;
}

function regionColors(
  entry: PainSorenessEntry | undefined,
  isSelected: boolean
): { fill: string; stroke: string } {
  if (isSelected) return SELECTED;
  if (!entry) return NO_ENTRY;
  return painFill(entry.sensation, entry.severity);
}

interface JointMarker {
  region: BodyRegion;
  joint: JointName;
  side: BodySide;
}

function jointMarkers(view: FigureViewName): JointMarker[] {
  const markers: JointMarker[] = [];
  for (const region of ALL_BODY_REGIONS) {
    for (const target of REGION_TARGETS[region]) {
      if (target.kind === "joint" && target.view === view) {
        markers.push({ region, joint: target.joint, side: target.side });
      }
    }
  }
  return markers;
}

/**
 * Body map for logging pain and soreness. Muscle areas are tappable; elbows,
 * wrists and hips, which have no area of their own, are tappable joint dots.
 */
export default function BodyMapSVG({
  activeEntries,
  onRegionTap,
  selectedRegion,
}: BodyMapSVGProps) {
  const figure = useFigure();
  const latest = latestByRegion(activeEntries);

  const styleFor = (viewName: FigureViewName) => (shape: FigureShape): ShapeStyle | undefined => {
    const region = regionForShape(viewName, shape.slug, shape.side);
    if (!region) return undefined;
    const isSelected = selectedRegion === region;
    const c = regionColors(latest[region], isSelected);
    return { fill: c.fill, stroke: c.stroke, strokeWidth: isSelected ? 1.75 : 0.75 };
  };

  const labelFor = (viewName: FigureViewName) => (shape: FigureShape) => {
    const region = regionForShape(viewName, shape.slug, shape.side);
    return region ? `${formatRegion(region)} region` : undefined;
  };

  return (
    <div
      className="flex justify-center gap-4"
      role="group"
      aria-label="Body map for pain and soreness tracking"
    >
      {VIEWS.map(({ name, caption }) => (
        <div key={name} className="flex flex-col items-center gap-1.5">
          <div className="h-[330px] max-h-[62vh]">
            <BodyFigure
              view={figure[name]}
              label={`${caption} of body`}
              styleFor={styleFor(name)}
              labelFor={labelFor(name)}
              onShapePress={(shape) => {
                const region = regionForShape(name, shape.slug, shape.side);
                if (region) onRegionTap(region);
              }}
            >
              {jointMarkers(name).map(({ region, joint, side }) => {
                const p = jointPosition(figure[name], name, joint, side);
                if (!p) return null;
                const isSelected = selectedRegion === region;
                const c = regionColors(latest[region], isSelected);
                return (
                  <g
                    key={`${joint}-${side}`}
                    data-joint={joint}
                    data-side={side}
                    role="button"
                    tabIndex={0}
                    aria-label={`${formatRegion(region)} region`}
                    onClick={() => onRegionTap(region)}
                    onKeyDown={(e: KeyboardEvent<SVGGElement>) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRegionTap(region);
                      }
                    }}
                    className="cursor-pointer outline-none [&:focus-visible>circle:last-child]:stroke-ring!"
                  >
                    <circle cx={p.x} cy={p.y} r={JOINT_HIT_RADIUS} fill="transparent" />
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={JOINT_DOT_RADIUS}
                      style={{ fill: c.fill, stroke: isSelected ? c.stroke : JOINT_RING }}
                      strokeWidth={isSelected ? 2 : 1.5}
                      vectorEffect="non-scaling-stroke"
                      className="transition-[fill,stroke] duration-200"
                    />
                  </g>
                );
              })}
            </BodyFigure>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {caption}
          </span>
        </div>
      ))}
    </div>
  );
}
