import { MOTIONS } from "./motions";
import type { Frame, JointName, Pose, Prop } from "./rig";
import { BONES } from "./rig";
import type { Vec3 } from "./vec";
import { add, clamp, distance, dot, lerp, normalize, scale, smooth, sub } from "./vec";

export type { Vec3, JointName, Pose, Prop, Frame };
export { BONES };

export interface MotionInfo {
  exerciseId: string;
  /** Seconds for one full rep at normal speed (down + up, including pauses). */
  repSeconds: number;
  /** Best default camera direction. */
  view: "front" | "side" | "threeQuarter";
  /** Joint or prop point whose path is worth tracing (bar path), if any. */
  trace?: "barCenter" | "handL" | "handR";
  /** One-line description of the movement phases for a caption. */
  caption: string;
}

/**
 * Maps rep time t in [0, 1) to stroke progress s in [0, 1].
 * s = 0 at t = 0, s = 1 at t = 0.5, back to 0 before t = 1, with zero velocity at
 * every stop so the loop is seamless. The lowering (eccentric) half is the slower one.
 */
export function strokePhase(t: number, eccentricFirst: boolean): number {
  // [start, end] of the outbound and return moves; the gaps are pauses.
  const out: [number, number] = eccentricFirst ? [0, 0.44] : [0, 0.4];
  const back: [number, number] = eccentricFirst ? [0.54, 0.92] : [0.5, 0.95];
  if (t <= out[1]) return smooth((t - out[0]) / (out[1] - out[0]));
  if (t < back[0]) return 1;
  return 1 - smooth((t - back[0]) / (back[1] - back[0]));
}

const wrap = (t: number): number => {
  const u = t % 1;
  return u < 0 ? u + 1 : u;
};

/** t in [0, 1] is one full rep: 0 = start, 0.5 = end of the working stroke, 1 = back at start. Any t is taken modulo 1. */
export function sampleFrame(exerciseId: string, t: number): Frame | null {
  if (!hasMotion(exerciseId) || !Number.isFinite(t)) return null;
  const spec = MOTIONS[exerciseId];
  return spec.motion.frame(strokePhase(wrap(t), spec.eccentricFirst));
}

export function getMotionInfo(exerciseId: string): MotionInfo | null {
  if (!hasMotion(exerciseId)) return null;
  return { exerciseId, ...MOTIONS[exerciseId].info };
}

export function hasMotion(exerciseId: string): boolean {
  return Object.prototype.hasOwnProperty.call(MOTIONS, exerciseId);
}

/** The traced point (bar centre or a hand) at t, or null when the motion has no trace. */
export function tracePoint(exerciseId: string, t: number): Vec3 | null {
  if (!hasMotion(exerciseId)) return null;
  const trace = MOTIONS[exerciseId].info.trace;
  if (!trace) return null;
  const frame = sampleFrame(exerciseId, t);
  if (!frame) return null;
  if (trace === "barCenter") {
    const bar = frame.props.find((p) => p.kind === "barbell");
    if (!bar || bar.kind !== "barbell") return null;
    return lerp(bar.from, bar.to, 0.5);
  }
  return frame.pose[trace];
}

function distToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const u = l2 < 1e-12 ? 0 : clamp(dot(sub(p, a), ab) / l2, 0, 1);
  return distance(p, add(a, scale(ab, u)));
}

/**
 * Distance from a point (a hand) to the part of a prop that can be held:
 * the shaft of a barbell (inside the sleeves), a dumbbell handle, the free end of a
 * cable, or the handles of an ab wheel. Infinity for props that cannot be gripped.
 */
export function gripDistance(prop: Prop, point: Vec3): number {
  switch (prop.kind) {
    case "barbell": {
      const mid = lerp(prop.from, prop.to, 0.5);
      const half = Math.min(distance(prop.from, prop.to) / 2, 0.65);
      const axis = normalize(sub(prop.to, prop.from), [1, 0, 0]);
      return distToSegment(point, sub(mid, scale(axis, half)), add(mid, scale(axis, half)));
    }
    case "dumbbell": {
      const axis = normalize(prop.axis, [1, 0, 0]);
      return distToSegment(point, sub(prop.center, scale(axis, 0.12)), add(prop.center, scale(axis, 0.12)));
    }
    case "cable":
      return distance(point, prop.to);
    case "wheel": {
      const axis = normalize(prop.axis, [1, 0, 0]);
      return distToSegment(point, sub(prop.center, scale(axis, 0.18)), add(prop.center, scale(axis, 0.18)));
    }
    default:
      return Infinity;
  }
}
