# Visual System Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply a comprehensive visual system (typography, color, spacing, animation, components) to every page of ReComp Life, transforming the app from default scaffolding into a calm, zen, premium aesthetic.

**Architecture:** Pure CSS/component-level changes. No business logic, data flow, or store modifications. Foundation tokens in `globals.css`, then component updates, then page-by-page application. Each task is independently testable via visual inspection.

**Tech Stack:** Next.js 16, Tailwind v4, shadcn/ui, CVA, Plus Jakarta Sans + JetBrains Mono (Google Fonts)

**Design doc:** `docs/plans/2026-02-14-visual-system-overhaul-design.md`

---

## Phase 1: Foundation

### Task 1: Install Fonts

**Files:**
- Modify: `src/app/layout.tsx`

**Step 1: Update layout.tsx to use new fonts**

Replace Geist/Geist_Mono imports with Plus Jakarta Sans and JetBrains Mono via `next/font/google`:

```tsx
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});
```

Update the `<body>` className to use new font variables:
```tsx
className={`${plusJakarta.variable} ${jetbrainsMono.variable} antialiased`}
```

**Step 2: Update globals.css font references**

In `src/app/globals.css`, change the `@theme inline` block:
```css
--font-sans: var(--font-sans);
--font-mono: var(--font-mono);
```

These match the CSS variable names set by `next/font/google` above. Remove the old `--font-geist-sans` and `--font-geist-mono` references.

**Step 3: Verify in browser**

Run: `npx next dev`
Open the app — all text should now render in Plus Jakarta Sans, all `font-mono` elements in JetBrains Mono. Check Dashboard, Settings, and Active Workout pages.

**Step 4: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat(design): replace Geist with Plus Jakarta Sans + JetBrains Mono"
```

---

### Task 2: Color Tokens

**Files:**
- Modify: `src/app/globals.css`

**Step 1: Add accent and semantic color tokens**

Add these custom properties inside the `.dark` block in `globals.css`. Also add a `--card-raised` token:

```css
.dark {
  --background: oklch(0.13 0.005 260);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.18 0.005 260);
  --card-foreground: oklch(0.985 0 0);
  --card-raised: oklch(0.22 0.005 260);
  --popover: oklch(0.18 0.005 260);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.65 0.10 160);
  --primary-foreground: oklch(0.98 0 0);
  --secondary: oklch(0.22 0.005 260);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.22 0.005 260);
  --muted-foreground: oklch(0.55 0.01 260);
  --accent: oklch(0.22 0.005 260);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.65 0.20 25);
  --border: oklch(1 0 0 / 8%);
  --input: oklch(1 0 0 / 12%);
  --ring: oklch(0.65 0.10 160);
  --chart-1: oklch(0.65 0.10 160);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);

  /* Custom accent tokens */
  --accent-primary: oklch(0.65 0.10 160);
  --accent-primary-soft: oklch(0.65 0.10 160 / 15%);
  --accent-primary-dim: oklch(0.55 0.08 160);

  /* Semantic colors */
  --success: oklch(0.65 0.15 145);
  --warning: oklch(0.75 0.15 85);
  --info: oklch(0.60 0.10 250);
}
```

**Step 2: Add card-raised to theme inline block**

In the `@theme inline` block, add:
```css
--color-card-raised: var(--card-raised);
--color-accent-primary: var(--accent-primary);
--color-accent-primary-soft: var(--accent-primary-soft);
--color-accent-primary-dim: var(--accent-primary-dim);
--color-success: var(--success);
--color-warning: var(--warning);
--color-info: var(--info);
```

**Step 3: Update light theme `:root` to match**

Update `:root` with light-mode equivalents that complement the sage accent:
```css
:root {
  --primary: oklch(0.45 0.10 160);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.45 0.10 160);
  --card-raised: oklch(0.97 0.005 260);
  --accent-primary: oklch(0.45 0.10 160);
  --accent-primary-soft: oklch(0.45 0.10 160 / 10%);
  --accent-primary-dim: oklch(0.38 0.08 160);
  --success: oklch(0.50 0.15 145);
  --warning: oklch(0.60 0.15 85);
  --info: oklch(0.50 0.10 250);
}
```
Keep all other `:root` values that aren't listed here unchanged.

**Step 4: Verify in browser**

The app should now have a subtly blue-shifted dark background, sage-colored primary buttons and active states. Check the START WORKOUT button, bottom nav active state, and toggle switches.

**Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): add sage accent color system with blue-shifted dark neutrals"
```

---

### Task 3: Animation Tokens + Spacing Standardization

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Step 1: Add animation tokens to globals.css**

Add to the `@theme inline` block:
```css
--ease-out-soft: cubic-bezier(0.22, 1, 0.36, 1);
--duration-fast: 150ms;
--duration-normal: 300ms;
--duration-slow: 500ms;
```

**Step 2: Add shimmer keyframe and AMRAP glow keyframe**

Add after the `@layer base` block:
```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes amrap-glow {
  0%, 100% { border-color: oklch(0.65 0.10 160 / 0.15); box-shadow: 0 0 0 0 oklch(0.65 0.10 160 / 0); }
  50% { border-color: oklch(0.65 0.10 160 / 0.4); box-shadow: 0 0 12px 0 oklch(0.65 0.10 160 / 0.1); }
}

@keyframes checkmark-draw {
  0% { stroke-dashoffset: 24; }
  100% { stroke-dashoffset: 0; }
}

@keyframes radial-pulse {
  0% { transform: scale(1); opacity: 0.4; }
  100% { transform: scale(2.5); opacity: 0; }
}
```

**Step 3: Update root layout padding**

In `src/app/layout.tsx`, change the wrapper div:
```tsx
<div className="min-h-screen pb-28">
```
(Change `pb-20` to `pb-28` for standardized bottom nav clearance.)

**Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(design): add animation tokens, keyframes, and standardized layout spacing"
```

---

## Phase 2: Core Components

### Task 4: Card Variants

**Files:**
- Modify: `src/components/ui/card.tsx`

**Step 1: Add CVA variants to Card component**

Import CVA and add a `variant` prop:

```tsx
import { cva, type VariantProps } from "class-variance-authority"

const cardVariants = cva(
  "flex flex-col gap-6 rounded-xl py-6 text-card-foreground",
  {
    variants: {
      variant: {
        default: "bg-card border shadow-none",
        raised: "bg-card-raised border shadow-sm",
        flat: "bg-transparent border-0 shadow-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)
```

Update the `Card` function signature:
```tsx
function Card({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  )
}
```

Export `cardVariants` alongside existing exports.

**Step 2: Update CardContent default padding**

Change CardContent's default padding from `px-6` to `px-5`:
```tsx
className={cn("px-5", className)}
```

**Step 3: Verify**

Existing cards should render identically (the `default` variant matches the current styling minus `shadow-sm` — note: current Card has `shadow-sm`, so `default` variant drops it to `shadow-none`. This is intentional per design doc.).

**Step 4: Commit**

```bash
git add src/components/ui/card.tsx
git commit -m "feat(design): add Card variants (default, raised, flat) with CVA"
```

---

### Task 5: Skeleton Component

**Files:**
- Create: `src/components/ui/skeleton.tsx`

**Step 1: Create the skeleton component**

```tsx
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-md bg-[oklch(0.22_0.005_260)]",
        "bg-[length:200%_100%] bg-[linear-gradient(90deg,oklch(0.22_0.005_260)_25%,oklch(0.28_0.005_260)_50%,oklch(0.22_0.005_260)_75%)]",
        "animate-[shimmer_1.5s_ease-in-out_infinite]",
        className
      )}
      {...props}
    />
  )
}

function SkeletonText({ className, width = "60%" }: { className?: string; width?: string }) {
  return <Skeleton className={cn("h-4", className)} style={{ width }} />
}

function SkeletonStat({ className }: { className?: string }) {
  return <Skeleton className={cn("h-8 w-24", className)} />
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 space-y-3", className)}>
      <SkeletonText width="40%" />
      <SkeletonText width="80%" />
      <SkeletonText width="60%" />
    </div>
  )
}

export { Skeleton, SkeletonText, SkeletonStat, SkeletonCard }
```

**Step 2: Commit**

```bash
git add src/components/ui/skeleton.tsx
git commit -m "feat(design): add Skeleton shimmer loader components"
```

---

### Task 6: SegmentedControl Component

**Files:**
- Create: `src/components/ui/segmented-control.tsx`

**Step 1: Create the component**

```tsx
"use client"

import { useRef, useState, useEffect } from "react"
import { cn } from "@/lib/utils"

interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; icon?: React.ReactNode }[]
  className?: string
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const activeIndex = options.findIndex((o) => o.value === value)
    const buttons = container.querySelectorAll<HTMLButtonElement>("[data-segment]")
    const activeButton = buttons[activeIndex]

    if (activeButton) {
      setPillStyle({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      })
    }
  }, [value, options])

  return (
    <div
      ref={containerRef}
      className={cn("relative flex rounded-lg bg-muted/40 p-1", className)}
    >
      {/* Sliding pill */}
      <div
        className="absolute top-1 bottom-1 rounded-md bg-card shadow-sm transition-all duration-200"
        style={{
          left: pillStyle.left,
          width: pillStyle.width,
          transitionTimingFunction: "var(--ease-out-soft, cubic-bezier(0.22, 1, 0.36, 1))",
        }}
      />

      {options.map((option) => (
        <button
          key={option.value}
          data-segment
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "relative z-10 flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === option.value
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/ui/segmented-control.tsx
git commit -m "feat(design): add SegmentedControl with sliding pill animation"
```

---

### Task 7: Enhance AnimatedNumber

**Files:**
- Modify: `src/components/ui/animated-number.tsx`

**Step 1: Add prefix, suffix props and mono default**

Update the interface and component:

```tsx
interface AnimatedNumberProps {
  value: number;
  duration?: number;
  decimals?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

export function AnimatedNumber({
  value,
  duration = 300,
  decimals = 0,
  className,
  prefix,
  suffix,
}: AnimatedNumberProps) {
  // ... existing animation logic unchanged ...

  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {prefix}{display.toFixed(decimals)}{suffix}
    </span>
  );
}
```

Import `cn` from `@/lib/utils` at the top.

**Step 2: Commit**

```bash
git add src/components/ui/animated-number.tsx
git commit -m "feat(design): enhance AnimatedNumber with prefix/suffix and mono default"
```

---

### Task 8: Feedback Components

**Files:**
- Create: `src/components/ui/amrap-glow.tsx`
- Create: `src/components/ui/workout-complete.tsx`

**Step 1: Create AMRAPGlow wrapper**

```tsx
import { cn } from "@/lib/utils"

interface AMRAPGlowProps {
  active: boolean
  children: React.ReactNode
  className?: string
}

export function AMRAPGlow({ active, children, className }: AMRAPGlowProps) {
  return (
    <div
      className={cn(
        "rounded-xl border transition-all",
        active && "animate-[amrap-glow_2s_ease-in-out_infinite]",
        className
      )}
    >
      {children}
    </div>
  )
}
```

**Step 2: Create WorkoutComplete component**

```tsx
"use client"

import { useEffect, useState } from "react"
import { AnimatedNumber } from "./animated-number"

interface WorkoutCompleteProps {
  setsCompleted: number
  duration: string
}

export function WorkoutComplete({ setsCompleted, duration }: WorkoutCompleteProps) {
  const [showCheck, setShowCheck] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShowCheck(true), 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-6">
      {/* Animated checkmark */}
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 24 24" className="w-full h-full">
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke="oklch(0.65 0.10 160 / 0.2)"
            strokeWidth="1.5"
          />
          <path
            d="M7 13l3 3 7-7"
            fill="none"
            stroke="oklch(0.65 0.10 160)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="24"
            strokeDashoffset={showCheck ? "0" : "24"}
            style={{
              transition: "stroke-dashoffset 500ms cubic-bezier(0.22, 1, 0.36, 1)",
              transitionDelay: "200ms",
            }}
          />
        </svg>
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Workout Complete</h2>
        <p className="text-muted-foreground">
          <AnimatedNumber value={setsCompleted} suffix=" sets" /> &middot; {duration}
        </p>
      </div>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/components/ui/amrap-glow.tsx src/components/ui/workout-complete.tsx
git commit -m "feat(design): add AMRAPGlow and WorkoutComplete feedback components"
```

---

## Phase 3: Update Bottom Nav & Button

### Task 9: Bottom Nav + Button Updates

**Files:**
- Modify: `src/components/BottomNav.tsx`
- Modify: `src/components/ui/button.tsx`

**Step 1: Update BottomNav active state and touch feedback**

In `BottomNav.tsx`, change the nav item className:
- Active state: change `text-primary` to `text-primary` (this now maps to sage via our new token)
- Touch feedback: change `active:scale-110` to `active:scale-[0.95]`

```tsx
className={`flex flex-col items-center gap-1 px-3 py-2 text-xs transition-all active:scale-[0.95] ${
  isActive
    ? "text-primary"
    : "text-muted-foreground hover:text-foreground"
}`}
```

**Step 2: Update Button default variant for active feedback**

In `button.tsx`, update the base styles to include active scale:
```
"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 ..."
```

Add `active:scale-[0.97]` to the base CVA string (before `disabled:`).

**Step 3: Verify in browser**

Tap buttons and nav items. Buttons should compress slightly (0.97). Nav items should compress to 0.95. The sage accent should be visible on active nav items and primary buttons.

**Step 4: Commit**

```bash
git add src/components/BottomNav.tsx src/components/ui/button.tsx
git commit -m "feat(design): update BottomNav and Button with sage accent and touch feedback"
```

---

## Phase 4: Page Updates

### Task 10: Dashboard Page

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/Dashboard/WeightTrend.tsx`
- Modify: `src/components/Dashboard/NextWorkoutCard.tsx`
- Modify: `src/components/Dashboard/RecoveryStatusBars.tsx`
- Modify: `src/components/Dashboard/WeekSummary.tsx`

**Step 1: Update dashboard page layout and loading state**

In `src/app/page.tsx`:
- Change outer div: `mx-auto max-w-lg px-5 pt-5 pb-28`
- Replace the "Loading..." fallback with skeleton cards:

```tsx
import { SkeletonCard } from "@/components/ui/skeleton";

// In the loading return:
return (
  <div className="mx-auto max-w-lg px-5 pt-5 pb-28 space-y-4">
    <div className="space-y-2 mb-4">
      <div className="h-5 w-40 rounded bg-muted animate-pulse" />
      <div className="h-8 w-24 rounded bg-muted animate-pulse" />
    </div>
    {[0, 1, 2, 3].map((i) => (
      <div
        key={i}
        className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
        style={{ animationDelay: `${i * 50}ms`, animationDuration: "300ms" }}
      >
        <SkeletonCard />
      </div>
    ))}
  </div>
);
```

- Update stagger from 60ms to 50ms intervals on the dashboard section cards.

**Step 2: Update WeightTrend**

In `WeightTrend.tsx`:
- Change AnimatedNumber on the hero weight to include `className="text-3xl font-extrabold"` (mono/tabular-nums now come from AnimatedNumber defaults).
- Add suffix prop: `suffix=" "` (to separate from "lbs").
- Add directional animation to trend arrow: wrap the trend symbol span in a transitioning container:

```tsx
{trend && trend.symbol && (
  <span
    className={`text-lg animate-in fade-in fill-mode-both ${
      trend.label === "losing"
        ? "text-green-400 slide-in-from-top-1"
        : trend.label === "gaining"
          ? "text-orange-400 slide-in-from-bottom-1"
          : "text-muted-foreground slide-in-from-left-1"
    }`}
    style={{ animationDuration: "200ms" }}
    title={trend.label}
  >
    {trend.symbol}
  </span>
)}
```

**Step 3: Update NextWorkoutCard**

In `NextWorkoutCard.tsx`:
- Change `<Card>` to `<Card variant="raised">`.
- Replace the hand-rolled location segmented control with `<SegmentedControl>`:

```tsx
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Dumbbell, Home } from "lucide-react";

// Replace the location control div:
<SegmentedControl
  value={location}
  onChange={setLocation}
  options={[
    { value: "gym", label: "Gym", icon: <Dumbbell className="h-4 w-4" /> },
    { value: "home", label: "Home", icon: <Home className="h-4 w-4" /> },
  ]}
/>
```

- Add `font-mono tabular-nums` to weight displays:
```tsx
<p className="text-sm font-bold text-foreground font-mono tabular-nums">
```

**Step 4: Update RecoveryStatusBars**

In `RecoveryStatusBars.tsx`:
- Change the empty/loading state card to include skeleton shimmer.
- Add `font-mono tabular-nums` to any numeric "days ago" display.
- No gradient changes needed (the existing STATUS_GRADIENT is already well-designed).

**Step 5: Update WeekSummary**

In `WeekSummary.tsx`:
- Update the workout ring stroke color from `oklch(0.85 0 0)` to sage: `oklch(0.65 0.10 160)`.
- Update the ring background from `oklch(0.3 0 0)` to `oklch(0.22 0.005 260)`.
- Add `font-mono tabular-nums` to the `{count}/{target}` display inside the ring.

**Step 6: Verify in browser**

Open dashboard. Check:
- Skeleton loaders appear briefly on first load
- WeightTrend shows extrabold mono number with animated trend arrow
- NextWorkoutCard is visually elevated (raised card variant)
- Location toggle has sliding pill animation
- Ring chart uses sage color
- All weight/number displays are in JetBrains Mono

**Step 7: Commit**

```bash
git add src/app/page.tsx src/components/Dashboard/WeightTrend.tsx src/components/Dashboard/NextWorkoutCard.tsx src/components/Dashboard/RecoveryStatusBars.tsx src/components/Dashboard/WeekSummary.tsx
git commit -m "feat(design): apply visual system to dashboard — skeletons, sage accents, mono numerals"
```

---

### Task 11: Active Workout Page

**Files:**
- Modify: `src/app/workout/active/page.tsx`
- Modify: `src/components/ActiveWorkout/ExerciseBlock.tsx`
- Modify: `src/components/ActiveWorkout/SetLogger.tsx`
- Modify: `src/components/ActiveWorkout/RestTimer.tsx`

**Step 1: Update ExerciseBlock with AMRAP glow**

In `ExerciseBlock.tsx`:
- Import `AMRAPGlow` from `@/components/ui/amrap-glow`.
- Accept a new `isAMRAPSet` prop.
- Wrap the outer div in `<AMRAPGlow active={isAMRAPSet}>`.
- Add `font-mono tabular-nums` to the weight display and set/rep counts.

**Step 2: Update SetLogger with mono font**

In `SetLogger.tsx`:
- Add `font-mono tabular-nums` to every rep button: `className="h-12 text-lg font-bold font-mono tabular-nums"`.
- Change the target rep highlight from `border-primary` to `border-primary` (already maps to sage).

**Step 3: Update RestTimer with mono font**

In `RestTimer.tsx`:
- The timer display already uses `font-mono`. Add `tabular-nums` to ensure fixed-width digits.
- No other changes needed — the rest timer is already well-designed.

**Step 4: Update active workout page**

In `src/app/workout/active/page.tsx`:
- Change outer padding: `pb-28` (standardized).
- Replace "Workout Complete!" screen with `<WorkoutComplete>` component:

```tsx
import { WorkoutComplete } from "@/components/ui/workout-complete";

// In the isWorkoutComplete block:
if (isWorkoutComplete) {
  const durationSeconds = workoutStartTime
    ? Math.floor((Date.now() - workoutStartTime.getTime()) / 1000)
    : 0;
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  const duration = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <div className="min-h-screen bg-background">
      <WorkoutHeader
        templateName={WORKOUT_TEMPLATES[store.templateId]?.name || store.templateId}
        workoutStartTime={workoutStartTime}
      />
      <WorkoutComplete setsCompleted={completedSets.length} duration={duration} />
      <div className="px-5">
        <Button
          size="lg"
          className="w-full"
          onClick={handleCompleteWorkout}
          disabled={isCompleting}
        >
          {isCompleting ? "Saving..." : "Finish & View Summary"}
        </Button>
      </div>
    </div>
  );
}
```

- Pass `isAMRAPSet={isCurrentSetAMRAP}` to `ExerciseBlock`.
- Change loading states from "Loading..." to skeleton content.

**Step 5: Verify in browser**

Navigate to an active workout (or check the UI structure). Confirm:
- ExerciseBlock shows breathing sage glow during AMRAP sets
- Rep buttons use monospace font
- Workout complete screen shows animated checkmark
- Timer digits are fixed-width

**Step 6: Commit**

```bash
git add src/app/workout/active/page.tsx src/components/ActiveWorkout/ExerciseBlock.tsx src/components/ActiveWorkout/SetLogger.tsx src/components/ActiveWorkout/RestTimer.tsx
git commit -m "feat(design): apply visual system to active workout — AMRAP glow, mono numerals, animated complete"
```

---

### Task 12: Settings Page

**Files:**
- Modify: `src/app/settings/page.tsx`

**Step 1: Update layout padding**

Change outer div: `mx-auto max-w-lg px-5 pt-5 pb-28`

**Step 2: Update training phase active state to sage**

Change the active phase button styles:
```tsx
settings.trainingPhase.mode === mode
  ? "border-primary bg-accent-primary-soft font-medium text-foreground"
  : "border-input bg-background text-muted-foreground hover:bg-accent"
```

And the radio dot:
```tsx
settings.trainingPhase.mode === mode
  ? "border-primary"
  : "border-muted-foreground"
```
```tsx
<span className="h-2 w-2 rounded-full bg-primary" />
```

These already reference `--primary` which is now sage. No class changes needed — verify the color is correct.

**Step 3: Replace loading state with skeletons**

```tsx
import { SkeletonCard } from "@/components/ui/skeleton";

// Loading return:
return (
  <div className="mx-auto max-w-lg px-5 pt-5 pb-28 space-y-4">
    <div className="h-5 w-20 rounded bg-muted animate-pulse mb-6" />
    {[0, 1, 2, 3].map((i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);
```

**Step 4: Add font-mono to NumberField displays**

In the `NumberField` sub-component, add `font-mono tabular-nums` to the display button:
```tsx
className="text-sm font-medium text-foreground hover:text-primary transition-colors font-mono tabular-nums"
```

**Step 5: Verify in browser**

Settings page should show sage radio buttons, skeleton loading, mono numbers, consistent padding.

**Step 6: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat(design): apply visual system to settings — sage accents, skeletons, mono numerals"
```

---

### Task 13: Exercises Page

**Files:**
- Modify: `src/app/exercises/page.tsx`

**Step 1: Update layout padding**

Change outer div: `mx-auto max-w-lg px-5 pt-5 pb-28`

**Step 2: Replace filter tabs with SegmentedControl**

```tsx
import { SegmentedControl } from "@/components/ui/segmented-control";

// Replace the filter tabs div:
<SegmentedControl
  value={filter}
  onChange={setFilter}
  options={FILTER_TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
  className="mb-4"
/>
```

**Step 3: Replace loading state with skeletons**

```tsx
import { SkeletonCard } from "@/components/ui/skeleton";

return (
  <div className="mx-auto max-w-lg px-5 pt-5 pb-28 space-y-4">
    <div className="h-5 w-24 rounded bg-muted animate-pulse mb-6" />
    <div className="h-9 rounded-lg bg-muted animate-pulse mb-4" />
    {[0, 1, 2].map((i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);
```

**Step 4: Commit**

```bash
git add src/app/exercises/page.tsx
git commit -m "feat(design): apply visual system to exercises — SegmentedControl, skeletons"
```

---

### Task 14: Workout Summary Page

**Files:**
- Modify: `src/app/workout/summary/page.tsx`

**Step 1: Update layout padding**

Change outer div: `mx-auto max-w-lg px-5 pt-5 pb-28`

**Step 2: Add font-mono to numeric displays**

- Duration display: `className="text-2xl font-bold text-foreground font-mono tabular-nums"`
- Weight displays in lift results: add `font-mono tabular-nums` where applicable.

**Step 3: Replace loading states with skeletons**

Replace all "Loading..." returns:
```tsx
import { SkeletonCard, SkeletonStat } from "@/components/ui/skeleton";

return (
  <div className="min-h-screen bg-background pb-28">
    <div className="mx-auto max-w-lg px-5 pt-5 space-y-4">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  </div>
);
```

**Step 4: Commit**

```bash
git add src/app/workout/summary/page.tsx
git commit -m "feat(design): apply visual system to workout summary — mono numerals, skeletons"
```

---

### Task 15: Remaining Pages

**Files:**
- Modify: `src/app/weigh-in/page.tsx`
- Modify: `src/app/body-check/page.tsx`
- Modify: `src/app/run/page.tsx`
- Modify: `src/app/history/page.tsx`
- Modify: `src/app/tools/page.tsx`
- Modify: `src/app/1rm-calculator/page.tsx`
- Modify: `src/app/plate-calculator/page.tsx`
- Modify: `src/app/program/page.tsx`
- Modify: `src/app/workout/configure/page.tsx`

**Step 1: Standardize padding on all pages**

For each page listed above, update the outer wrapper div to use `px-5 pt-5 pb-28` (or `px-5 py-5 pb-28` as appropriate).

Specifically, search for these patterns and replace:
- `px-4 py-4` → `px-5 pt-5`
- `px-4 py-6` → `px-5 pt-5`
- Any missing `pb-28` → add `pb-28`

**Step 2: Add font-mono tabular-nums to numeric displays**

In each page, find weight/number/stat displays and add `font-mono tabular-nums`:
- `1rm-calculator`: all weight/1RM number displays
- `plate-calculator`: plate weights and totals
- `weigh-in`: weight input display
- `history`: workout durations and dates
- `run`: distance, duration, pace displays

**Step 3: Replace loading states**

Each page that has a `"Loading..."` text return should be replaced with appropriate skeleton content using `SkeletonCard` or custom skeleton layouts.

**Step 4: Verify all pages in browser**

Navigate through every page. Confirm:
- Consistent padding throughout
- Monospace numbers on all data displays
- Skeleton loading states instead of text
- Sage primary buttons
- Plus Jakarta Sans typography
- Bottom nav clears content on all pages

**Step 5: Commit**

```bash
git add src/app/weigh-in/page.tsx src/app/body-check/page.tsx src/app/run/page.tsx src/app/history/page.tsx src/app/tools/page.tsx src/app/1rm-calculator/page.tsx src/app/plate-calculator/page.tsx src/app/program/page.tsx src/app/workout/configure/page.tsx
git commit -m "feat(design): standardize padding, mono numerals, and skeletons across all pages"
```

---

## Phase 5: Final Verification

### Task 16: Run Tests & Full Visual Audit

**Step 1: Run test suite**

Run: `npx vitest run`

All existing tests should pass — we haven't modified any business logic. Report results.

**Step 2: Full visual walkthrough**

Use Playwright to screenshot each page and verify the design system is applied consistently:
- Dashboard (with and without data)
- Active Workout (mid-workout state)
- Settings
- Exercises (with filter active)
- Workout Summary
- All remaining pages

**Step 3: Fix any inconsistencies found**

Address any spacing, color, or font issues discovered during the audit.

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix(design): visual audit fixes"
```
