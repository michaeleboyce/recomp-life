/**
 * Parametric movement generators.
 *
 * Each archetype returns a `Motion`: a pure function from stroke progress
 * s in [0, 1] (0 = start pose, 1 = end of the working stroke) to a full Frame,
 * plus the metadata the tests check (planted feet, gripping hands).
 *
 * Poses are described by a few effectors (pelvis position, torso pitch, hand and
 * foot targets, bend hints) and solved with two-bone IK, so limb lengths never change.
 */
import { solveTwoBone } from "./ik";
import type { Frame, Pose, Prop } from "./rig";
import { RIG, STAND_Y } from "./rig";
import type { Vec3 } from "./vec";
import { add, lerp, lerpN, mirrorX, normalize, scale, smooth, sub } from "./vec";

export type PlantMode = "flat" | "toe";

export interface Motion {
  /** s = 0 start pose, s = 1 end of the working stroke. */
  frame: (s: number) => Frame;
  /** Feet that must not move: "flat" pins ankle and toe, "toe" pins the toe only. */
  planted: { L?: PlantMode; R?: PlantMode };
  /** Index into `frame.props` of the implement each hand holds. */
  grips: { L?: number; R?: number };
}

// ─── Maths helpers ───────────────────────────────────────────────────────────

const D = Math.PI / 180;
const sinD = (deg: number) => Math.sin(deg * D);
const cosD = (deg: number) => Math.cos(deg * D);

interface Basis {
  left: Vec3;
  up: Vec3;
  front: Vec3;
}

/** Body frame pitched forward by `pitch` degrees (negative = leaning back, -90 = supine, +90 = prone). */
function basis(pitch: number): Basis {
  return { left: [1, 0, 0], up: [0, cosD(pitch), sinD(pitch)], front: [0, -sinD(pitch), cosD(pitch)] };
}

const local = (origin: Vec3, b: Basis, p: Vec3): Vec3 =>
  add(origin, add(scale(b.left, p[0]), add(scale(b.up, p[1]), scale(b.front, p[2]))));

/** Direction in a body frame (no translation). */
const localDir = (b: Basis, p: Vec3): Vec3 => local([0, 0, 0], b, p);

// ─── Body builder ────────────────────────────────────────────────────────────

interface TorsoSpec {
  pelvis: Vec3;
  /** Forward lean of the pelvis and lower spine, degrees. */
  pitch?: number;
  /** Extra pitch of the upper spine (rounding forward), degrees. */
  bend?: number;
  /** Extra pitch of the head relative to the chest, degrees. */
  neck?: number;
}

interface Torso {
  pelvis: Vec3;
  spine: Vec3;
  chest: Vec3;
  neck: Vec3;
  head: Vec3;
  shoulderL: Vec3;
  shoulderR: Vec3;
  hipL: Vec3;
  hipR: Vec3;
  /** Midpoint between the shoulders. */
  sc: Vec3;
  lo: Basis;
  hi: Basis;
}

function torso(spec: TorsoSpec): Torso {
  const pitch = spec.pitch ?? 0;
  const bend = spec.bend ?? 0;
  const lo = basis(pitch);
  const hi = basis(pitch + bend);
  const hd = basis(pitch + bend + (spec.neck ?? 0));
  const spine = local(spec.pelvis, lo, [0, RIG.pelvisToSpine, 0]);
  const chest = local(spine, hi, [0, RIG.spineToChest, 0]);
  const neck = local(chest, hi, [0, RIG.chestToNeck, 0]);
  const head = local(neck, hd, [0, RIG.neckToHead, 0]);
  const shoulderL = local(chest, hi, RIG.shoulderOffset);
  const shoulderR = local(chest, hi, mirrorX(RIG.shoulderOffset));
  return {
    pelvis: spec.pelvis,
    spine,
    chest,
    neck,
    head,
    shoulderL,
    shoulderR,
    hipL: local(spec.pelvis, lo, RIG.hipOffset),
    hipR: local(spec.pelvis, lo, mirrorX(RIG.hipOffset)),
    sc: lerp(shoulderL, shoulderR, 0.5),
    lo,
    hi,
  };
}

/** Distance from the pelvis to the shoulder line along the torso (no spine bend). */
const TORSO_UP = RIG.pelvisToSpine + RIG.spineToChest + RIG.shoulderOffset[1];
const ARM_REACH = RIG.upperArm + RIG.forearm + RIG.hand;
const LEG_REACH = RIG.thigh + RIG.shin;

interface Foot {
  ankle: Vec3;
  toe: Vec3;
}
interface LegSol {
  knee: Vec3;
  ankle: Vec3;
  toe: Vec3;
}
interface ArmSol {
  elbow: Vec3;
  wrist: Vec3;
  hand: Vec3;
}

/** Angle of a flat foot (ankle above the toe joint). */
const FLAT = Math.asin((RIG.ankleHeight - RIG.toeHeight) / RIG.foot) / D;

/** Foot flat on the floor. `yaw` > 0 turns the toe toward +X. */
function flatFoot(x: number, ankleZ: number, yaw = 0): Foot {
  const h = RIG.foot * cosD(FLAT);
  return {
    ankle: [x, RIG.ankleHeight, ankleZ],
    toe: [x + sinD(yaw) * h, RIG.toeHeight, ankleZ + cosD(yaw) * h],
  };
}

/** Foot pivoting on a fixed toe; `lift` is the heel raise in degrees (0 = flat). */
function toeFoot(toe: Vec3, lift: number): Foot {
  const a = FLAT + lift;
  return { toe, ankle: add(toe, [0, RIG.foot * sinD(a), -RIG.foot * cosD(a)]) };
}

/** Foot in the air: toe placed along `dir` from the ankle. */
function freeFoot(ankle: Vec3, dir: Vec3): Foot {
  return { ankle, toe: add(ankle, scale(normalize(dir), RIG.foot)) };
}

function leg(hip: Vec3, foot: Foot, pole: Vec3): LegSol {
  const r = solveTwoBone(hip, foot.ankle, RIG.thigh, RIG.shin, pole);
  return { knee: r.mid, ankle: r.end, toe: add(foot.toe, sub(r.end, foot.ankle)) };
}

function arm(shoulder: Vec3, hand: Vec3, pole: Vec3): ArmSol {
  const r = solveTwoBone(shoulder, hand, RIG.upperArm, RIG.forearm + RIG.hand, pole);
  const wrist = add(r.mid, scale(normalize(sub(r.end, r.mid)), RIG.forearm));
  return { elbow: r.mid, wrist, hand: r.end };
}

/** Both arms from a left-side hand target and pole, mirrored for the right. */
function symArms(t: Torso, handL: Vec3, poleL: Vec3): [ArmSol, ArmSol] {
  return [arm(t.shoulderL, handL, poleL), arm(t.shoulderR, mirrorX(handL), mirrorX(poleL))];
}

/** Forward-kinematics arm: explicit upper-arm and forearm directions. */
function fkArm(shoulder: Vec3, upperDir: Vec3, foreDir: Vec3): ArmSol {
  const u = normalize(upperDir);
  const elbow = add(shoulder, scale(u, RIG.upperArm));
  const hand = add(elbow, scale(normalize(foreDir), RIG.forearm + RIG.hand));
  return arm(shoulder, hand, u);
}

function symFkArms(t: Torso, upperL: Vec3, foreL: Vec3): [ArmSol, ArmSol] {
  return [fkArm(t.shoulderL, upperL, foreL), fkArm(t.shoulderR, mirrorX(upperL), mirrorX(foreL))];
}

function assemble(t: Torso, arms: [ArmSol, ArmSol], legs: [LegSol, LegSol]): Pose {
  const [aL, aR] = arms;
  const [lL, lR] = legs;
  return {
    pelvis: t.pelvis, spine: t.spine, chest: t.chest, neck: t.neck, head: t.head,
    shoulderL: t.shoulderL, elbowL: aL.elbow, wristL: aL.wrist, handL: aL.hand,
    shoulderR: t.shoulderR, elbowR: aR.elbow, wristR: aR.wrist, handR: aR.hand,
    hipL: t.hipL, kneeL: lL.knee, ankleL: lL.ankle, toeL: lL.toe,
    hipR: t.hipR, kneeR: lR.knee, ankleR: lR.ankle, toeR: lR.toe,
  };
}

/** Ankle z that puts the middle of a flat foot at z = 0. */
const ANKLE_Z = -0.06;

/** Both feet flat, toes turned out; knees track over the toes. */
function stanceLegs(t: Torso, x: number, toeOut: number, ankleZ = ANKLE_Z): [LegSol, LegSol] {
  const pole: Vec3 = [sinD(toeOut), 0.15, cosD(toeOut)];
  return [
    leg(t.hipL, flatFoot(x, ankleZ, toeOut), pole),
    leg(t.hipR, flatFoot(-x, ankleZ, -toeOut), mirrorX(pole)),
  ];
}

const SEAT_TOP = 0.45;

/** Upright torso sitting on a seat at SEAT_TOP, feet flat in front. */
function seated(pitch = 0, neck = 0): { t: Torso; legs: [LegSol, LegSol] } {
  const t = torso({ pelvis: [0, SEAT_TOP + RIG.backDepth, 0], pitch, neck });
  const legs: [LegSol, LegSol] = [
    leg(t.hipL, flatFoot(0.17, 0.4, 6), [0.1, 1, 0.5]),
    leg(t.hipR, flatFoot(-0.17, 0.4, -6), [-0.1, 1, 0.5]),
  ];
  return { t, legs };
}

/** Arms hanging straight down holding something at the sides. */
function hangingArms(t: Torso, out = 0.05): [ArmSol, ArmSol] {
  return symArms(t, add(t.shoulderL, [out, -0.615, 0.02]), [0.2, 0, -1]);
}

// ─── Prop helpers ────────────────────────────────────────────────────────────

const barbell = (c: Vec3, len = 2.2, plateRadius = 0.225): Prop => ({
  kind: "barbell",
  from: [c[0] - len / 2, c[1], c[2]],
  to: [c[0] + len / 2, c[1], c[2]],
  plateRadius,
});
const dumbbell = (center: Vec3, axis: Vec3): Prop => ({ kind: "dumbbell", center, axis: normalize(axis) });
const box = (center: Vec3, size: Vec3): Prop => ({ kind: "box", center, size });
const bench = (center: Vec3, length: number, inclineDeg = 0, yawDeg = 0): Prop => ({
  kind: "bench",
  center,
  length,
  height: center[1],
  inclineDeg,
  yawDeg,
});
const mid = (a: Vec3, b: Vec3): Vec3 => lerp(a, b, 0.5);

// ─── 1. Squat ────────────────────────────────────────────────────────────────

export function squat(p: { load: "back" | "goblet"; bottomY: number; pitchTop: number; pitchBottom: number }): Motion {
  // Load point in the torso frame: `u` up from the pelvis, `f` in front of the spine.
  const u = p.load === "back" ? 0.51 : 0.41;
  const f = p.load === "back" ? -0.085 : 0.18;
  const loadZ = p.load === "back" ? 0 : 0.04; // kept over mid-foot
  return {
    planted: { L: "flat", R: "flat" },
    grips: { L: 0, R: 0 },
    frame(s) {
      const pitch = lerpN(p.pitchTop, p.pitchBottom, s);
      const y = lerpN(STAND_Y, p.bottomY, s);
      const z = loadZ - (u * sinD(pitch) + f * cosD(pitch));
      const t = torso({ pelvis: [0, y, z], pitch, neck: -pitch * 0.6 });
      const load: Vec3 = [0, y + u * cosD(pitch) - f * sinD(pitch), loadZ];
      const legs = stanceLegs(t, 0.2, 22);
      if (p.load === "back") {
        const arms = symArms(t, [0.38, load[1], load[2]], [0.25, -1, -0.45]);
        return { pose: assemble(t, arms, legs), props: [barbell(load)] };
      }
      const hi = add(load, add(scale(t.hi.up, 0.035), [0.02, 0, 0]));
      const lo = add(load, add(scale(t.hi.up, -0.035), [-0.02, 0, 0]));
      const arms: [ArmSol, ArmSol] = [arm(t.shoulderL, hi, [0.6, -1, 0]), arm(t.shoulderR, lo, [-0.6, -1, 0])];
      return { pose: assemble(t, arms, legs), props: [dumbbell(load, t.hi.up)] };
    },
  };
}

// ─── 2. Hinge ────────────────────────────────────────────────────────────────

export function hinge(p: {
  implement: "barbell" | "dumbbells";
  /** Grip height at s = 0 and s = 1. */
  y: [number, number];
  pitch: [number, number];
  /** Grip z at s = 0 and s = 1. */
  z: [number, number];
  /** How far the shoulders sit in front of the grip. */
  fwd: [number, number];
  gripX: number;
  stanceX: number;
  singleLeg?: boolean;
  /** > 1 keeps the torso inclined for longer at the start of the stroke (deadlift off the floor). */
  pitchEase?: number;
}): Motion {
  const reach = ARM_REACH - 0.02;
  return {
    planted: p.singleLeg ? { L: "flat" } : { L: "flat", R: "flat" },
    grips: p.implement === "barbell" ? { L: 0, R: 0 } : { L: 0, R: 1 },
    frame(s) {
      const y = lerpN(p.y[0], p.y[1], s);
      const z = lerpN(p.z[0], p.z[1], s);
      const pitch = lerpN(p.pitch[0], p.pitch[1], Math.pow(s, p.pitchEase ?? 1));
      const fwd = lerpN(p.fwd[0], p.fwd[1], s);
      // Shoulders sit one (nearly straight) arm length above the grip.
      const shY = y + Math.sqrt(reach * reach - fwd * fwd);
      const shZ = z + fwd;
      const t = torso({
        pelvis: [0, shY - TORSO_UP * cosD(pitch), shZ - TORSO_UP * sinD(pitch)],
        pitch,
        neck: -pitch * 0.55,
      });
      const arms = symArms(t, [p.gripX, y, z], [0.3, 0, -1]);
      let legs: [LegSol, LegSol];
      if (p.singleLeg) {
        const stance = leg(t.hipL, flatFoot(0.07, ANKLE_Z, 4), [0, 0.15, 1]);
        // Rear leg swings back in line with the torso.
        const swing = pitch * 0.97;
        const b = basis(swing);
        // As long as possible without pushing the toe through the floor.
        const minAnkleY = RIG.toeHeight + RIG.foot * sinD(FLAT + swing);
        const len = Math.min(LEG_REACH - 0.003, (t.hipR[1] - minAnkleY) / cosD(swing));
        const ankle = add(t.hipR, scale(b.up, -len));
        const toeDir = localDir(b, [0, -sinD(FLAT), cosD(FLAT)]);
        legs = [stance, leg(t.hipR, freeFoot(ankle, toeDir), b.front)];
      } else {
        legs = stanceLegs(t, p.stanceX, 10);
      }
      const props: Prop[] =
        p.implement === "barbell"
          ? [barbell([0, y, z])]
          : [dumbbell(arms[0].hand, [1, 0, 0]), dumbbell(arms[1].hand, [1, 0, 0])];
      return { pose: assemble(t, arms, legs), props };
    },
  };
}

// ─── 3. Split squat / lunge ──────────────────────────────────────────────────

export function split(p: { rear: "box" | "step" }): Motion {
  return {
    planted: { L: "flat" },
    grips: { L: 0, R: 1 },
    frame(s) {
      let t: Torso;
      let legs: [LegSol, LegSol];
      const props: Prop[] = [];
      if (p.rear === "box") {
        // Bulgarian split squat: rear instep rests on a box behind.
        t = torso({ pelvis: [0, lerpN(0.925, 0.53, s), lerpN(0, -0.08, s)], pitch: lerpN(4, 18, s), neck: -lerpN(4, 18, s) * 0.6 });
        const rear = freeFoot([-0.11, 0.49, -0.6], [0, -0.35, -1]);
        legs = [leg(t.hipL, flatFoot(0.11, 0.22, 5), [0, 0.1, 1]), leg(t.hipR, rear, [0, -1, 0.35])];
        props.push(box([-0.11, 0.21, -0.72], [0.4, 0.42, 0.34]));
      } else {
        // Reverse lunge: the right foot steps back onto its toe, then returns.
        const step = smooth(s / 0.9);
        const drop = smooth((s - 0.1) / 0.9);
        const pitch = lerpN(3, 12, s);
        t = torso({ pelvis: [0, lerpN(STAND_Y, 0.55, drop), lerpN(0, -0.42, s)], pitch, neck: -pitch * 0.6 });
        const start = flatFoot(-0.1, ANKLE_Z, -5).toe;
        const toe: Vec3 = [start[0], RIG.toeHeight + 0.06 * Math.sin(Math.PI * step), lerpN(start[2], -0.93, step)];
        const rear = toeFoot(toe, 58 * smooth(s));
        legs = [leg(t.hipL, flatFoot(0.1, ANKLE_Z, 5), [0, 0.1, 1]), leg(t.hipR, rear, [0, -1, 0.4])];
      }
      const arms = hangingArms(t);
      const dbs = [dumbbell(arms[0].hand, [0, 0, 1]), dumbbell(arms[1].hand, [0, 0, 1])];
      return { pose: assemble(t, arms, legs), props: [...dbs, ...props] };
    },
  };
}

// ─── 4. Supine press / fly / skull crusher ───────────────────────────────────

export function supine(p: {
  surface: "bench" | "floor" | "incline";
  mode: "press" | "fly" | "skull" | "pullover";
  implement: "barbell" | "dumbbells";
}): Motion {
  const incline = p.surface === "incline" ? 35 : 0;
  const surfaceY = p.surface === "floor" ? 0 : 0.44;
  const pitch = -(90 - incline);
  const pelvis: Vec3 = [0, surfaceY + RIG.backDepth, 0.3];
  const t = torso({ pelvis, pitch, neck: p.surface === "incline" ? 10 : 0 });
  const ankleZ = pelvis[2] + (p.surface === "floor" ? 0.58 : 0.36);
  const legs: [LegSol, LegSol] = [
    leg(t.hipL, flatFoot(0.22, ankleZ, 8), [0.15, 1, 0.3]),
    leg(t.hipR, flatFoot(-0.22, ankleZ, -8), [-0.15, 1, 0.3]),
  ];
  const furniture: Prop[] = [];
  if (p.surface === "bench") furniture.push(bench([0, surfaceY, -0.13], 1.2));
  if (p.surface === "incline") {
    const back = add(local(pelvis, t.lo, [0, 0.36, 0]), scale(t.lo.front, -RIG.backDepth));
    furniture.push(bench(back, 0.95, incline), box([0, surfaceY - 0.04, pelvis[2] + 0.1], [0.3, 0.08, 0.36]));
  }
  return {
    planted: { L: "flat", R: "flat" },
    grips: p.implement === "barbell" || p.mode === "pullover" ? { L: 0, R: 0 } : { L: 0, R: 1 },
    frame(s) {
      let arms: [ArmSol, ArmSol];
      let axis: Vec3 = [1, 0, 0];
      if (p.mode === "pullover") {
        // One dumbbell held in both hands sweeps from above the chest to behind the head.
        const a = lerpN(2, 96, s);
        const dir: Vec3 = [0, cosD(a), -sinD(a)];
        const c = add(t.sc, scale(dir, 0.585));
        arms = [
          arm(t.shoulderL, add(c, [0.025, 0, 0]), [0.6, 0.5, 0.6]),
          arm(t.shoulderR, add(c, [-0.025, 0, 0]), [-0.6, 0.5, 0.6]),
        ];
        return { pose: assemble(t, arms, legs), props: [dumbbell(c, dir), ...furniture] };
      }
      if (p.mode === "press") {
        // s = 0 locked out above the shoulders, s = 1 at the chest (or upper arms on the floor).
        const wide = p.implement === "barbell" ? [0.36, 0.36] : [0.24, 0.35];
        const bottomY = p.surface === "floor" ? 0.31 : p.surface === "incline" ? 0.1 : 0.15;
        const hand: Vec3 = [lerpN(wide[0], wide[1], s), t.sc[1] + lerpN(0.6, bottomY, s), t.sc[2] + lerpN(0, 0.11, s)];
        arms = symArms(t, hand, [0.7, -1, 0.3]);
      } else if (p.mode === "fly") {
        // Arms sweep out and down in an arc with a fixed slight elbow bend.
        const a = lerpN(7, 80, s);
        const r = 0.575;
        const hand = add(t.shoulderL, [r * sinD(a), r * cosD(a), 0.04 * sinD(a)]);
        arms = symArms(t, hand, [0.4, -1, 0.3]);
        axis = [0, 0, 1];
      } else {
        // Skull crusher: upper arms stay put, tilted toward the head; only the elbows bend.
        const upperA = 14;
        const foreA = upperA + lerpN(8, 118, s);
        arms = symFkArms(t, [-0.02, cosD(upperA), -sinD(upperA)], [-0.02, cosD(foreA), -sinD(foreA)]);
        // Neutral grip: handles stay perpendicular to the forearms so they pass beside the head.
        axis = [0, sinD(foreA), cosD(foreA)];
      }
      const props: Prop[] =
        p.implement === "barbell"
          ? [barbell(mid(arms[0].hand, arms[1].hand))]
          : [dumbbell(arms[0].hand, axis), dumbbell(arms[1].hand, axis)];
      return { pose: assemble(t, arms, legs), props: [...props, ...furniture] };
    },
  };
}

// ─── 5. Overhead press ───────────────────────────────────────────────────────

export function overhead(p: { mode: "barbell" | "dumbbell" | "arnold"; seated?: boolean }): Motion {
  return {
    planted: { L: "flat", R: "flat" },
    grips: p.mode === "barbell" ? { L: 0, R: 0 } : { L: 0, R: 1 },
    frame(s) {
      // Slight lean back at the bottom so the bar clears the chin.
      const pitch = p.mode === "barbell" ? lerpN(-5, 0, s) : 0;
      let t = torso({ pelvis: [0, STAND_Y, 0], pitch, neck: -pitch });
      let legs = stanceLegs(t, 0.17, 12);
      const furniture: Prop[] = [];
      if (p.seated) {
        // Seat with a near-vertical backrest.
        ({ t, legs } = seated(-5, 5));
        const back = add(local(t.pelvis, t.lo, [0, 0.36, 0]), scale(t.lo.front, -(RIG.backDepth + 0.02)));
        furniture.push(bench([0, SEAT_TOP, 0.06], 0.46), bench(back, 0.8, 85));
      }
      let arms: [ArmSol, ArmSol];
      if (p.mode === "barbell") {
        // Bar starts on the front of the shoulders and finishes over the mid-foot.
        const z = lerpN(0.1, 0, smooth((s - 0.4) / 0.6));
        arms = symArms(t, [0.29, t.sc[1] + lerpN(-0.02, 0.61, s), z], [0.35, -1, 0.5]);
        return { pose: assemble(t, arms, legs), props: [barbell(mid(arms[0].hand, arms[1].hand))] };
      }
      if (p.mode === "dumbbell") {
        const hand: Vec3 = [lerpN(0.35, 0.2, s), t.sc[1] + lerpN(0.04, 0.61, s), t.sc[2] + lerpN(0.04, 0, s)];
        arms = symArms(t, hand, [1, -0.7, 0.15]);
      } else {
        // Arnold: start in front of the chest, elbows forward; rotate out while pressing.
        const hand: Vec3 = [
          lerpN(0.12, 0.2, s) + 0.15 * Math.sin(Math.PI * s),
          t.sc[1] + lerpN(-0.03, 0.61, s),
          t.sc[2] + lerpN(0.22, 0, smooth(s)),
        ];
        arms = symArms(t, hand, lerp([0.1, -1, 0.5], [1, -0.7, 0.1], smooth(s * 1.4)));
      }
      const props = [dumbbell(arms[0].hand, [1, 0, 0]), dumbbell(arms[1].hand, [1, 0, 0])];
      return { pose: assemble(t, arms, legs), props: [...props, ...furniture] };
    },
  };
}

// ─── 6. One-arm row ──────────────────────────────────────────────────────────

export function row(): Motion {
  // Left knee and left hand on a bench, right foot on the floor, right arm rows.
  const benchX = 0.24;
  const benchTop = 0.44;
  return {
    planted: { R: "flat" },
    grips: { R: 0 },
    frame(s) {
      const t = torso({ pelvis: [0.04, 0.9, -0.25], pitch: 78, neck: -40 });
      const support = arm(t.shoulderL, [benchX + 0.02, benchTop + 0.03, t.sc[2] + 0.27], [0.5, 0, -1]);
      // Dumbbell hangs under the shoulder, then is pulled to the hip.
      const hang = add(t.shoulderR, [-0.02, -0.615, 0]);
      const top = add(t.shoulderR, [-0.06, -0.14, -0.24]);
      const rowing = arm(t.shoulderR, lerp(hang, top, s), [-0.35, 1, -0.6]);
      const kneeling = leg(t.hipL, freeFoot([benchX, benchTop + 0.06, -0.72], [0, -0.2, -1]), [0, -1, 1]);
      const standing = leg(t.hipR, flatFoot(-0.22, -0.3, -8), [-0.2, 0.2, 1]);
      return {
        pose: assemble(t, [support, rowing], [kneeling, standing]),
        props: [dumbbell(rowing.hand, [0, 0, 1]), bench([benchX, benchTop, -0.2], 1.3)],
      };
    },
  };
}

// ─── 7. Pulldown ─────────────────────────────────────────────────────────────

export function pulldown(): Motion {
  const seatTop = 0.45;
  return {
    planted: { L: "flat", R: "flat" },
    grips: { L: 0, R: 0 },
    frame(s) {
      const pitch = lerpN(-6, -16, s);
      const t = torso({ pelvis: [0, seatTop + RIG.backDepth, 0], pitch, neck: -pitch * 0.5 });
      const legs: [LegSol, LegSol] = [
        leg(t.hipL, flatFoot(0.17, 0.4, 6), [0.1, 1, 0.5]),
        leg(t.hipR, flatFoot(-0.17, 0.4, -6), [-0.1, 1, 0.5]),
      ];
      const hand: Vec3 = [0.4, t.sc[1] + lerpN(0.56, 0, s), t.sc[2] + lerpN(0.1, 0.15, s)];
      const arms = symArms(t, hand, [0.6, -1, -0.35]);
      const bar = mid(arms[0].hand, arms[1].hand);
      return {
        pose: assemble(t, arms, legs),
        props: [
          barbell(bar, 1.2, 0),
          { kind: "cable", from: [0, 2.3, 0.06], to: bar },
          box([0, seatTop / 2, 0.05], [0.4, seatTop, 0.4]),
          box([0, 0.66, 0.36], [0.5, 0.08, 0.14]),
        ],
      };
    },
  };
}

// ─── 8. Curl ─────────────────────────────────────────────────────────────────

/** Unit vector in the sagittal plane, `a` degrees from straight down toward the front. */
const swing = (a: number, x = 0): Vec3 => normalize([x, -cosD(a), sinD(a)]);

export function curl(p: { grip: "supinated" | "hammer" }): Motion {
  return {
    planted: { L: "flat", R: "flat" },
    grips: { L: 0, R: 1 },
    frame(s) {
      const t = torso({ pelvis: [0, STAND_Y, 0] });
      const legs = stanceLegs(t, 0.15, 10);
      const upperA = lerpN(-2, 14, s);
      const foreA = upperA + lerpN(8, 138, s);
      const arms = symFkArms(t, swing(upperA), swing(foreA, 0.06));
      const axis: Vec3 = p.grip === "hammer" ? [0, sinD(foreA), cosD(foreA)] : [1, 0, 0];
      return {
        pose: assemble(t, arms, legs),
        props: [dumbbell(arms[0].hand, axis), dumbbell(arms[1].hand, axis)],
      };
    },
  };
}

// ─── 9. Raise ────────────────────────────────────────────────────────────────

export function raise(p: { direction: "lateral" | "front" | "reverse"; seated?: boolean }): Motion {
  const r = ARM_REACH - 0.02;
  return {
    planted: { L: "flat", R: "flat" },
    grips: { L: 0, R: 1 },
    frame(s) {
      let t: Torso;
      let arms: [ArmSol, ArmSol];
      let axis: Vec3;
      const sit = p.seated ? seated() : null;
      if (p.direction === "lateral") {
        t = sit ? sit.t : torso({ pelvis: [0, STAND_Y, 0] });
        const a = lerpN(7, 86, s);
        arms = symArms(t, add(t.shoulderL, [r * sinD(a), -r * cosD(a), 0.07 * sinD(a)]), [0, 0.3, -1]);
        axis = [0, 0, 1];
      } else if (p.direction === "front") {
        t = torso({ pelvis: [0, STAND_Y, 0] });
        const a = lerpN(9, 92, s);
        arms = symArms(t, add(t.shoulderL, [0.02, -r * cosD(a), r * sinD(a)]), [0.25, -0.6, -1]);
        axis = [1, 0, 0];
      } else {
        // Bent over, arms open out to the sides.
        t = torso({ pelvis: [0, 0.87, -0.26], pitch: 65, neck: -35 });
        const a = lerpN(5, 82, s);
        arms = symArms(t, add(t.shoulderL, [r * sinD(a), -r * cosD(a), 0]), [0, 1, -0.4]);
        axis = [0, 0, 1];
      }
      const legs = sit ? sit.legs : stanceLegs(t, 0.15, 10);
      const props = [dumbbell(arms[0].hand, axis), dumbbell(arms[1].hand, axis)];
      // Seated: on the end of a flat bench running back behind the lifter.
      if (sit) props.push(bench([0, SEAT_TOP, -0.38], 1.1));
      return { pose: assemble(t, arms, legs), props };
    },
  };
}

// ─── 10. Triceps ─────────────────────────────────────────────────────────────

export function triceps(p: { mode: "pushdown" | "overhead" }): Motion {
  return {
    planted: { L: "flat", R: "flat" },
    grips: { L: 0, R: 0 },
    frame(s) {
      if (p.mode === "pushdown") {
        // Elbows pinned at the sides; forearms sweep from chest height to straight down.
        const t = torso({ pelvis: [0, STAND_Y - 0.005, -0.04], pitch: 10, neck: -6 });
        const legs = stanceLegs(t, 0.15, 10);
        const upperA = 6;
        const foreA = upperA + lerpN(118, 5, s);
        const arms = symFkArms(t, swing(upperA), swing(foreA, -0.26));
        const bar = mid(arms[0].hand, arms[1].hand);
        return {
          pose: assemble(t, arms, legs),
          props: [barbell(bar, 0.5, 0), { kind: "cable", from: [0, 2.1, 0.5], to: bar }],
        };
      }
      // Overhead extension: one dumbbell lowered behind the head, then pressed up.
      const t = torso({ pelvis: [0, STAND_Y, 0] });
      const legs = stanceLegs(t, 0.15, 10);
      const c: Vec3 = [0, t.sc[1] + lerpN(0.1, 0.59, s), t.sc[2] + lerpN(-0.21, -0.02, s * s * s)];
      const arms: [ArmSol, ArmSol] = [
        arm(t.shoulderL, add(c, [0.025, 0.03, 0]), [0.5, 0.8, 0.9]),
        arm(t.shoulderR, add(c, [-0.025, -0.03, 0]), [-0.5, 0.8, 0.9]),
      ];
      return { pose: assemble(t, arms, legs), props: [dumbbell(c, [0, 1, 0])] };
    },
  };
}

// ─── 11. Leg machine ─────────────────────────────────────────────────────────

export function legMachine(p: { mode: "extension" | "curl" }): Motion {
  return {
    planted: {},
    grips: {},
    frame(s) {
      if (p.mode === "extension") {
        // Seated, thighs supported; shins swing from hanging to horizontal.
        const seatTop = 0.56;
        const t = torso({ pelvis: [0, seatTop + RIG.backDepth, -0.1], pitch: -12, neck: 8 });
        const a = lerpN(-8, 82, s);
        const shinDir: Vec3 = [0, -cosD(a), sinD(a)];
        const toeDir: Vec3 = [0, sinD(a), cosD(a)];
        const one = (hip: Vec3): LegSol => {
          const knee = add(hip, scale(normalize([0, -0.08, 1]), RIG.thigh));
          return leg(hip, freeFoot(add(knee, scale(shinDir, RIG.shin)), toeDir), [0, 0.4, 1]);
        };
        const legs: [LegSol, LegSol] = [one(t.hipL), one(t.hipR)];
        const arms = symArms(t, [0.25, seatTop + 0.02, t.pelvis[2] + 0.06], [0.3, 0.2, -1]);
        const ankle = mid(legs[0].ankle, legs[1].ankle);
        const backrest = add(local(t.pelvis, t.lo, [0, 0.32, 0]), scale(t.lo.front, -RIG.backDepth - 0.02));
        return {
          pose: assemble(t, arms, legs),
          props: [
            box(add(ankle, add(scale(toeDir, 0.08), scale(shinDir, -0.06))), [0.42, 0.1, 0.1]),
            box([0, seatTop / 2, 0.07], [0.44, seatTop, 0.5]),
            bench(backrest, 0.7, 78),
          ],
        };
      }
      // Lying leg curl: prone on a bench, heels curl toward the glutes.
      const top = 0.5;
      const t = torso({ pelvis: [0, top + RIG.backDepth, 0], pitch: 90, neck: -25 });
      const a = lerpN(6, 115, s);
      const shinDir: Vec3 = [0, sinD(a), -cosD(a)];
      const shinFront: Vec3 = [0, -cosD(a), -sinD(a)];
      const one = (hip: Vec3): LegSol => {
        const knee = add(hip, scale(normalize([0, -0.03, -1]), RIG.thigh));
        const foot = freeFoot(add(knee, scale(shinDir, RIG.shin)), add(scale(shinFront, 0.8), scale(shinDir, 0.6)));
        return leg(hip, foot, [0, -1, -0.3]);
      };
      const legs: [LegSol, LegSol] = [one(t.hipL), one(t.hipR)];
      const arms = symArms(t, [0.25, top - 0.08, t.sc[2] + 0.08], [1, -0.2, -0.4]);
      const ankle = mid(legs[0].ankle, legs[1].ankle);
      return {
        pose: assemble(t, arms, legs),
        props: [box(add(ankle, scale(shinFront, -0.08)), [0.42, 0.1, 0.1]), bench([0, top, 0.12], 1.15)],
      };
    },
  };
}

// ─── 12. Calf raise ──────────────────────────────────────────────────────────

export function calfRaise(): Motion {
  return {
    planted: { L: "toe", R: "toe" },
    grips: { L: 0, R: 1 },
    frame(s) {
      const feet = [flatFoot(0.12, ANKLE_Z, 0), flatFoot(-0.12, ANKLE_Z, 0)].map((f) => toeFoot(f.toe, 46 * s));
      // The whole body rides up and slightly forward with the ankles.
      const dy = feet[0].ankle[1] - RIG.ankleHeight;
      const dz = feet[0].ankle[2] - ANKLE_Z;
      const t = torso({ pelvis: [0, STAND_Y + dy, dz * 0.9] });
      const legs: [LegSol, LegSol] = [leg(t.hipL, feet[0], [0, 0, 1]), leg(t.hipR, feet[1], [0, 0, 1])];
      const arms = hangingArms(t);
      return {
        pose: assemble(t, arms, legs),
        props: [dumbbell(arms[0].hand, [0, 0, 1]), dumbbell(arms[1].hand, [0, 0, 1])],
      };
    },
  };
}

// ─── 13. Ab rollout ──────────────────────────────────────────────────────────

export function rollout(): Motion {
  const radius = 0.1;
  const hipX = RIG.hipOffset[0];
  return {
    planted: { L: "toe", R: "toe" },
    grips: { L: 0, R: 0 },
    frame(s) {
      // Knees stay on the floor; the thighs tip forward as the wheel rolls out.
      const thighA = lerpN(-15, 57, s);
      const pitch = lerpN(70, 84, s);
      const lo = basis(pitch);
      const knee: Vec3 = [0, 0.06, 0];
      const hipC = add(knee, [0, RIG.thigh * cosD(thighA), RIG.thigh * sinD(thighA)]);
      const t = torso({ pelvis: add(hipC, scale(lo.up, -RIG.hipOffset[1])), pitch, neck: -40 });
      const one = (sx: number, hip: Vec3): LegSol => {
        const ankle = add([sx, knee[1], knee[2]], scale(normalize([0, 0.07, -1]), RIG.shin));
        return leg(hip, freeFoot(ankle, [0, -0.37, -0.93]), [0, -1, 0.6]);
      };
      const legs: [LegSol, LegSol] = [one(hipX, t.hipL), one(-hipX, t.hipR)];
      // Arms stay straight: the wheel sits one arm length from the shoulders.
      const r = ARM_REACH - 0.005;
      const dy = t.sc[1] - radius;
      const wheelZ = t.sc[2] + Math.sqrt(Math.max(0, r * r - dy * dy));
      const arms = symArms(t, [0.16, radius, wheelZ], [0.3, 0.4, -1]);
      return {
        pose: assemble(t, arms, legs),
        props: [{ kind: "wheel", center: [0, radius, wheelZ], axis: [1, 0, 0], radius }],
      };
    },
  };
}

// ─── 14. Back extension ──────────────────────────────────────────────────────

export function backExtension(): Motion {
  const legA = 45; // 45-degree hyperextension bench
  const legB = basis(legA);
  const hipX = RIG.hipOffset[0];
  const ankleC: Vec3 = [0, 0.2, -0.55];
  const hipC = add(ankleC, scale(legB.up, LEG_REACH - 0.004));
  return {
    planted: {},
    grips: {},
    frame(s) {
      // s = 0 body in a straight line, s = 1 folded at the hips.
      const pitch = lerpN(legA, 112, s);
      const lo = basis(pitch);
      const t = torso({
        pelvis: add(hipC, scale(lo.up, -RIG.hipOffset[1])),
        pitch,
        bend: 14 * s,
        neck: -lerpN(10, 30, s),
      });
      const one = (sx: number, hip: Vec3): LegSol =>
        leg(hip, freeFoot(add(ankleC, [sx, 0, 0]), legB.front), legB.front);
      const legs: [LegSol, LegSol] = [one(hipX, t.hipL), one(-hipX, t.hipR)];
      // Arms crossed over the chest.
      const arms: [ArmSol, ArmSol] = [
        arm(t.shoulderL, local(t.chest, t.hi, [-0.09, 0.02, 0.12]), localDir(t.hi, [0.6, -1, 0.2])),
        arm(t.shoulderR, local(t.chest, t.hi, [0.09, -0.05, 0.12]), localDir(t.hi, [-0.6, -1, 0.2])),
      ];
      const pad = add(hipC, scale(legB.front, 0.16));
      return {
        pose: assemble(t, arms, legs),
        props: [
          box(pad, [0.46, 0.14, 0.2]),
          box([0, pad[1] / 2 - 0.03, pad[2] + 0.02], [0.12, pad[1] - 0.06, 0.12]),
          box(add(ankleC, scale(legB.front, -0.1)), [0.42, 0.1, 0.1]),
        ],
      };
    },
  };
}

// ─── 15. Hip thrust ──────────────────────────────────────────────────────────

export function hipThrust(p: { machine?: boolean } = {}): Motion {
  const benchTop = 0.42;
  // The upper back pivots on the bench edge.
  const pivot: Vec3 = [0, benchTop + RIG.backDepth, 0];
  const chestUp = RIG.pelvisToSpine + RIG.spineToChest;
  return {
    planted: { L: "flat", R: "flat" },
    grips: p.machine ? {} : { L: 0, R: 0 },
    frame(s) {
      const pitch = lerpN(-40, -88, s);
      const b = basis(pitch);
      const t = torso({ pelvis: add(pivot, scale(b.up, -chestUp)), pitch, neck: lerpN(25, 50, s) });
      const legs: [LegSol, LegSol] = [
        leg(t.hipL, flatFoot(0.18, 0.86, 8), [0.1, 1, 0.2]),
        leg(t.hipR, flatFoot(-0.18, 0.86, -8), [-0.1, 1, 0.2]),
      ];
      const db = add(t.pelvis, scale(b.front, 0.14));
      if (p.machine) {
        // Glute drive machine: pivoting back pad, padded bar across the hips, foot plate.
        const arms = symArms(t, add(db, [0.3, 0, 0]), [1, -0.3, 0]);
        const backPad = add(local(t.spine, t.hi, [0, 0.16, 0]), scale(t.hi.front, -(RIG.backDepth + 0.05)));
        return {
          pose: assemble(t, arms, legs),
          props: [
            box(db, [0.7, 0.1, 0.12]),
            box(backPad, [0.46, 0.12, 0.34]),
            box([0, (pivot[1] - 0.2) / 2, -0.2], [0.3, pivot[1] - 0.2, 0.1]),
            box([0, 0.005, 0.93], [0.6, 0.01, 0.42]),
          ],
        };
      }
      const arms = symArms(t, add(db, [0.09, 0, 0]), [1, -0.3, 0]);
      return {
        pose: assemble(t, arms, legs),
        props: [dumbbell(db, [1, 0, 0]), bench([0, benchTop, -0.17], 1.2, 0, 90)],
      };
    },
  };
}

// ─── 16. Face pull ───────────────────────────────────────────────────────────

export function facePull(): Motion {
  const anchor: Vec3 = [0, 1.6, 1.25];
  return {
    planted: { L: "flat", R: "flat" },
    grips: { L: 0, R: 1 },
    frame(s) {
      const pitch = lerpN(-3, -8, s);
      const t = torso({ pelvis: [0, STAND_Y, -0.02], pitch, neck: -pitch });
      const legs = stanceLegs(t, 0.18, 10);
      const start: Vec3 = [0.07, t.sc[1] + 0.06, t.sc[2] + 0.57];
      const end: Vec3 = [0.3, t.sc[1] + 0.11, t.sc[2] + 0.1];
      // Elbows travel high and wide as the rope comes to the face.
      const arms = symArms(t, lerp(start, end, s), [1, lerpN(0, 0.4, s), -0.2]);
      return {
        pose: assemble(t, arms, legs),
        props: [
          { kind: "cable", from: anchor, to: arms[0].hand },
          { kind: "cable", from: anchor, to: arms[1].hand },
        ],
      };
    },
  };
}

// ─── 17. Pendulum squat ──────────────────────────────────────────────────────

export function pendulumSquat(): Motion {
  // Feet forward on the plate, back against a pad that swings down and slightly back.
  const ankleZ = 0.05;
  return {
    planted: { L: "flat", R: "flat" },
    grips: {},
    frame(s) {
      const pitch = lerpN(-10, 6, s);
      const pelvis: Vec3 = [0, lerpN(0.93, 0.43, s), lerpN(-0.1, -0.22, s) - 0.04 * Math.sin(Math.PI * s)];
      const t = torso({ pelvis, pitch, neck: -pitch * 0.5 });
      const legs = stanceLegs(t, 0.2, 18, ankleZ);
      // Hands on the handles beside the shoulder pads.
      const arms = symArms(t, local(t.chest, t.hi, [0.25, 0.1, 0.14]), [0.4, -1, 0.2]);
      const backPad = local(t.spine, t.hi, [0, 0.1, -(RIG.backDepth + 0.05)]);
      return {
        pose: assemble(t, arms, legs),
        props: [
          box(backPad, [0.42, 0.6, 0.1]),
          box(local(t.chest, t.hi, [0.19, 0.16, 0.02]), [0.14, 0.08, 0.24]),
          box(local(t.chest, t.hi, [-0.19, 0.16, 0.02]), [0.14, 0.08, 0.24]),
          box([0, 0.005, ankleZ + 0.07], [0.62, 0.01, 0.46]),
        ],
      };
    },
  };
}
