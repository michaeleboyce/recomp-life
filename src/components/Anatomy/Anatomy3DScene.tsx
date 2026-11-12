"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { MuscleId } from "@/types";
import type { MuscleHeat } from "@/lib/muscleLoad";
import { FIGURE_COLORS, HEAT_COLORS } from "@/lib/anatomy/palette";
import { isMuscleId } from "@/lib/muscles";

/**
 * The WebGL part of the 3D anatomy viewer. Loaded lazily by Anatomy3D; do not
 * import this file directly from a page.
 *
 * Model: public/models/anatomy.glb (see NOTICE.md there). It faces +Z, is
 * about 1.75 units tall with its feet at y = 0, and +X is the body's left.
 */

const MODEL_URL = "/models/anatomy.glb";
const DRACO_PATH = "/draco/";
const MODEL_CENTER_Y = 0.9;
const RESTING_3D = "#6b7080";
const OTHER_3D = "#565a66";

// Start downloading the model as soon as this code loads, not on first render.
useGLTF.preload(MODEL_URL, DRACO_PATH);

export interface Anatomy3DHandle {
  /** Turn the body to face the camera from the front (0) or back (PI). */
  setView: (view: "front" | "back" | "left" | "right") => void;
}

export interface Anatomy3DSceneProps {
  heat?: MuscleHeat;
  colors?: Partial<Record<MuscleId, string>>;
  selected?: MuscleId | null;
  onMusclePress?: (muscle: MuscleId) => void;
  /** "horizontal" turns left/right only and leaves vertical drags to the page. */
  orbit?: "horizontal" | "free";
  showSkeleton?: boolean;
  initialView?: "front" | "back";
  reducedMotion?: boolean;
  onReady?: () => void;
  handleRef?: Ref<Anatomy3DHandle>;
}

const VIEW_AZIMUTH = { front: 0, back: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 } as const;

interface Prepared {
  /** Tracked muscle meshes, each tagged with userData.m. */
  muscles: THREE.Mesh[];
  /** Untracked muscles and bones, merged to keep draw calls low. */
  otherMuscles: THREE.BufferGeometry | null;
  bones: THREE.BufferGeometry | null;
}

function mergeAll(meshes: THREE.Mesh[]): THREE.BufferGeometry | null {
  if (meshes.length === 0) return null;
  const parts = meshes.map((m) => {
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    // Keep only what the materials need so every part has the same attributes.
    for (const name of Object.keys(g.attributes)) {
      if (name !== "position" && name !== "normal") g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  });
  return mergeGeometries(parts, false);
}

function prepare(scene: THREE.Object3D): Prepared {
  scene.updateMatrixWorld(true);
  const muscles: THREE.Mesh[] = [];
  const other: THREE.Mesh[] = [];
  const bones: THREE.Mesh[] = [];

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const tag = mesh.userData as { t?: string; m?: string };
    if (tag.t === "b") bones.push(mesh);
    else if (tag.t === "m" && tag.m && isMuscleId(tag.m)) muscles.push(mesh);
    else if (tag.t === "m") other.push(mesh);
  });

  // Detach tracked muscles into world space so they can be drawn on their own.
  const detached = muscles.map((m) => {
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    const mesh = new THREE.Mesh(g);
    mesh.userData = { ...m.userData };
    mesh.name = m.name;
    return mesh;
  });

  return { muscles: detached, otherMuscles: mergeAll(other), bones: mergeAll(bones) };
}

function Body({
  heat,
  colors,
  selected,
  onMusclePress,
  showSkeleton,
  onReady,
}: Pick<
  Anatomy3DSceneProps,
  "heat" | "colors" | "selected" | "onMusclePress" | "showSkeleton" | "onReady"
>) {
  const gltf = useGLTF(MODEL_URL, DRACO_PATH);
  const invalidate = useThree((s) => s.invalidate);
  const prepared = useMemo(() => prepare(gltf.scene), [gltf.scene]);

  const materials = useMemo(() => {
    const make = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
    return {
      // Resting muscle is lighter here than in the 2D figure: shaded 3D
      // surfaces read much darker than flat fills.
      heat: HEAT_COLORS.map((c, i) =>
        i === 0
          ? make(RESTING_3D)
          : make(c, i >= 3 ? { emissive: c, emissiveIntensity: i === 4 ? 0.28 : 0.12 } : {})
      ),
      other: make(OTHER_3D),
      bone: make(FIGURE_COLORS.bone, { roughness: 0.9 }),
      custom: new Map<string, THREE.MeshStandardMaterial>(),
      selected: make(FIGURE_COLORS.selected, {
        emissive: FIGURE_COLORS.selected,
        emissiveIntensity: 0.45,
      }),
    };
  }, []);

  useEffect(() => {
    for (const mesh of prepared.muscles) {
      const muscle = mesh.userData.m as MuscleId;
      let material: THREE.Material;
      if (selected === muscle) {
        material = materials.selected;
      } else if (colors) {
        const hex = colors[muscle];
        if (hex) {
          let m = materials.custom.get(hex);
          if (!m) {
            m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.62, metalness: 0.05 });
            materials.custom.set(hex, m);
          }
          material = m;
        } else {
          material = materials.heat[0];
        }
      } else {
        material = materials.heat[heat?.[muscle] ?? 0];
      }
      mesh.material = material;
    }
    invalidate();
  }, [prepared, materials, heat, colors, selected, invalidate]);

  useEffect(() => {
    onReady?.();
    invalidate();
    // onReady is intentionally called once per loaded model.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared]);

  useEffect(() => invalidate(), [showSkeleton, invalidate]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!onMusclePress) return;
    // A drag that ends over a muscle is a rotation, not a tap.
    if (e.delta > 6) return;
    const muscle = e.object.userData.m as string | undefined;
    if (muscle && isMuscleId(muscle)) {
      e.stopPropagation();
      onMusclePress(muscle);
    }
  };

  return (
    <group position={[0, -MODEL_CENTER_Y, 0]}>
      <group onClick={handleClick}>
        {prepared.muscles.map((mesh) => (
          <primitive key={mesh.uuid} object={mesh} />
        ))}
      </group>
      {prepared.otherMuscles && (
        <mesh geometry={prepared.otherMuscles} material={materials.other} raycast={() => null} />
      )}
      {prepared.bones && (
        <mesh
          geometry={prepared.bones}
          material={materials.bone}
          visible={showSkeleton !== false}
          raycast={() => null}
        />
      )}
    </group>
  );
}

function Controls({
  orbit,
  initialView,
  reducedMotion,
  handleRef,
}: Pick<Anatomy3DSceneProps, "orbit" | "initialView" | "reducedMotion" | "handleRef">) {
  const ref = useRef<OrbitControlsImpl>(null);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    ref.current?.setAzimuthalAngle(VIEW_AZIMUTH[initialView ?? "front"]);
    ref.current?.update();
    invalidate();
  }, [initialView, invalidate]);

  useImperativeHandle(
    handleRef,
    () => ({
      setView: (view) => {
        const c = ref.current;
        if (!c) return;
        c.setAzimuthalAngle(VIEW_AZIMUTH[view]);
        c.setPolarAngle(Math.PI / 2);
        c.update();
        invalidate();
      },
    }),
    [invalidate]
  );

  const free = orbit === "free";
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enablePan={false}
      enableZoom={free}
      enableDamping={!reducedMotion}
      dampingFactor={0.12}
      rotateSpeed={0.9}
      minDistance={1.6}
      maxDistance={6}
      minPolarAngle={free ? Math.PI * 0.2 : Math.PI / 2}
      maxPolarAngle={free ? Math.PI * 0.8 : Math.PI / 2}
      target={[0, 0, 0]}
    />
  );
}

export default function Anatomy3DScene(props: Anatomy3DSceneProps) {
  const { orbit = "horizontal", initialView, reducedMotion, handleRef, ...body } = props;
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [0, 0, 4.6], fov: 24, near: 0.1, far: 50 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      // Horizontal-only viewers leave vertical swipes to page scrolling.
      style={{ touchAction: orbit === "free" ? "none" : "pan-y" }}
    >
      {/* Kept low so the heat ramp is not washed out. Lights follow the camera side. */}
      <ambientLight intensity={0.7} />
      <directionalLight position={[2.5, 3, 4]} intensity={0.9} />
      <directionalLight position={[-3, 2, -4]} intensity={0.9} />
      <Body {...body} />
      <Controls
        orbit={orbit}
        initialView={initialView}
        reducedMotion={reducedMotion}
        handleRef={handleRef}
      />
    </Canvas>
  );
}
