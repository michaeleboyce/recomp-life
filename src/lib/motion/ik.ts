import type { Vec3 } from "./vec";
import { add, clamp, cross, dot, length, normalize, scale, sub } from "./vec";

export interface TwoBoneResult {
  /** Mid joint (elbow / knee). */
  mid: Vec3;
  /** End joint actually reached (equals the target when reachable). */
  end: Vec3;
  /** False when the target was out of reach and the chain was clamped. */
  reached: boolean;
}

/**
 * Analytic two-bone IK.
 *
 * @param root   fixed joint (shoulder / hip)
 * @param target desired end position (hand / ankle)
 * @param l1     length root -> mid
 * @param l2     length mid -> end
 * @param pole   direction hint: the mid joint bends toward this direction
 *               (only its component perpendicular to root->target matters)
 *
 * Both segment lengths are always preserved. If the target is farther than
 * l1 + l2 (or closer than |l1 - l2|) the end is clamped onto the root->target ray.
 */
export function solveTwoBone(root: Vec3, target: Vec3, l1: number, l2: number, pole: Vec3): TwoBoneResult {
  const toTarget = sub(target, root);
  const d = length(toTarget);
  const dir = normalize(toTarget, [0, -1, 0]);
  const dc = clamp(d, Math.abs(l1 - l2) + 1e-6, l1 + l2);
  const reached = Math.abs(dc - d) < 1e-9;

  // Law of cosines: angle at the root between root->target and root->mid.
  const cosA = clamp((l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc), -1, 1);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

  // Bend direction: the pole with its along-the-chain component removed.
  let perp = sub(pole, scale(dir, dot(pole, dir)));
  if (length(perp) < 1e-6) {
    perp = cross(dir, [1, 0, 0]);
    if (length(perp) < 1e-6) perp = cross(dir, [0, 0, 1]);
  }
  perp = normalize(perp);

  const mid = add(root, add(scale(dir, l1 * cosA), scale(perp, l1 * sinA)));
  const end = add(root, scale(dir, dc));
  return { mid, end, reached };
}
