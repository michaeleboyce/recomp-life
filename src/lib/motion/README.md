# Mannequin motion library

Pure TypeScript (no React, no three). Computes the pose of a stylised ~1.75 m
mannequin and its equipment for every exercise in `EXERCISES`. Motion is computed,
not recorded: arms and legs are solved with analytic two-bone IK, so limb lengths
are constant, planted feet do not slide and hands stay on the implement.

Public API: import from `./sample` (`sampleFrame`, `getMotionInfo`, `hasMotion`,
`tracePoint`, `BONES`, and the `Vec3` / `Pose` / `Prop` / `Frame` / `MotionInfo` types).

## Coordinates

- Metres. `+Y` up, floor at `y = 0`.
- The figure faces `+Z`. `+X` is the figure's **left**.
- Standing lifts keep the middle of the foot at `z = 0`.
- `handL` / `handR` are grip centres (middle of the palm). `head` is the centre of
  the head (radius about 0.11). `toeL` / `toeR` rest at `y = 0.02` when on the floor.

## Time

`sampleFrame(id, t)`: `t` is one rep, taken modulo 1. `t = 0` start, `t = 0.5` end of
the working stroke, `t = 1` back at the start. `strokePhase` eases `t` into stroke
progress `s` (slower lowering half, short pauses, zero velocity at both ends), and
every archetype is a pure function of `s`.

## Props

| kind | meaning |
|---|---|
| `barbell` | `from` / `to` are the bar ends (right end to left end). `plateRadius: 0` means a plain bar (lat bar, pushdown bar): draw no plates. |
| `dumbbell` | `center` is the middle of the handle, `axis` a unit vector along the handle. |
| `bench` | A pad. `center` is the centre of its **top surface** (`height === center[1]`). `length` runs along `+Z` at `yawDeg = 0`; `yawDeg = 90` turns it to run along `X`. `inclineDeg` tilts it about its centre so the `-Z` (head) end rises. Width is not specified (about 0.3). |
| `box` | Axis-aligned, `center` and full `size`. Used for seats, pads, rollers, the rear-foot box. |
| `cable` | `from` is the fixed anchor, `to` the handle end. |
| `wheel` | Ab wheel: `center`, `axis` along the handles, `radius`. |

Prop order inside a frame is stable for a given exercise.

## Files

- `vec.ts` vector helpers. `ik.ts` two-bone IK. `rig.ts` joints, bones, segment lengths, prop types.
- `archetypes.ts` the 16 parametric generators (squat, hinge, split, supine, overhead,
  row, pulldown, curl, raise, triceps, legMachine, calfRaise, rollout, backExtension,
  hipThrust, facePull) and the body builder they share.
- `motions.ts` `MOTIONS`: one `MotionSpec` per exercise id (archetype + parameters, caption, view, trace).
- `sample.ts` public API.

## Adding a motion

1. Add an entry to `MOTIONS` in `motions.ts` keyed by the exercise id. Reuse an
   archetype with new parameters where possible.
2. For a new archetype, write a function in `archetypes.ts` returning a `Motion`:
   - `frame(s)`: build the torso with `torso({ pelvis, pitch, bend, neck })`, choose
     foot placements (`flatFoot`, `toeFoot`, `freeFoot`) and hand targets, solve with
     `leg(hip, foot, pole)` and `arm(shoulder, hand, pole)` (the pole is the direction
     the knee or elbow should point), then `assemble(...)`.
   - `planted`: feet that must not move (`"flat"` pins ankle and toe, `"toe"` the toe only).
   - `grips`: for each gripping hand, the index in `props` of the implement it holds.
3. Set `eccentricFirst` (true when the rep starts by lowering) and the `info` fields.
4. Run `npx vitest run src/lib/motion`. The tests cover every key of `EXERCISES`
   automatically: finite joints, constant bone lengths, nothing under the floor,
   planted feet, grips, level centred barbells, seamless loop.
5. Look at it. Numbers passing is not enough: render stick figures from the side and
   front at a few values of `t` and check the movement is recognisable.
