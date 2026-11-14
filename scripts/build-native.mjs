// Builds the static files that are bundled into the iPhone app, into ./out.
//
// The app's API routes (src/app/api) only make sense on a server and cannot be
// part of a static export, so they have to be left out of this build. Renaming
// or moving them in place would leave the working tree broken if the build
// were interrupted, and other work is going on in those files. So the build
// runs on a copy: the sources are copied to .native-build/ without the API
// routes, built there, and the result is moved to ./out. Nothing tracked by git
// is modified. The copy sits inside the project so that it finds node_modules
// in the parent directory.
//
// Usage: node scripts/build-native.mjs
//   NEXT_PUBLIC_API_BASE  address of the web deployment the app syncs with.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, renameSync, rmSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = join(root, ".native-build");
const out = join(root, "out");

/** Everything the build reads, apart from node_modules. */
const INPUTS = [
  "src",
  "public",
  "next.config.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  "components.json",
  "package.json",
];

rmSync(work, { recursive: true, force: true });
mkdirSync(work);
for (const input of INPUTS) {
  if (existsSync(join(root, input))) {
    cpSync(join(root, input), join(work, input), { recursive: true });
  }
}
rmSync(join(work, "src", "app", "api"), { recursive: true, force: true });

if (!process.env.NEXT_PUBLIC_API_BASE) {
  console.warn(
    "NEXT_PUBLIC_API_BASE is not set: the app will build, but sync will have no server to talk to."
  );
}

const next = join(root, "node_modules", ".bin", "next");
const result = spawnSync(next, ["build"], {
  cwd: work,
  stdio: "inherit",
  env: { ...process.env, BUILD_TARGET: "native" },
});
if (result.status !== 0) {
  // Remove the copy: left behind, its test files would be picked up by the test runner.
  rmSync(work, { recursive: true, force: true });
  console.error("Native build failed; ./out was left as it was.");
  process.exit(result.status ?? 1);
}

rmSync(out, { recursive: true, force: true });
renameSync(join(work, "out"), out);
rmSync(work, { recursive: true, force: true });
console.log("Static app written to ./out");
