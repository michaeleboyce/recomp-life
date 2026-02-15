# Visual System Overhaul — Design Document

**Date:** 2026-02-14
**Branch:** feat/refined-minimalism-redesign
**Aesthetic:** Calm, zen, premium — refined minimalism

## Overview

Comprehensive visual system overhaul for ReComp Life. Defines typography, color, spacing, animation, and component standards, then applies them systematically to every page. Zero changes to business logic, data flow, or stores.

---

## 1. Typography

**Font family:** Plus Jakarta Sans (Google Fonts) — geometric, slightly rounded terminals, warm without being soft.

**Monospace:** JetBrains Mono (Google Fonts) — for all numeric data (weights, reps, sets, timers, stats). Tabular numerals.

**Type scale:**

| Role | Classes | Font |
|------|---------|------|
| Hero stat | `text-3xl font-extrabold` | Plus Jakarta 800 |
| Page title | `text-lg font-bold` | Plus Jakarta 700 |
| Card title | `text-base font-semibold` | Plus Jakarta 600 |
| Section label | `text-xs font-semibold uppercase tracking-wider` | Plus Jakarta 600 |
| Body | `text-sm font-normal` | Plus Jakarta 400 |
| Caption | `text-xs text-muted-foreground` | Plus Jakarta 400 |
| Numeric data | `font-mono tabular-nums` | JetBrains Mono |

**Rule:** Every weight, rep count, timer, or stat display gets `font-mono tabular-nums`.

---

## 2. Color System

**Philosophy:** Monochromatic base with one muted accent (sage), used with restraint.

### Accent

```css
--accent-primary:      oklch(0.65 0.10 160)          /* sage green — CTAs, active states */
--accent-primary-soft:  oklch(0.65 0.10 160 / 15%)   /* backgrounds, highlights */
--accent-primary-dim:   oklch(0.55 0.08 160)          /* hover states */
```

### Semantic

```css
--success:     oklch(0.65 0.15 145)   /* green, warmer than sage */
--warning:     oklch(0.75 0.15 85)    /* warm amber */
--destructive: oklch(0.65 0.20 25)    /* muted red */
--info:        oklch(0.60 0.10 250)   /* soft blue */
```

### Dark Theme Neutrals

```css
--background:  oklch(0.13 0.005 260)  /* very slightly blue-shifted */
--card:        oklch(0.18 0.005 260)  /* default card surface */
--card-raised: oklch(0.22 0.005 260)  /* elevated cards */
--border:      oklch(1 0 0 / 8%)      /* softer borders */
--muted-fg:    oklch(0.55 0.01 260)   /* slightly blue-tinted muted text */
```

### Color Usage Rules

- **Sage accent:** START WORKOUT button, active bottom nav icon, active filter tab, primary toggle state, AMRAP glow
- **Monochrome:** everything else — cards, text, borders, icons
- **Semantic colors:** only in context (pain = amber, PR = success green, failed set = destructive)

---

## 3. Spacing & Layout

### Spacing Scale

```
--space-xs:  0.25rem  (4px)
--space-sm:  0.5rem   (8px)
--space-md:  0.75rem  (12px)
--space-lg:  1rem     (16px)
--space-xl:  1.5rem   (24px)
--space-2xl: 2rem     (32px)
```

### Layout Rules

- Between cards on a page: `space-lg` (1rem)
- Card internal padding: `p-5` (20px)
- Section label to content: `space-sm` (8px)
- Page padding: `px-5 pt-5 pb-28`
- Max width: `max-w-lg` (unchanged)
- Bottom nav clearance: `pb-28` (standardized)

### Card Elevation

| Variant | Background | Border | Shadow | Usage |
|---------|-----------|--------|--------|-------|
| `default` | `bg-card` | yes | none | Most cards |
| `raised` | `bg-card-raised` | yes | `shadow-sm` | START WORKOUT, active exercise block |
| `flat` | transparent | none | none | WeightTrend greeting area |

---

## 4. Animation & Motion

### Global Easing

```css
--ease-out-soft: cubic-bezier(0.22, 1, 0.36, 1)
```

### Duration Tokens

```css
--duration-fast:   150ms   /* hover, toggles */
--duration-normal: 300ms   /* entrances, reveals */
--duration-slow:   500ms   /* celebrations */
```

### Touch Feedback

- Buttons: `active:scale-[0.97]` duration-fast
- Nav tabs: `active:scale-[0.95]` duration-fast
- Cards: no scale (cards don't press)

### Entrance Pattern

- `fade-in` + `translate-y(8px)` to origin
- Duration: 300ms
- Stagger: 50ms between siblings

### Micro-Interactions

1. **Set logged** — LOG SET button sage pulse, set count ticks up via AnimatedNumber
2. **Rest timer complete** — radial pulse outward, set logger fades in
3. **Workout complete** — SVG checkmark stroke draw (~500ms), stats count up from 0
4. **AMRAP set** — breathing border glow on exercise block (2s cycle, sage at low opacity, CSS-only)
5. **Weight trend arrow** — fade-in with directional slide (200ms)

### What We're NOT Doing

- No page transitions
- No parallax or scroll effects
- No confetti/particles
- No spring physics

---

## 5. Component System

### Skeleton Loader

Single `<Skeleton />` component — rounded rectangle with shimmer sweep.

```
Shimmer: linear-gradient sweep, left to right
Color: oklch(0.22) → oklch(0.28) → oklch(0.22)
Duration: 1.5s, infinite
```

Variants: `SkeletonCard`, `SkeletonText` (variable width), `SkeletonStat` (wider/taller).

### Card Variants

Add `variant` prop to existing shadcn Card using CVA:
- `default` — bg-card, border, no shadow
- `raised` — bg-card-raised, border, shadow-sm
- `flat` — bg-transparent, no border, no shadow

### Button Refinements

- Primary: `bg-accent-primary text-background`
- Primary hover: `bg-accent-primary-dim`
- Primary active: `scale-[0.97]` + slight brightness bump
- Ghost/outline: unchanged

### SegmentedControl (new)

Extracted from hand-rolled implementations in NextWorkoutCard and ExercisesPage.

- Container: `bg-muted/40 p-1 rounded-lg`
- Active segment: `bg-card shadow-sm rounded-md`
- Sliding pill animation between segments (not instant swap)

### AnimatedNumber (enhanced)

- Add `tabular-nums font-mono` as default
- Add `prefix` and `suffix` props

### Feedback Components (new)

- `<SetLoggedFeedback />` — brief sage pulse overlay on LOG SET
- `<WorkoutComplete />` — SVG checkmark draw + stat count-up
- `<AMRAPGlow />` — CSS breathing border glow

---

## 6. Page-by-Page Application

### Dashboard (`/`)

- Greeting area: flat card variant. Font upgrade, sage trend arrow animation.
- WeightTrend hero weight: `text-3xl font-extrabold font-mono tabular-nums`
- All cards `variant="default"` except NextWorkoutCard → `variant="raised"`
- START WORKOUT button: sage accent
- Stagger: 50ms
- Loading: 4 `SkeletonCard` with stagger

### Active Workout (`/workout/active`)

- ExerciseBlock: default card. AMRAP final set gets `AMRAPGlow` border.
- SetLogger number grid: `font-mono` on every button. Target rep border → sage.
- LOG SET: sage primary + pulse feedback
- Rest timer completion: radial pulse → set logger fade-in
- Workout complete: SVG checkmark draw + stat count-up

### Settings (`/settings`)

- Cards: consistent `p-5` padding
- Training phase radio: sage accent active state
- Toggle switches: sage active thumb
- Loading: skeleton field rows

### Exercises (`/exercises`)

- Filter tabs → `SegmentedControl` with sliding pill
- Loading: skeleton rows

### All Pages

- `px-5 pt-5 pb-28` standardized
- Headers: `text-lg font-bold` Plus Jakarta 700
- Back arrows: unchanged
- All numeric displays: `font-mono tabular-nums`
- Bottom nav: active color → sage, active scale → `0.95`

---

## What Stays the Same

- Bottom nav structure
- Card-based layout approach
- `max-w-lg` constraint
- All business logic, data flow, store patterns
- Dexie/Zustand architecture
- Component file organization
