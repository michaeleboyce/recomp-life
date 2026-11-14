"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  BONES,
  getMotionInfo,
  sampleFrame,
  tracePoint,
  type Frame,
  type JointName,
  type Prop,
  type Vec3,
} from "@/lib/motion/sample";
import { SCENE_PALETTES, type ScenePalette } from "@/lib/anatomy/palette";
import { useAppliedTheme } from "@/hooks";

/**
 * WebGL part of the animated mannequin. Loaded lazily by Mannequin; do not
 * import directly from a page.
 *
 * The motion library returns joint positions for a point in the rep; this
 * draws a capsule between each pair of joints and the equipment around them.
 * Metres, +Y up, floor at y = 0, the figure faces +Z.
 */

export type MannequinView = "front" | "side" | "threeQuarter";

export interface MannequinHandle {
  /** Current position in the rep, 0-1. */
  getT: () => number;
  setView: (view: MannequinView) => void;
}

export interface MannequinSceneProps {
  exerciseId: string;
  playing: boolean;
  /** Playback rate; 1 is the motion's natural tempo. */
  speed: number;
  /** Position in the rep (0-1) shown while paused. */
  scrubT: number;
  showTrace: boolean;
  handleRef?: Ref<MannequinHandle>;
}

const UP = new THREE.Vector3(0, 1, 0);
const TARGET_Y = 1.05;

const LIMB_RADIUS: Partial<Record<JointName, number>> = {
  pelvis: 0.075,
  spine: 0.085,
  chest: 0.06,
  neck: 0.04,
};

const VIEW_AZIMUTH: Record<MannequinView, number> = {
  front: 0,
  // Not a full 90 degrees: a dead-side view hides the body behind the plate.
  side: 1.2,
  threeQuarter: Math.PI / 4,
};

function v(p: Vec3): THREE.Vector3 {
  return new THREE.Vector3(p[0], p[1], p[2]);
}

/** Place a unit-height cylinder so it spans from a to b. */
function span(mesh: THREE.Object3D, a: Vec3, b: Vec3, extend = 0) {
  const from = v(a);
  const dir = v(b).sub(from);
  const len = dir.length() || 1e-6;
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.clone().divideScalar(len));
  mesh.scale.set(1, len + extend, 1);
}

/** Place a disc/cylinder centred at c with its axis along `axis`. */
function alongAxis(mesh: THREE.Object3D, c: Vec3, axis: Vec3) {
  mesh.position.set(c[0], c[1], c[2]);
  const a = v(axis);
  if (a.lengthSq() < 1e-9) a.set(1, 0, 0);
  mesh.quaternion.setFromUnitVectors(UP, a.normalize());
}

interface PropRig {
  root: THREE.Object3D;
  update: (prop: Prop) => void;
}

function buildProp(prop: Prop, mats: Materials): PropRig {
  const root = new THREE.Group();
  switch (prop.kind) {
    case "barbell": {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 12), mats.steel);
      // plateRadius 0 means a plain bar (pulldown or pushdown bar): no plates.
      const hasPlates = prop.plateRadius > 0;
      const plateGeo = new THREE.CylinderGeometry(prop.plateRadius || 0.01, prop.plateRadius || 0.01, 0.05, 28);
      const p1 = new THREE.Mesh(plateGeo, mats.plate);
      const p2 = new THREE.Mesh(plateGeo, mats.plate);
      root.add(bar, p1, p2);
      return {
        root,
        update: (p) => {
          if (p.kind !== "barbell") return;
          span(bar, p.from, p.to);
          const axis: Vec3 = [p.to[0] - p.from[0], p.to[1] - p.from[1], p.to[2] - p.from[2]];
          const at = (k: number): Vec3 => [
            p.from[0] + axis[0] * k,
            p.from[1] + axis[1] * k,
            p.from[2] + axis[2] * k,
          ];
          alongAxis(p1, at(0.1), axis);
          alongAxis(p2, at(0.9), axis);
          p1.visible = hasPlates;
          p2.visible = hasPlates;
        },
      };
    }
    case "dumbbell": {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.26, 10), mats.steel);
      const headGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.07, 18);
      const h1 = new THREE.Mesh(headGeo, mats.plate);
      const h2 = new THREE.Mesh(headGeo, mats.plate);
      h1.position.y = 0.11;
      h2.position.y = -0.11;
      const g = new THREE.Group();
      g.add(handle, h1, h2);
      root.add(g);
      return {
        root,
        update: (p) => {
          if (p.kind === "dumbbell") alongAxis(g, p.center, p.axis);
        },
      };
    }
    case "bench": {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 1), mats.pad);
      root.add(pad);
      return {
        root,
        update: (p) => {
          if (p.kind !== "bench") return;
          pad.scale.set(1, 1, p.length);
          // `center` is the middle of the top surface; the pad is 0.07 thick.
          pad.position.set(p.center[0], p.center[1] - 0.035, p.center[2]);
          pad.rotation.set(0, 0, 0);
          pad.rotateY(THREE.MathUtils.degToRad(p.yawDeg));
          // Positive incline raises the head (-Z) end.
          pad.rotateX(THREE.MathUtils.degToRad(p.inclineDeg));
        },
      };
    }
    case "box": {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mats.pad);
      root.add(box);
      return {
        root,
        update: (p) => {
          if (p.kind !== "box") return;
          box.position.set(p.center[0], p.center[1], p.center[2]);
          box.scale.set(p.size[0], p.size[1], p.size[2]);
        },
      };
    }
    case "cable": {
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1, 6), mats.steel);
      root.add(line);
      return {
        root,
        update: (p) => {
          if (p.kind === "cable") span(line, p.from, p.to);
        },
      };
    }
    case "wheel": {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(prop.radius, prop.radius, 0.045, 24),
        mats.plate
      );
      root.add(wheel);
      return {
        root,
        update: (p) => {
          if (p.kind === "wheel") alongAxis(wheel, p.center, p.axis);
        },
      };
    }
  }
}

interface Materials {
  body: THREE.Material;
  joint: THREE.Material;
  steel: THREE.Material;
  plate: THREE.Material;
  pad: THREE.Material;
}

function Figure({
  exerciseId,
  playing,
  speed,
  scrubT,
  showTrace,
  tRef,
  palette,
}: Omit<MannequinSceneProps, "handleRef"> & {
  tRef: { current: number };
  palette: ScenePalette["mannequin"];
}) {
  const invalidate = useThree((s) => s.invalidate);

  const mats = useMemo<Materials>(
    () => ({
      body: new THREE.MeshStandardMaterial({ color: palette.body, roughness: 0.7 }),
      joint: new THREE.MeshStandardMaterial({ color: palette.joint, roughness: 0.7 }),
      steel: new THREE.MeshStandardMaterial({ color: palette.steel, roughness: 0.35, metalness: 0.6 }),
      plate: new THREE.MeshStandardMaterial({ color: palette.plate, roughness: 0.6, metalness: 0.2 }),
      pad: new THREE.MeshStandardMaterial({ color: palette.pad, roughness: 0.9 }),
    }),
    [palette]
  );

  // Free a theme's materials once they are replaced, and on unmount.
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const rig = useMemo(() => {
    const root = new THREE.Group();
    const first = sampleFrame(exerciseId, 0);
    if (!first) return null;

    const bones = BONES.map(([a]) => {
      const r = LIMB_RADIUS[a] ?? 0.034;
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, 1, 4, 10), mats.body);
      // CapsuleGeometry's length excludes the caps; scale only the middle by
      // nesting it so the caps keep their shape.
      root.add(mesh);
      return { mesh, radius: r };
    });

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), mats.body);
    root.add(head);

    const jointNames = Object.keys(first.pose) as JointName[];
    const joints = jointNames
      .filter((n) => n !== "head")
      .map((name) => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), mats.joint);
        root.add(mesh);
        return { name, mesh };
      });

    const props = first.props.map((p) => {
      const built = buildProp(p, mats);
      root.add(built.root);
      return built;
    });

    const apply = (frame: Frame) => {
      BONES.forEach(([a, b], i) => {
        const { mesh, radius } = bones[i];
        const from = v(frame.pose[a]);
        const dir = v(frame.pose[b]).sub(from);
        const len = dir.length() || 1e-6;
        mesh.position.copy(from).addScaledVector(dir, 0.5);
        mesh.quaternion.setFromUnitVectors(UP, dir.divideScalar(len));
        // Geometry has a middle section of length 1 plus two caps of `radius`.
        mesh.scale.set(1, Math.max(0.01, len / (1 + 2 * radius)), 1);
      });
      const h = frame.pose.head;
      head.position.set(h[0], h[1], h[2]);
      for (const { name, mesh } of joints) {
        const p = frame.pose[name];
        mesh.position.set(p[0], p[1], p[2]);
      }
      frame.props.forEach((p, i) => props[i]?.update(p));
    };

    apply(first);
    return { root, apply };
  }, [exerciseId, mats]);

  const trace = useMemo(() => {
    if (!getMotionInfo(exerciseId)?.trace) return null;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const p = tracePoint(exerciseId, (i / 40) * 0.5);
      if (p) points.push(v(p));
    }
    if (points.length < 2) return null;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: palette.trace });
    return new THREE.Line(geometry, material);
  }, [exerciseId, palette]);

  const repSeconds = getMotionInfo(exerciseId)?.repSeconds ?? 3;

  useFrame((_, delta) => {
    if (!rig || !playing) return;
    tRef.current = (tRef.current + (Math.min(delta, 0.1) * speed) / repSeconds) % 1;
    const frame = sampleFrame(exerciseId, tRef.current);
    if (frame) rig.apply(frame);
  });

  // While paused nothing animates, so draw the scrubbed position once.
  useEffect(() => {
    if (!rig || playing) return;
    tRef.current = scrubT;
    const frame = sampleFrame(exerciseId, scrubT);
    if (frame) rig.apply(frame);
    invalidate();
  }, [rig, playing, scrubT, exerciseId, invalidate, tRef]);

  useEffect(() => invalidate(), [showTrace, invalidate]);

  if (!rig) return null;
  return (
    <>
      <primitive object={rig.root} />
      {trace && showTrace && <primitive object={trace} />}
    </>
  );
}

function Controls({ view, handleRef, tRef }: {
  view: MannequinView;
  handleRef?: Ref<MannequinHandle>;
  tRef: { current: number };
}) {
  const ref = useRef<OrbitControlsImpl>(null);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    ref.current?.setAzimuthalAngle(VIEW_AZIMUTH[view]);
    ref.current?.update();
    invalidate();
  }, [view, invalidate]);

  useImperativeHandle(
    handleRef,
    () => ({
      getT: () => tRef.current,
      setView: (next) => {
        ref.current?.setAzimuthalAngle(VIEW_AZIMUTH[next]);
        ref.current?.update();
        invalidate();
      },
    }),
    [invalidate, tRef]
  );

  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enablePan={false}
      enableZoom={false}
      enableDamping={false}
      rotateSpeed={0.9}
      // Fixed slightly above eye level; only left/right rotation, so vertical
      // swipes still scroll the page.
      minPolarAngle={1.36}
      maxPolarAngle={1.36}
      target={[0, TARGET_Y, 0]}
    />
  );
}

export default function MannequinScene({ handleRef, ...props }: MannequinSceneProps) {
  const tRef = useRef(0);
  const view = getMotionInfo(props.exerciseId)?.view ?? "threeQuarter";
  // three.js needs concrete colours, so the scene picks its palette from the theme.
  // The canvas is transparent: the page is the background in both themes.
  const palette = SCENE_PALETTES[useAppliedTheme()].mannequin;

  return (
    <Canvas
      frameloop={props.playing ? "always" : "demand"}
      dpr={[1, 2]}
      camera={{ position: [0, 1.7, 5.4], fov: 28, near: 0.1, far: 50 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ touchAction: "pan-y" }}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} />
      <directionalLight position={[-4, 3, -3]} intensity={0.7} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
        <circleGeometry args={[1.6, 48]} />
        <meshStandardMaterial color={palette.floor} roughness={1} />
      </mesh>
      <Figure {...props} tRef={tRef} palette={palette} />
      <Controls view={view} handleRef={handleRef} tRef={tRef} />
    </Canvas>
  );
}
