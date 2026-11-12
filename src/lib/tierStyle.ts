import type { Tier } from "@/types";

export interface TierStyle {
  label: string;
  solid: string;
  soft: string;
  text: string;
  border: string;
  dot: string;
  dotMuted: string;
}

// Class strings are complete literals so Tailwind can see them.
// `solid` pairs white text (light mode) with the page background colour in dark
// mode, where the tier colours are light enough that white would fail contrast.
const STYLES: Record<Tier, TierStyle> = {
  T1: {
    label: "T1",
    solid: "bg-tier-t1 text-white dark:text-background",
    soft: "bg-tier-t1-soft text-tier-t1",
    text: "text-tier-t1",
    border: "border-tier-t1",
    dot: "bg-tier-t1",
    dotMuted: "bg-tier-t1-soft",
  },
  T2: {
    label: "T2",
    solid: "bg-tier-t2 text-white dark:text-background",
    soft: "bg-tier-t2-soft text-tier-t2",
    text: "text-tier-t2",
    border: "border-tier-t2",
    dot: "bg-tier-t2",
    dotMuted: "bg-tier-t2-soft",
  },
  T3: {
    label: "T3",
    solid: "bg-tier-t3 text-white dark:text-background",
    soft: "bg-tier-t3-soft text-tier-t3",
    text: "text-tier-t3",
    border: "border-tier-t3",
    dot: "bg-tier-t3",
    dotMuted: "bg-tier-t3-soft",
  },
  accessory: {
    label: "Accessory",
    solid: "bg-tier-accessory text-white dark:text-background",
    soft: "bg-tier-accessory-soft text-tier-accessory",
    text: "text-tier-accessory",
    border: "border-tier-accessory",
    dot: "bg-tier-accessory",
    dotMuted: "bg-tier-accessory-soft",
  },
  warmup: {
    label: "Warm-up",
    solid: "bg-tier-warmup text-white dark:text-background",
    soft: "bg-tier-warmup-soft text-tier-warmup",
    text: "text-tier-warmup",
    border: "border-tier-warmup",
    dot: "bg-tier-warmup",
    dotMuted: "bg-tier-warmup-soft",
  },
};

export function tierStyle(tier: Tier): TierStyle {
  return STYLES[tier];
}
