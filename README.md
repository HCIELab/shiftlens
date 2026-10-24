# ShiftLens

**A browser-based design tool for mechanically switchable optical surfaces.**

ShiftLens combines a lenticular lens array with an interleaved image layer. Small mechanical shifts between the layers reveal different images, allowing physical objects to change appearance without electronics.

This repository contains the standalone web implementation of the ShiftLens design workflow. It runs locally in a browser: **Rhino, Grasshopper, Python and a backend service are not required.** Geometry generation, mechanism motion, image encoding and exports all run on the user's device.

[Paper (PDF)](https://hcie.csail.mit.edu/research/shiftlens/2026-shiftlens-paper.pdf) · [Demo video](https://www.youtube.com/watch?v=KJK-DvgmRNs) · [Project page](https://hcie.csail.mit.edu/research/shiftlens/shiftlens.html)

> **ShiftLens: Mechanically Actuated Optical Surfaces for Switchable Appearances on 3D Objects**
>
> Yunyi Zhu, Dingning Cao, Jeremy Mrzyglocki, Stefanie Mueller, and Narjes Pourjafarian. UIST 2026.

## Quick start

Install [Node.js](https://nodejs.org/) 22.13 or later. Node 22 is specified in `.nvmrc`. Use the pinned pnpm version:

```sh
npm install --global pnpm@11.25.0

git clone https://github.com/HCIELab/shiftlens.git
cd shiftlens
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite, normally **http://127.0.0.1:5173/**. The tool starts with an empty design. Use **Examples… → Door sign** for an assembled example, or start your own curve with **New design**.

For a production build:

```sh
pnpm build
pnpm preview
```

`dist/` contains the static website and can be served at a site's root. No API keys, accounts, CAD installations or private source folders are needed. Keep the page on HTTP(S), including localhost, rather than opening `index.html` with `file://`; the geometry worker and WebAssembly module need a web server.

## Design workflow

The editor follows the paper's three-step workflow. The 3D viewport and animation timeline remain available while editing.

### 1. Define surfaces and lenses

Choose a surface family, then **Define…** the primary curve and motion:

| Surface family | Construction | Example |
| --- | --- | --- |
| Translation | Sweep a curve along a straight direction | Flat signs or curved extrusions |
| Revolution | Rotate a curve around an axis | Fan-shaped signs or vessels |
| Screw | Combine rotation and translation along an axis | Helical or twisted surfaces |

Draw a polyline or smooth curve, edit its XYZ coordinates, or import an XYZ/CSV/JSON point list. Define the axis origin and direction, sweep angle and/or translation distance. Adjust lens width, lens side, retaining rails and carrier thickness.

The door sign is one example of this curve-based model. It is not a separate design mode. Compatible shapes must come from one of the three rigid-motion surface families; arbitrary meshes and arbitrary motion paths are not supported.

### 2. Add actuation and images

Choose a mechanism and click **Place the Switch / Knob / Roller**. The original CAD hardware follows the pointer in a half-transparent preview: green passes the placement footprint/reach checks, red indicates a rejected location. Click to confirm, or press **Esc** to cancel. Full solid-intersection checks run after placement.

| Mechanism | Direct interaction | Image states |
| --- | --- | --- |
| Switch | Click the rocker to toggle | 2 |
| Knob | Drag around the handle to rotate | 2–5 |
| Roller | Drag the wheel along its rolling direction | 2–10 |
| User Custom | Control the lens with the timeline | 2–10 |

Switch, knob and roller use meshes from the original project CAD. The web implementation fits mounts, rack tracks and clearance openings to the selected surface; the source gear teeth and handles are not replaced with approximations. Knob and roller use continuous motion. Physical detents are not implemented.

Upload a PNG, JPEG or WebP image for each state. Use **Adjust image** for fit, zoom and crop controls, and **Preview State in Viewport** to inspect a specific state. **Use reference sign images** loads the supplied door-sign artwork.

### 3. Simulate and export

Use **Start** for continuous playback, the timeline for manual scrubbing, or the mechanism itself for direct interaction. Mechanism pose, lens displacement and encoded-image sampling share the same phase. **Geometry**, **Image preview**, and **Encoded image** offer assembly inspection, appearance preview, and the actual interleaved print texture.

**Export** produces:

| Output | Contents |
| --- | --- |
| `assembly.3mf` | Named components, colors and millimeter units |
| `parts/*.stl` | Individual component meshes at their state-1 assembly poses |
| `project.shiftlens.json` | Editable curves, parameters, mechanisms, images and crop settings |
| `encoded-pattern.png` | Interleaved image used by the preview |
| `state-*.*` | Uploaded source images |
| `verification.json` | Mesh statistics, sampled collisions and CAD/fitting provenance |
| `paper-insert.svg` | Full-size paper layout for the planar radial example, with cut outlines and a 10 mm scale check |

With all state images assigned, these files are downloaded together in a ZIP. Without all images, Export provides the 3MF assembly. Invalid mechanism placements or detected part intersections block export. The encoded PNG is also available from the Encoded image view.

## Saving your work

The current draft is stored in browser local storage. **Save** downloads a portable JSON project, including embedded images; **Open** restores it. Empty and partially completed designs can be saved. Use **Undo / Redo** or **Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z** for design edits.

Save a project file before clearing browser data or switching browsers. Image processing is local; the application contains no image-upload service, telemetry or remote geometry computation.

## What this release implements

This is a web reimplementation of the research workflow. The paper and demo video show the original Rhino/Grasshopper research tool; this repository implements the maintained browser version.

- Curves in 3D, all three compatible motion families, lenses, image carrier and retaining rails.
- Original-CAD switch, knob and roller, surface-aware placement, fitted geometry and synchronized motion.
- Multiple uploaded images, interleaving, idealized appearance preview and continuous animation.
- Project save/open and mesh, image and planar paper-template export.
- Automated geometry, mechanism, placement-preview, encoding and export checks.

The web tool **does not yet reproduce the paper's optical optimization and fabrication calibration**. Image preview uses idealized lens-aperture reconstruction, not a calibrated prediction of a fabricated sample. The optional experimental ray trace is available only for planar radial surfaces. More image states in the editor do not establish that a particular lens/printer combination can separate them physically.

Other current limits:

- Curves use point-based smooth or polyline interpolation. Native Rhino/NURBS/STEP and arbitrary mesh import are not implemented.
- Physical print unwrapping is implemented for the planar radial example; general curved-surface paper templates are not implemented.
- Collision checks sample motion positions and are not a proof of continuous clearance. A valid sampled assembly still needs fabrication and mechanical testing.
- Exports are meshes, not editable STEP solids. The 3MF does not contain printer-specific multi-material recipes.

See [simulation](SIMULATION.md), [rendering](RENDERING.md), and [native mechanism provenance](docs/native-mechanisms.md) for the models, measured CAD repairs and validation boundaries.

## Development

```sh
pnpm test
pnpm build
```

The current suite contains 42 tests covering the three mechanisms across surface families, switch-slot reach, rack-driven motion, matching preview/export poses, image encoding, project round trips, lens coverage and export topology. Sampled collision tests use actual solid intersections. See [CONTRIBUTING.md](CONTRIBUTING.md) for development and bug-report guidance.

| Location | Responsibility |
| --- | --- |
| `src/surface.mjs` | Curve interpolation, rigid motion, surface frames and UV projection |
| `src/model.mjs`, `src/project.mjs` | Parameters, image-state encoding and saved-project validation |
| `src/geometry.mjs`, `src/geometry.worker.mjs` | Solid generation, booleans and collision checks in a worker |
| `src/native-actuation.mjs`, `src/native-fitting.mjs` | CAD mechanism constraints, mounts, racks and clearance pockets |
| `src/viewer.mjs`, `src/glass.mjs`, `src/preview.mjs` | Viewport, interaction and appearance rendering |
| `src/images.mjs`, `src/export.mjs` | Local image processing and downloadable output |
| `src/main.mjs`, `src/curve-editor.mjs` | Three-step UI and curve editing |
| `src/assets/`, `docs/cad/` | Bundled CAD meshes, artwork and reproducible native-mechanism inputs |
| `tests/` | Regression tests |

The stack is JavaScript ES modules, [Three.js](https://threejs.org/), [Manifold](https://github.com/elalish/manifold) WebAssembly, [fflate](https://github.com/101arrowz/fflate), and [Vite](https://vite.dev/). Dependencies are locked in `pnpm-lock.yaml`.

### CAD assets and Rhino independence

All geometry needed at runtime is bundled. You can build, run, customize and export without Rhino or Grasshopper. Original CAD filenames in the provenance documents identify where the bundled meshes came from; they are not external runtime file references.

The optional `scripts/prepare-native-cad.py` normalization script uses Python's standard library and the included audited meshes. It also needs no Rhino installation. See [ASSETS.md](ASSETS.md) for source identities, hashes and asset-specific licensing notes.

## Citation

If you use ShiftLens in research, please cite the paper. Machine-readable citation metadata is in [CITATION.cff](CITATION.cff).

```bibtex
@inproceedings{zhu2026shiftlens,
  author = {Zhu, Yunyi and Cao, Dingning and Mrzyglocki, Jeremy and
            Mueller, Stefanie and Pourjafarian, Narjes},
  title = {{ShiftLens}: Mechanically Actuated Optical Surfaces for
           Switchable Appearances on {3D} Objects},
  booktitle = {Proceedings of the 39th Annual ACM Symposium on
               User Interface Software and Technology},
  series = {UIST '26},
  year = {2026},
  publisher = {Association for Computing Machinery},
  doi = {10.1145/3830398.3830555},
  url = {https://doi.org/10.1145/3830398.3830555}
}
```

## License

The software is available under the [MIT License](LICENSE). Third-party dependencies and external artwork retain their own rights; the software license does not relicense them. See [ASSETS.md](ASSETS.md) and [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) for provenance and attribution.
