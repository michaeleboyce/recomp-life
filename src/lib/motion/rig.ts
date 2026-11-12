import type { Vec3 } from "./vec";

// Metres. +Y up, floor at y = 0. The figure faces +Z. +X is the figure's LEFT.
export type JointName =
  | "pelvis" | "spine" | "chest" | "neck" | "head"
  | "shoulderL" | "elbowL" | "wristL" | "handL"
  | "shoulderR" | "elbowR" | "wristR" | "handR"
  | "hipL" | "kneeL" | "ankleL" | "toeL"
  | "hipR" | "kneeR" | "ankleR" | "toeR";

export const JOINT_NAMES: readonly JointName[] = [
  "pelvis", "spine", "chest", "neck", "head",
  "shoulderL", "elbowL", "wristL", "handL",
  "shoulderR", "elbowR", "wristR", "handR",
  "hipL", "kneeL", "ankleL", "toeL",
  "hipR", "kneeR", "ankleR", "toeR",
];

export type Pose = Record<JointName, Vec3>;

/** Limb segments the renderer draws as capsules. Every one keeps a constant length. */
export const BONES: readonly [JointName, JointName][] = [
  ["pelvis", "spine"], ["spine", "chest"], ["chest", "neck"], ["neck", "head"],
  ["chest", "shoulderL"], ["shoulderL", "elbowL"], ["elbowL", "wristL"], ["wristL", "handL"],
  ["chest", "shoulderR"], ["shoulderR", "elbowR"], ["elbowR", "wristR"], ["wristR", "handR"],
  ["pelvis", "hipL"], ["hipL", "kneeL"], ["kneeL", "ankleL"], ["ankleL", "toeL"],
  ["pelvis", "hipR"], ["hipR", "kneeR"], ["kneeR", "ankleR"], ["ankleR", "toeR"],
];

export type Prop =
  | { kind: "barbell"; from: Vec3; to: Vec3; plateRadius: number }
  | { kind: "dumbbell"; center: Vec3; axis: Vec3 }
  | { kind: "bench"; center: Vec3; length: number; height: number; inclineDeg: number; yawDeg: number }
  | { kind: "box"; center: Vec3; size: Vec3 }
  | { kind: "cable"; from: Vec3; to: Vec3 }
  | { kind: "wheel"; center: Vec3; axis: Vec3; radius: number };

export interface Frame {
  pose: Pose;
  props: Prop[];
}

/**
 * Segment lengths for a ~1.75 m figure. "hand" is the grip centre (middle of the palm),
 * so wrist -> hand is short. The head joint is the centre of the head (radius ~0.11).
 */
export const RIG = {
  pelvisToSpine: 0.16,
  spineToChest: 0.26,
  chestToNeck: 0.12,
  neckToHead: 0.15,
  /** Left shoulder in the chest frame (x mirrored for the right). */
  shoulderOffset: [0.19, 0.06, 0] as Vec3,
  /** Left hip in the pelvis frame (x mirrored for the right). */
  hipOffset: [0.095, -0.03, 0] as Vec3,
  upperArm: 0.31,
  forearm: 0.25,
  hand: 0.07,
  thigh: 0.44,
  shin: 0.43,
  foot: 0.19,
  /** Ankle joint height with the foot flat on the floor. */
  ankleHeight: 0.08,
  /** Toe joint height with the foot on the floor. */
  toeHeight: 0.02,
  /** Distance from the spine joint line to the surface of the back (for lying on benches). */
  backDepth: 0.1,
  headRadius: 0.11,
} as const;

/** Pelvis height when standing with almost-straight legs. */
export const STAND_Y = 0.955;
