"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { FigureData, FigureGender } from "@/lib/anatomy/figureTypes";
import { maleFigure } from "./figure/paths.male";

/**
 * Which 2D body figure to draw. A per-device display preference, so it lives
 * in localStorage (like the body-check dismissals) and is not synced.
 */

const STORAGE_KEY = "recomp-figure";
const CHANGE_EVENT = "recomp-figure-change";

export function getStoredFigureGender(): FigureGender {
  if (typeof window === "undefined") return "male";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "female" ? "female" : "male";
  } catch {
    return "male";
  }
}

export function setStoredFigureGender(gender: FigureGender): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, gender);
  } catch {
    // Storage unavailable: the choice applies until reload.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useFigureGender(): FigureGender {
  return useSyncExternalStore(subscribe, getStoredFigureGender, () => "male");
}

/**
 * The figure path data for the chosen body. The male figure is bundled; the
 * female one is loaded on demand and the male figure shows until it arrives.
 */
export function useFigure(): FigureData {
  const gender = useFigureGender();
  const [female, setFemale] = useState<FigureData | null>(null);

  useEffect(() => {
    if (gender !== "female" || female) return;
    let cancelled = false;
    import("./figure/paths.female").then((m) => {
      if (!cancelled) setFemale(m.femaleFigure);
    });
    return () => {
      cancelled = true;
    };
  }, [gender, female]);

  return gender === "female" && female ? female : maleFigure;
}
