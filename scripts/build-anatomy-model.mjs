// Builds public/models/anatomy.glb from the Z-Anatomy-derived body.glb
// published in hpfrei/body-anatomy-3d-viewer (CC BY-SA 4.0).
//
// The source is 8.2 MB, of which 5.4 MB is encyclopedia text stored on every
// node. This script:
//   - verifies the download against a pinned checksum
//   - drops bursae and other untyped meshes
//   - replaces each node's metadata with a compact tag:
//       bones:   { t: "b" }
//       muscles: { t: "m", n: <display name>, m: <MuscleId or omitted>, s: "L" | "R" | "C" }
//   - re-encodes with Draco
//   - writes src/lib/anatomy/meshManifest.json for tests
//
// The output is a modified copy of a CC BY-SA 4.0 work and stays under that
// licence; see public/models/NOTICE.md.
//
// Run (Node 24+, which can import the .ts mapping file directly):
//   node scripts/build-anatomy-model.mjs

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { KHRDracoMeshCompression } from "@gltf-transform/extensions";
import { draco, prune } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { classifyMuscleMesh } from "../src/lib/anatomy/meshMapping.ts";

const SOURCE_COMMIT = "0fc76a927aaf54c6fcc217cabdc3eb4d561130b7";
const SOURCE_URL = `https://raw.githubusercontent.com/hpfrei/body-anatomy-3d-viewer/${SOURCE_COMMIT}/public/body.glb`;
const SOURCE_SHA256 = "0886b6a068e655b284903664e2178d7964f80b1c0ce798461909ac806bcef2e3";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cacheFile = join(root, ".playwright-mcp/model-src/body.glb");
const outFile = join(root, "public/models/anatomy.glb");
const manifestFile = join(root, "src/lib/anatomy/meshManifest.json");

async function loadSource() {
  let bytes;
  if (existsSync(cacheFile)) {
    bytes = readFileSync(cacheFile);
  } else {
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, bytes);
  }
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== SOURCE_SHA256) throw new Error(`checksum mismatch: ${sha}`);
  return bytes;
}

const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression])
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule(),
  });

const doc = await io.readBinary(await loadSource());

/** @type {{ name: string, muscle: string | null, side: "L" | "R" | "C" }[]} */
const manifest = [];
let bones = 0;
let dropped = 0;

for (const node of doc.getRoot().listNodes()) {
  const extras = node.getExtras();
  const mesh = node.getMesh();
  const type = extras.type;

  if (!mesh) {
    node.setExtras({});
    continue;
  }
  if (type !== "muscle" && type !== "bone") {
    node.setMesh(null);
    node.setExtras({});
    dropped++;
    continue;
  }
  if (type === "bone") {
    node.setExtras({ t: "b" });
    bones++;
    continue;
  }

  // Side from the mesh bounds. The model faces +Z, so +X is the body's left.
  let minX = Infinity;
  let maxX = -Infinity;
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION");
    if (!pos) continue;
    minX = Math.min(minX, pos.getMin([])[0]);
    maxX = Math.max(maxX, pos.getMax([])[0]);
  }
  const cx = (minX + maxX) / 2;
  const side = Math.abs(cx) < 0.004 ? "C" : cx > 0 ? "L" : "R";

  const name = String(extras.name ?? node.getName());
  const detail = String(extras.nameDetail ?? name);
  const muscle = classifyMuscleMesh(name, detail);

  const display = detail.replace(/^\((.*)\)$/, "$1").replace(/ Muscle$/, "");
  node.setExtras(muscle ? { t: "m", n: display, m: muscle, s: side } : { t: "m", n: display, s: side });
  manifest.push({ name: display, muscle, side });
}

for (const mesh of doc.getRoot().listMeshes()) mesh.setExtras({});
for (const material of doc.getRoot().listMaterials()) material.setExtras({});
for (const scene of doc.getRoot().listScenes()) scene.setExtras({});

await doc.transform(prune({ keepLeaves: false }), draco({ method: "edgebreaker" }));

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, await io.writeBinary(doc));

manifest.sort((a, b) => (a.name + a.side).localeCompare(b.name + b.side));
writeFileSync(manifestFile, JSON.stringify(manifest, null, 1) + "\n");

const tagged = manifest.filter((m) => m.muscle).length;
console.log(
  `anatomy.glb: ${(statSync(outFile).size / 1024 / 1024).toFixed(2)} MB | ` +
    `${manifest.length} muscle meshes (${tagged} tagged), ${bones} bone meshes, ${dropped} dropped`
);
