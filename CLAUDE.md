# ReComp Life — GZCLP Workout Tracker

## Project Overview
A mobile-first Next.js PWA (with Capacitor for native iOS/Android) for tracking the GZCLP linear progression program. Acts as an intelligent coach with RPE-driven autoregulation, training phase awareness, and data-driven deload triggers.

## Tech Stack
- **Framework:** Next.js 14+ (App Router, TypeScript)
- **UI:** Tailwind CSS + shadcn/ui (dark mode default)
- **Local Storage:** Dexie.js (IndexedDB) — offline-first
- **Backend DB:** Neon Postgres (serverless) + Drizzle ORM
- **Auth:** Auth.js (Apple + Google sign-in)
- **Mobile:** Capacitor wrapper for iOS/Android
- **Charts:** Recharts
- **Testing:** Vitest + React Testing Library
- **Deploy:** Vercel

## Architecture Principles
- **Offline-first:** All writes go to Dexie (IndexedDB) first, sync to Neon when online
- **Pure logic functions:** All GZCLP progression, auto-adapt, recovery logic lives in `src/lib/` as pure, testable functions
- **UI state only in Zustand:** Stores are for transient UI state, not persistence
- **Append-heavy data model:** Sets/workouts/runs are almost never edited — simplifies sync
- **User always has final say:** All suggestions (pain mods, deload, auto-adapt) are overridable

## Key Conventions
- Use `src/lib/` for all business logic (pure functions, no React dependencies)
- Use `src/components/` for React components organized by feature area
- Use `src/types/index.ts` for all shared TypeScript interfaces
- Use `src/db/local.ts` for Dexie.js setup, `src/db/schema.ts` for Drizzle/Neon schema
- All weights are in **lbs** internally
- All durations are in **seconds** internally
- Every record gets a `clientId` (UUID) for sync deduplication
- Dark mode is the default theme

## Testing
- TDD approach: write failing test → implement → verify
- All `src/lib/` functions must have corresponding test files
- Run tests: `npx vitest run`
- Watch mode: `npx vitest`

## GZCLP Program Rules (Critical)
- Rotation: A1 → B1 → A2 → B2 → repeat (never changes based on location)
- Pain/run/equipment skips FREEZE progression — they do NOT trigger failure cascade
- T3 weight increases when AMRAP last set ≥ 25 reps (NOT total reps ≥ 25)
- Training phase (cutting/maintaining/bulking) affects thresholds throughout the app
- DB-adapted workouts at home count as passes for progression
