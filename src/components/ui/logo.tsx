import type { SVGProps } from "react";

/**
 * The ReComp Life mark, concept A "Plate Sun": a bumper plate seen face-on with a
 * starburst hub. Sources and the other concepts live in docs/plans/glass-box-mockups/logo/.
 *
 * Colours come from theme tokens, with the brand palette as fallbacks. The well and the
 * sleeve stay espresso and cream in both themes so the plate reads the same everywhere;
 * the lockup's wordmark uses the surrounding text colour.
 */

export type LogoVariant = "mark" | "lockup";

export interface LogoProps
  extends Omit<SVGProps<SVGSVGElement>, "width" | "height" | "viewBox"> {
  variant?: LogoVariant;
  /** Height in pixels. The mark is square; the lockup is LOCKUP_RATIO times as wide. */
  size?: number;
}

const PLATE = "var(--logo-plate, var(--stripe-1, #ef7a4a))";
const HUB = "var(--logo-hub, var(--stripe-2, #e0a93b))";
const WELL = "var(--logo-well, #1b1512)";
const SLEEVE = "var(--logo-sleeve, #f3e9d8)";
const FONT = "var(--font-display, Jost), 'Futura PT', Futura, 'Century Gothic', sans-serif";

const STAR =
  "256,170 269.5,205.8 299,181.5 292.8,219.2 330.5,213 306.2,242.5 342,256 306.2,269.5 " +
  "330.5,299 292.8,292.8 299,330.5 269.5,306.2 256,342 242.5,306.2 213,330.5 219.2,292.8 " +
  "181.5,299 205.8,269.5 170,256 205.8,242.5 181.5,213 219.2,219.2 213,181.5 242.5,205.8";

/** The mark is drawn on a 512 grid; this crop holds the plate with a little air. */
const MARK_VIEWBOX = "64 64 384 384";
const LOCKUP_W = 640;
const LOCKUP_H = 120;
export const LOCKUP_RATIO = LOCKUP_W / LOCKUP_H;

function PlateSun() {
  return (
    <g data-part="plate">
      <circle cx="256" cy="256" r="184" fill={PLATE} />
      <circle cx="256" cy="256" r="160" fill="none" stroke={WELL} strokeWidth="10" />
      <circle cx="256" cy="256" r="104" fill={WELL} />
      <polygon points={STAR} fill={HUB} />
      <circle cx="256" cy="256" r="26" fill={SLEEVE} />
    </g>
  );
}

export function Logo({ variant = "mark", size = 32, ...rest }: LogoProps) {
  if (variant === "mark") {
    return (
      <svg
        role="img"
        aria-label="ReComp Life"
        viewBox={MARK_VIEWBOX}
        width={size}
        height={size}
        {...rest}
      >
        <PlateSun />
      </svg>
    );
  }
  return (
    <svg
      role="img"
      aria-label="ReComp Life"
      viewBox={`0 0 ${LOCKUP_W} ${LOCKUP_H}`}
      width={Math.round(size * LOCKUP_RATIO * 100) / 100}
      height={size}
      {...rest}
    >
      <svg x="0" y="0" width={LOCKUP_H} height={LOCKUP_H} viewBox={MARK_VIEWBOX}>
        <PlateSun />
      </svg>
      <text
        x="148"
        y="82"
        fontSize="58"
        fill="currentColor"
        textLength={LOCKUP_W - 152}
        lengthAdjust="spacing"
        style={{ fontFamily: FONT }}
        aria-hidden="true"
      >
        <tspan fontWeight={700}>RECOMP</tspan>
        <tspan fontWeight={400}> LIFE</tspan>
      </text>
    </svg>
  );
}
