# Apple Watch companion app

**Status:** draft for review, 2026-11-18. No code written yet. Screens reviewed and
approved by the owner on 2026-11-18:
https://claude.ai/artifact/7phuEnGXgHDcQYjtEVUotN

Depends on: reps in reserve (`docs/plans/2026-11-18-reps-in-reserve-design.md`, landed
on main at e4f4b00).

## Why

During a workout the phone is usually in a pocket or on the floor. The owner wants, on
the wrist: live heart rate, the rest countdown with a tap when rest is nearly over, a
way to log sets, a view of where they are in the workout, and a way to finish it.

Today none of that exists. There is no watchOS target, heart rate is only read after
the fact from a Watch workout the owner starts by hand, and the end-of-rest alert uses
browser vibration and notification APIs that are not expected to work inside the iOS
web view (`src/lib/audio.ts`; not yet confirmed on a device).

## Shape of the solution

Capacitor's web view does not run on watchOS, so the watch app is native SwiftUI. To
keep it small, **the watch never runs GZCLP logic. It runs a plan the phone hands it.**

1. **Plan handoff.** The phone builds today's workout as it does now and sends the
   watch a flat plan: exercises in order, each set's weight, target reps, tier, whether
   it is an AMRAP set, rest seconds, and any hint text the phone has already worked out
   (for example the T3 move-up reps).
2. **Watch runs the session.** The watch steps through the plan on its own: log reps,
   answer reps left, rest countdown with haptics, live heart rate. It works with the
   phone locked, out of reach, or the web view suspended.
3. **Results come back.** Each logged set is queued for the phone with guaranteed
   delivery. The phone writes it to Dexie through the same path a phone-logged set
   takes, and progression runs there as it does today.

Sets are append-only and carry a `clientId`, so a set logged on both devices
de-duplicates instead of conflicting.

## Requirements

| ID | Requirement | Acceptance check |
|---|---|---|
| W1 | End-of-rest alert works on iPhone with the app in the background | With the phone locked, a notification fires at rest end and mirrors to the Watch; verified on a device |
| W2 | Optional warning a few seconds before rest ends | A second notification at `REST_WARNING_SECONDS` (10) before the end; off when rest is shorter than twice that |
| W3 | The phone can describe a workout as a `WatchPlan` | Pure function in `src/lib/watch/plan.ts` with tests: every set the phone would show appears once, in order, with weight, reps, tier, AMRAP flag and rest |
| W4 | The plan reaches the watch before or at workout start | Sent when the Ready screen opens and again on Start; the watch shows screen 01 with the right exercises |
| W5 | The watch shows the current set | Screen 02: exercise, tier colour, set n of m, weight, target reps, heart rate |
| W6 | Reps are logged from the wrist | Screen 03: defaults to the target, Digital Crown and plus/minus change it, Done logs it |
| W7 | Reps left is asked from the wrist | Screen 04: 0, 1-2, 3+; one tap saves; Skip leaves it unanswered; hidden when `showEffort` is off |
| W8 | Rest countdown with haptics | Screens 05 and 06: ring and time; a tap at 10 seconds left and at zero; +30 s and Skip work; runs with the phone unreachable |
| W9 | AMRAP sets say so | Screen 07: "15+ reps", the AMRAP chip, and the phone's hint line when the plan carries one |
| W10 | Live heart rate and a recorded workout | The watch runs a strength workout session for the whole session; it is saved to Health and linked to the app session by the existing overlap rule (apple-health R8) with no manual start |
| W11 | Where am I | Screen 09: every exercise with sets done of total, the current one outlined |
| W12 | Controls | Screen 10: Undo last set, Pause, End workout |
| W13 | Finish from the wrist | Screens 11 and 12: confirmation when sets remain, then a summary; the phone records the workout as finished with the same result as finishing on the phone |
| W14 | Logged sets reach the phone exactly once | Sets queue on the watch and are delivered when the phone is next reachable; a set already present by `clientId` is ignored; tested with the phone app killed mid-workout |
| W15 | Both devices can be used in the same workout | A set logged on the phone advances the watch within a few seconds when reachable, and on the next message when not; neither device logs the same set twice |
| W16 | Coaching prompts stay on the phone in this version | When the phone raises a mid-workout suggestion (the T2 lighter weight), the watch shows screen 08 and lets the lifter carry on at the planned weight |
| W17 | Plan changes mid-workout | A swap, skip or weight change on the phone re-sends the plan; the watch keeps what it has logged and continues from the first unlogged set |
| W18 | The watch app is useless without a plan, and says so | With no plan it shows "Start a workout on your phone" |

Out of scope for this version: running GZCLP or auto-regulation on the watch, starting
an unplanned workout from the watch, editing past sets, pain or equipment skips from the
watch, complications, standalone use without the phone ever syncing, Android.

## The plan contract

```ts
interface WatchPlan {
  version: 1;
  sessionId: string;          // the phone's workout session id
  workoutLabel: string;       // "Workout A1"
  askRepsLeft: boolean;       // UserSettings.showEffort
  sets: WatchPlanSet[];       // flat, in the order they are done
}
interface WatchPlanSet {
  clientId: string;           // the id the SetLog will carry
  exerciseId: string;
  exerciseName: string;
  tier: Tier;
  setNumber: number;          // 1-based within the exercise
  setCount: number;
  weight: number;             // lbs, as lifted
  perHand: boolean;
  targetReps: number;
  isAMRAP: boolean;
  restSeconds: number;        // from getRestSeconds, phase already applied
  hint?: string;              // phone-computed line for screen 07
  done?: { reps: number; repsInReserve?: RepsInReserve };
}
interface WatchSetResult {
  sessionId: string;
  clientId: string;
  reps: number;
  repsInReserve?: RepsInReserve;
  loggedAt: string;           // ISO time on the watch
}
```

The Swift side mirrors these as `Codable` structs. A JSON fixture generated from the
TypeScript tests is decoded in a Swift unit test, so the two cannot drift silently.

## Pieces

| Piece | Where | Notes |
|---|---|---|
| Rest notifications (W1, W2) | `@capacitor/local-notifications`, `src/native/restNotifications.ts`, `RestTimer.tsx` | Scheduled when rest starts, cancelled on skip or early finish. Independent of the watch app |
| Plan builder (W3) | `src/lib/watch/plan.ts` + tests | Pure; reuses the active-workout set plan and `getRestSeconds` |
| Ingest (W14, W15) | `src/lib/watch/ingest.ts` + tests | Pure: results + current sets in, new `SetLog`s out; then the existing log-set path |
| Bridge plugin | `ios/App/App/WatchBridge.swift`, `src/native/watch.ts` | Local Capacitor plugin over WatchConnectivity: `sendPlan`, `addListener("setResults")`, `addListener("sessionEnded")`. Guaranteed-delivery transfer for results, immediate message when reachable |
| Watch app | new watchOS target `ReCompWatch` in `ios/App/App.xcodeproj` | SwiftUI; a `SessionStore` state machine over the plan; workout session for heart rate and to stay running; persists plan and unsent results so a crash loses nothing |
| Phone UI hooks | `useActiveWorkout`, Ready screen | Send the plan; apply incoming results; re-send on change |

## Order of work

| Phase | Delivers | Usable on its own |
|---|---|---|
| 1 | W1, W2: native rest notifications | Yes: wrist tap at rest end with no watch app |
| 2 | W3, W4, W5, W8, W10, W11, W18: read-only watch app | Yes: position, rest timer, haptics, heart rate |
| 3 | W6, W7, W9, W12, W13, W14: log and finish from the wrist | Yes |
| 4 | W15, W16, W17: both devices live, plan changes | Hardening |

Phases 2 and 3 share the bridge and the plan contract, so nothing from phase 2 is
thrown away.

## Testing, and its limits

- TypeScript: plan builder and ingest are pure and fully unit-tested in Vitest.
- Swift: the state machine and the plan decoding get XCTest unit tests, run with
  `xcodebuild test` on the watch simulator.
- **Cannot be verified without the owner's hardware:** haptics, message delivery
  between a real phone and watch, behaviour with the phone locked, heart rate, and the
  Health workout link. Each phase ends with a short on-wrist checklist for the owner.
- The simulator's heart rate is simulated and proves only that the wiring runs.

## Risks

- **Message delivery** is unreliable when either side is asleep. Results use the
  queued transfer, never the immediate message alone; the watch keeps unsent results on
  disk.
- **The web view may be suspended** when results arrive. The native plugin holds them
  until the web app is next running and asks for them; nothing depends on JavaScript
  running in the background.
- **A second target** needs its own bundle id (`com.recomplife.app.watchkitapp`),
  signing, HealthKit entitlement and usage strings. First-time setup is fiddly.
- **Two writers** to one session is new for the active-workout code, which assumes the
  phone is the only one. Phase 4 exists for this.

## Open items

1. Starting from the wrist: screen 01 has a Start button. Proposed: the watch can start
   a workout the phone has already planned (Ready screen opened today), and otherwise
   shows W18's message.
2. Whether "Undo last set" on the watch may undo a set that has already reached the
   phone. Proposed: only while it is still the latest set of the session.
3. Screens not drawn yet: paused, phone out of reach, waiting for a plan.
