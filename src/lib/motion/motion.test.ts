import { describe, expect, it } from "vitest";
import { EXERCISES } from "@/lib/exercises";
import { solveTwoBone } from "./ik";
import { MOTIONS } from "./motions";
import { BONES, JOINT_NAMES, RIG } from "./rig";
import { getMotionInfo, gripDistance, hasMotion, sampleFrame, tracePoint } from "./sample";
import type { Frame, Vec3 } from "./sample";
import { distance, dot, length, normalize, scale, sub } from "./vec";

const IDS = Object.keys(EXERCISES);
const TS = Array.from({ length: 21 }, (_, i) => i / 20);

function frames(id: string): Frame[] {
  return TS.map((t) => {
    const f = sampleFrame(id, t);
    if (!f) throw new Error(`no frame for ${id} at ${t}`);
    return f;
  });
}

describe("two-bone IK", () => {
  const root: Vec3 = [0.2, 1.4, 0];

  it("reaches reachable targets within 1 mm and preserves both lengths", () => {
    const targets: Vec3[] = [[0.3, 1.0, 0.2], [0.2, 1.9, 0.05], [0.6, 1.4, -0.1], [0.25, 1.35, 0.3], [0.2, 0.85, 0]];
    for (const target of targets) {
      const r = solveTwoBone(root, target, 0.29, 0.34, [0, -1, -1]);
      expect(r.reached).toBe(true);
      expect(distance(r.end, target)).toBeLessThan(0.001);
      expect(distance(root, r.mid)).toBeCloseTo(0.29, 6);
      expect(distance(r.mid, r.end)).toBeCloseTo(0.34, 6);
    }
  });

  it("clamps unreachable targets onto the ray, keeping lengths", () => {
    const r = solveTwoBone(root, [0.2, 3.4, 0], 0.29, 0.34, [0, 0, 1]);
    expect(r.reached).toBe(false);
    expect(distance(root, r.end)).toBeCloseTo(0.63, 6);
    expect(distance(root, r.mid)).toBeCloseTo(0.29, 6);
    expect(distance(r.mid, r.end)).toBeCloseTo(0.34, 6);
    expect(r.end[0]).toBeCloseTo(0.2, 6);
    expect(r.end[1]).toBeGreaterThan(root[1]);
    // too close: clamped to |l1 - l2|
    const near = solveTwoBone(root, [0.2, 1.401, 0], 0.29, 0.34, [0, 0, 1]);
    expect(near.reached).toBe(false);
    expect(distance(root, near.mid)).toBeCloseTo(0.29, 6);
    expect(distance(near.mid, near.end)).toBeCloseTo(0.34, 6);
  });

  it("bends toward the pole hint", () => {
    const target: Vec3 = [0.2, 1.0, 0];
    const axis = normalize(sub(target, root));
    for (const pole of [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0.3, 0.2]] as Vec3[]) {
      const r = solveTwoBone(root, target, 0.29, 0.34, pole);
      const rel = sub(r.mid, root);
      const offLine = sub(rel, scale(axis, dot(rel, axis)));
      const polePerp = sub(pole, scale(axis, dot(pole, axis)));
      expect(length(offLine)).toBeGreaterThan(0.05);
      expect(dot(normalize(offLine), normalize(polePerp))).toBeGreaterThan(0.999);
    }
  });

  it("never returns NaN for degenerate input", () => {
    const r = solveTwoBone(root, root, 0.29, 0.34, [0, 0, 0]);
    for (const v of [...r.mid, ...r.end]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("motion library coverage", () => {
  it("has a motion for every exercise and nothing else", () => {
    expect(Object.keys(MOTIONS).sort()).toEqual([...IDS].sort());
    expect(IDS.length).toBe(32);
  });

  it("returns null for unknown ids", () => {
    expect(sampleFrame("nope", 0)).toBeNull();
    expect(sampleFrame("toString", 0)).toBeNull();
    expect(getMotionInfo("nope")).toBeNull();
    expect(tracePoint("nope", 0)).toBeNull();
    expect(hasMotion("nope")).toBe(false);
  });
});

describe.each(IDS)("motion: %s", (id) => {
  const spec = MOTIONS[id];

  it("1. returns finite joints for every sample", () => {
    expect(hasMotion(id)).toBe(true);
    for (const f of frames(id)) {
      for (const j of JOINT_NAMES) {
        expect(f.pose[j]).toBeDefined();
        for (const c of f.pose[j]) expect(Number.isFinite(c)).toBe(true);
      }
      for (const p of f.props) {
        for (const v of Object.values(p)) {
          if (Array.isArray(v)) for (const c of v) expect(Number.isFinite(c)).toBe(true);
        }
      }
    }
  });

  it("2. keeps every bone length within 2%", () => {
    const fs = frames(id);
    for (const [a, b] of BONES) {
      const ref = distance(fs[0].pose[a], fs[0].pose[b]);
      expect(ref).toBeGreaterThan(0.02);
      for (const f of fs) {
        expect(Math.abs(distance(f.pose[a], f.pose[b]) - ref) / ref, `${a}-${b}`).toBeLessThan(0.02);
      }
    }
    const f = fs[7];
    expect(distance(f.pose.hipL, f.pose.kneeL)).toBeCloseTo(RIG.thigh, 4);
    expect(distance(f.pose.kneeR, f.pose.ankleR)).toBeCloseTo(RIG.shin, 4);
    expect(distance(f.pose.shoulderL, f.pose.elbowL)).toBeCloseTo(RIG.upperArm, 4);
    expect(distance(f.pose.elbowR, f.pose.wristR)).toBeCloseTo(RIG.forearm, 4);
  });

  it("3. keeps every joint above the floor", () => {
    for (const f of frames(id)) {
      for (const j of JOINT_NAMES) expect(f.pose[j][1], j).toBeGreaterThanOrEqual(-0.01);
    }
  });

  it("4. keeps planted feet in place and on the floor", () => {
    const fs = frames(id);
    for (const side of ["L", "R"] as const) {
      const mode = spec.motion.planted[side];
      if (!mode) continue;
      const toe = `toe${side}` as const;
      const ankle = `ankle${side}` as const;
      for (const f of fs) {
        expect(distance(f.pose[toe], fs[0].pose[toe]), toe).toBeLessThan(0.01);
        expect(f.pose[toe][1]).toBeLessThan(0.035);
        if (mode === "flat") {
          expect(distance(f.pose[ankle], fs[0].pose[ankle]), ankle).toBeLessThan(0.01);
          expect(f.pose[ankle][1]).toBeLessThan(RIG.ankleHeight + 0.01);
        }
      }
    }
  });

  it("5. keeps gripping hands on the implement", () => {
    for (const f of frames(id)) {
      for (const side of ["L", "R"] as const) {
        const idx = spec.motion.grips[side];
        if (idx === undefined) continue;
        const prop = f.props[idx];
        expect(prop, `prop ${idx}`).toBeDefined();
        expect(gripDistance(prop, f.pose[`hand${side}`]), `hand${side}`).toBeLessThan(0.03);
      }
    }
  });

  it("6. keeps barbells level and centred", () => {
    for (const f of frames(id)) {
      for (const p of f.props) {
        if (p.kind !== "barbell") continue;
        expect(Math.abs(p.from[1] - p.to[1])).toBeLessThan(0.01);
        expect(Math.abs(p.from[2] - p.to[2])).toBeLessThan(0.01);
        expect(Math.abs((p.from[0] + p.to[0]) / 2)).toBeLessThan(0.02);
      }
    }
  });

  it("7. loops seamlessly and actually moves", () => {
    const f0 = sampleFrame(id, 0)!;
    const fh = sampleFrame(id, 0.5)!;
    expect(sampleFrame(id, 1)).toEqual(f0);
    expect(sampleFrame(id, 1.25)).toEqual(sampleFrame(id, 0.25));
    const maxMove = Math.max(...JOINT_NAMES.map((j) => distance(f0.pose[j], fh.pose[j])));
    expect(maxMove).toBeGreaterThanOrEqual(0.08);
    // no teleporting between adjacent samples
    const fs = frames(id);
    for (let i = 1; i < fs.length; i++) {
      for (const j of JOINT_NAMES) expect(distance(fs[i].pose[j], fs[i - 1].pose[j]), j).toBeLessThan(0.35);
    }
  });

  it("8. has sane motion info", () => {
    const info = getMotionInfo(id)!;
    expect(info).not.toBeNull();
    expect(info.exerciseId).toBe(id);
    expect(info.repSeconds).toBeGreaterThanOrEqual(2);
    expect(info.repSeconds).toBeLessThanOrEqual(6);
    expect(["front", "side", "threeQuarter"]).toContain(info.view);
    expect(info.caption.length).toBeGreaterThan(10);
    if (info.trace) {
      for (const t of [0, 0.3, 0.5]) {
        const p = tracePoint(id, t)!;
        expect(p).not.toBeNull();
        for (const c of p) expect(Number.isFinite(c)).toBe(true);
      }
    } else {
      expect(tracePoint(id, 0.2)).toBeNull();
    }
  });
});
