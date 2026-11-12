"use client";

import { Card, CardContent } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  setStoredFigureGender,
  useFigureGender,
} from "@/components/Anatomy/useFigure";
import type { FigureGender } from "@/lib/anatomy/figureTypes";

const FIGURES: { value: FigureGender; label: string }[] = [
  { value: "male", label: "Figure A" },
  { value: "female", label: "Figure B" },
];

const CREDITS: { name: string; detail: string; licence: string; url: string }[] = [
  {
    name: "3D anatomy model",
    detail:
      "Modified from body.glb by hpfrei (body-anatomy-3d-viewer), derived from the Z-Anatomy dataset. Changes: descriptive text removed, non-muscle meshes removed, meshes tagged, recompressed.",
    licence: "CC BY-SA 4.0",
    url: "https://github.com/hpfrei/body-anatomy-3d-viewer",
  },
  {
    name: "Exercise photos and how-to steps",
    detail: "free-exercise-db by yuhonas and contributors.",
    licence: "Public domain (Unlicense)",
    url: "https://github.com/yuhonas/free-exercise-db",
  },
  {
    name: "2D body figure outlines",
    detail: "Path data from react-muscle-highlighter.",
    licence: "MIT",
    url: "https://github.com/soroojshehryar/react-muscle-highlighter",
  },
  {
    name: "3D rendering",
    detail: "three.js, React Three Fiber and drei.",
    licence: "MIT",
    url: "https://threejs.org/",
  },
];

/** Settings: which 2D body figure to draw, and third-party credits. */
export default function AnatomySettings() {
  const gender = useFigureGender();

  return (
    <>
      <Card>
        <CardContent>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Body Figure
          </h2>
          <SegmentedControl value={gender} onChange={setStoredFigureGender} options={FIGURES} />
          <p className="mt-2 text-xs text-muted-foreground">
            Used for the 2D muscle and pain maps on this device. The 3D model has one figure.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Credits and Licences
          </h2>
          <ul className="space-y-3">
            {CREDITS.map((c) => (
              <li key={c.name} className="text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground underline underline-offset-2"
                  >
                    {c.name}
                  </a>
                  <span className="shrink-0 text-muted-foreground">{c.licence}</span>
                </div>
                <p className="mt-0.5 text-muted-foreground">{c.detail}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
