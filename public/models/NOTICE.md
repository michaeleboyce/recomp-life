# anatomy.glb

`anatomy.glb` is a modified copy of `body.glb` from
[hpfrei/body-anatomy-3d-viewer](https://github.com/hpfrei/body-anatomy-3d-viewer)
(commit `0fc76a927aaf54c6fcc217cabdc3eb4d561130b7`), which is itself derived
from the [Z-Anatomy](https://www.z-anatomy.com/) dataset.

**Licence:** Creative Commons Attribution-ShareAlike 4.0 International
(CC BY-SA 4.0), <https://creativecommons.org/licenses/by-sa/4.0/>. This
modified file is distributed under the same licence.

**Changes made** (by `scripts/build-anatomy-model.ts`):

- removed the descriptive text and links stored on each node
- removed bursae and other meshes that are neither muscle nor bone
- added a short tag to each muscle mesh (display name, app muscle group, side)
- re-encoded the geometry with Draco compression

The geometry of the muscles and bones is otherwise unchanged.

The rest of this application is a separate work and is not covered by this
licence.
