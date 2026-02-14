"use client";

import type { BodyRegion, PainSorenessEntry } from "@/types";

interface BodyMapSVGProps {
  activeEntries: PainSorenessEntry[];
  onRegionTap: (region: BodyRegion) => void;
  selectedRegion: BodyRegion | null;
}

interface RegionZone {
  region: BodyRegion;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Body map zone layout -- front view with labeled rectangular touch zones
const BODY_ZONES: RegionZone[] = [
  // Head / Neck area
  { region: "neck", label: "Neck", x: 125, y: 40, width: 50, height: 28 },
  // Shoulders
  { region: "left_shoulder", label: "L.Shldr", x: 52, y: 78, width: 60, height: 30 },
  { region: "right_shoulder", label: "R.Shldr", x: 188, y: 78, width: 60, height: 30 },
  // Chest
  { region: "chest", label: "Chest", x: 112, y: 78, width: 76, height: 36 },
  // Elbows
  { region: "left_elbow", label: "L.Elbow", x: 28, y: 148, width: 54, height: 28 },
  { region: "right_elbow", label: "R.Elbow", x: 218, y: 148, width: 54, height: 28 },
  // Wrists
  { region: "left_wrist", label: "L.Wrist", x: 12, y: 210, width: 50, height: 26 },
  { region: "right_wrist", label: "R.Wrist", x: 238, y: 210, width: 50, height: 26 },
  // Core
  { region: "core", label: "Core", x: 112, y: 118, width: 76, height: 36 },
  // Upper back
  { region: "upper_back", label: "Upper Back", x: 112, y: 158, width: 76, height: 30 },
  // Lower back
  { region: "lower_back", label: "Lower Back", x: 112, y: 192, width: 76, height: 30 },
  // Hips
  { region: "left_hip", label: "L.Hip", x: 82, y: 226, width: 52, height: 28 },
  { region: "right_hip", label: "R.Hip", x: 166, y: 226, width: 52, height: 28 },
  // Quads
  { region: "left_quad", label: "L.Quad", x: 82, y: 260, width: 52, height: 40 },
  { region: "right_quad", label: "R.Quad", x: 166, y: 260, width: 52, height: 40 },
  // Hamstrings
  { region: "left_hamstring", label: "L.Ham", x: 82, y: 304, width: 52, height: 36 },
  { region: "right_hamstring", label: "R.Ham", x: 166, y: 304, width: 52, height: 36 },
  // Knees
  { region: "left_knee", label: "L.Knee", x: 82, y: 344, width: 52, height: 30 },
  { region: "right_knee", label: "R.Knee", x: 166, y: 344, width: 52, height: 30 },
];

function getRegionColor(
  region: BodyRegion,
  activeEntries: PainSorenessEntry[],
  isSelected: boolean
): { fill: string; stroke: string } {
  const entry = activeEntries.find((e) => e.region === region);

  if (isSelected) {
    return { fill: "#3b82f6", stroke: "#2563eb" }; // blue when selected
  }

  if (!entry) {
    return { fill: "#374151", stroke: "#4b5563" }; // default gray
  }

  if (entry.sensation === "pain") {
    // Red shades based on severity
    const alphaMap: Record<number, string> = {
      1: "#ef444440",
      2: "#ef444460",
      3: "#ef444480",
      4: "#ef4444b0",
      5: "#ef4444",
    };
    return {
      fill: alphaMap[entry.severity] || "#ef4444",
      stroke: "#dc2626",
    };
  }

  // Soreness: amber/yellow shades
  const amberMap: Record<number, string> = {
    1: "#f59e0b40",
    2: "#f59e0b60",
    3: "#f59e0b80",
    4: "#f59e0bb0",
    5: "#f59e0b",
  };
  return {
    fill: amberMap[entry.severity] || "#f59e0b",
    stroke: "#d97706",
  };
}

export default function BodyMapSVG({
  activeEntries,
  onRegionTap,
  selectedRegion,
}: BodyMapSVGProps) {
  return (
    <div className="flex justify-center">
      <svg
        viewBox="0 0 300 390"
        className="w-full max-w-[300px] h-auto"
        role="img"
        aria-label="Body map for pain and soreness tracking"
      >
        {/* Body outline silhouette (simplified) */}
        <ellipse
          cx="150"
          cy="20"
          rx="22"
          ry="22"
          fill="#1f2937"
          stroke="#374151"
          strokeWidth="1"
        />

        {/* Tappable region zones */}
        {BODY_ZONES.map((zone) => {
          const colors = getRegionColor(
            zone.region,
            activeEntries,
            selectedRegion === zone.region
          );
          return (
            <g
              key={zone.region}
              onClick={() => onRegionTap(zone.region)}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`${zone.label} region`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onRegionTap(zone.region);
                }
              }}
            >
              <rect
                x={zone.x}
                y={zone.y}
                width={zone.width}
                height={zone.height}
                rx={4}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={selectedRegion === zone.region ? 2 : 1}
                className="transition-all duration-150"
              />
              <text
                x={zone.x + zone.width / 2}
                y={zone.y + zone.height / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontSize={zone.label.length > 7 ? "7" : "8"}
                fontWeight="500"
                className="pointer-events-none select-none"
              >
                {zone.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
