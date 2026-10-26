# ShiftLens

**A browser-based design tool for mechanically switchable optical surfaces.**

ShiftLens combines a lenticular lens array with an interleaved image layer. Small mechanical shifts between the layers reveal different images, allowing physical objects to change appearance without electronics.

This repository contains the standalone web implementation of the ShiftLens design workflow. It runs locally in a browser: **Rhino, Grasshopper, Python and a backend service are not required.** Geometry generation, mechanism motion, image encoding and exports all run on the user's device. The optional demo phone-transfer flow uses a WebRTC signaling service; local uploads do not.

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

## UIST keychain demo

Use the **Demo** button in the main toolbar, or open the [keychain demo](https://hcielab.github.io/shiftlens/demo/). This separate page uses the fixed v03 CAD keychain: two photos, no actuator or shape controls, a 1.5 mm sliding preview, and a **26.5 × 21.2 mm** print insert. Visitors can scan the laptop’s QR code to choose photos on their phone, or upload directly on the laptop. **Next visitor** clears the session.

The PDF preserves the exact sticker size; print at **Actual size / 100%**, not fit-to-page. A PNG with physical-size metadata is also available. See the [demo setup guide](docs/demo.md) for assembly orientation, printer handling, phone-transfer network requirements, source CAD provenance, and verification.

## Design workflow

The editor follows the paper's three-step workflow. The 3D viewport and animation timeline remain available while editing.

### 1. Define surfaces and lenses

Choose a surface family, then **Define…** the primary curve and motion:

| Surface family | Construction | Example |
| --- | --- | --- |
| Translation | Sweep a curve along a straight direction | Flat signs or curved extrusions |
| Revolution | Rotate a curve around an axis | Fan-shaped signs or vessels |
| Screw | Combine rotation and translation along an axis | Helical or twisted surfaces |

Draw a polyline or smooth curve, edit its XYZ coordinates, or import an XYZ/CSV/JSON point list. Define the axis origin and direction, sweep angle and/or translation distance. Adjust lens width, lens side, retaining rails and carrier thickness. New designs default to a 5 mm carrier and 3 mm rails, matching the paper's fabrication baseline; this does not transfer its durability measurements to new web-generated parts.

Open **Optical evaluation and optimization** in this step to evaluate the selected lens section, inspect its visibility curve, search the 50 × 50 radius/height grid, choose a versioned angular resolution, and apply a fitted circular profile. The fit preserves the image gap and minimum substrate thickness, then regenerates geometry, rails, native mechanism mounts and collision checks. The independent paper-cylinder benchmark and downloadable optical report are in the same panel. See [optical evaluation](docs/optics.md) for the exact model and source identities.

The door sign is one example of this curve-based model. It is not a separate design mode. Compatible shapes must come from one of the three rigid-motion surface families; arbitrary meshes and arbitrary motion paths are not supported.

### 2. Add actuation and images

Choose a mechanism and click **Place the Switch / Knob / Roller**. The original CAD hardware follows the pointer in a half-transparent preview: green passes the placement footprint/reach checks, red indicates a rejected location. Click to confirm, or press **Esc** to cancel. Full solid-intersection checks run after placement.

| Mechanism | Direct interaction | Image states |
| --- | --- | --- |
| Switch | Click the rocker to toggle | 2 |
| Knob | Drag around the handle to rotate | 2–5 |
| Roller | Drag the wheel along its rolling direction | 2–10 |
| User Custom | Control the lens with the timeline | 2–10 |

Switch, knob and roller use meshes from the original project CAD. The web implementation fits mounts, rack tracks and clearance openings to the selected surface; the source gear teeth and handles are not replaced with approximations. Smooth knob and roller motion are continuous. The knob also offers **Indexed wall (experimental)**: a generated compliant wall cut from the original pinion poses at the image states, plus nearest-state selection on drag release. This is new web geometry. The wall is shown undeformed; elastic response, holding force and extra equilibrium positions are not solved. See [mechanism provenance](docs/native-mechanisms.md).

A pale reference line on the knob cap makes its rotation easier to see. It follows the existing CAD motion and serves as a viewport orientation cue.

Upload a PNG, JPEG or WebP image for each state. Use **Adjust image** for fit, zoom and crop controls, and **Preview State in Viewport** to inspect a specific state. **Use reference sign images** loads the supplied door-sign artwork.

### 3. Simulate and export

**Optimize lenses before simulation and export** is enabled by default. Start and Export first fit the center lens section, rebuild the complete assembly, and check rigid intersections. Changing optical settings, state count or the curve invalidates the previous fit. Disable it to retain a manual profile or the original CAD. The Step 1 panel selects the minimum visibility and search version.

Use **Start** for continuous playback, the timeline for manual scrubbing, or the mechanism itself for direct interaction. Mechanism pose, lens displacement and encoded-image sampling share the same phase. **Geometry**, **Image preview**, and **Encoded image** offer assembly inspection, appearance preview, and the actual interleaved print texture.

**Export** produces:

| Output | Contents |
| --- | --- |
| `assembly.3mf` | Closed components, material roles, millimeter units and embedded interleaved texture |
| `assembly.wrl`, `carrier-texture.png` | Closed VRML97 components with carrier texture; coordinates in meters |
| `parts/*.stl` | Individual component meshes at their state-1 assembly poses |
| `project.shiftlens.json` | Editable curves, parameters, mechanisms, images and crop settings |
| `encoded-pattern.png` | Interleaved image used by the preview |
| `state-*.*` | Uploaded source images |
| `verification.json` | Current optical evaluation and automatic fit with exact version, mesh statistics, rigid collisions, intended detent contact and CAD/fitting provenance |
| `paper-insert.svg` | Full-size paper layout for the planar radial example, with cut outlines and a 10 mm scale check |

With all state images assigned, these files are downloaded together in a ZIP. Without all images, Export provides a geometry-only 3MF assembly. Textured 3MF requires a Materials Extension-capable importer; VRML must stay beside its PNG. See [manufacturing export](docs/manufacturing-export.md). Invalid mechanism placements or detected part intersections block export. The encoded PNG is also available from the Encoded image view.

## Saving your work

The current draft is stored in browser local storage. **Save** downloads a portable JSON project, including embedded images; **Open** restores it. Empty and partially completed designs can be saved. Use **Undo / Redo** or **Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z** for design edits.

Save a project file before clearing browser data or switching browsers. Image processing is local; the application contains no image-upload service, telemetry or remote geometry computation.

## What this release implements

This is a web reimplementation of the research workflow. The paper and demo video show the original Rhino/Grasshopper research tool; this repository implements the maintained browser version.

- Curves in 3D, all three compatible motion families, lenses, image carrier and retaining rails.
- Original-CAD switch, knob and roller, surface-aware placement, fitted geometry and synchronized motion.
- Multiple uploaded images, interleaving, idealized appearance preview and continuous animation.
- Corrected evaluation ray tracer, automatic radius/height optimization, local section visibility and the paper cylinder benchmark. Versioned 0.5° and 1° searches with independent nine-state reference tables.
- Project save/open and mesh, image and planar paper-template export.
- Automated geometry, mechanism, placement-preview, encoding and export checks.

The web tool ports the supplied evaluation's **corrected weighted ray tracer and optical optimization**. The default uses a **0.5° search** and the effective viewing-angle definition from §5.2. The supplied scripts' 1° version remains selectable. Fig. 8b/8c appear to mix design versions, and the published θ labels do not match that definition under either recovered numeric version. Original labels are retained as historical evidence; they are not used as test targets. See [paper data versions and the recomputed table](docs/paper-data-versions.md). Numerical parity tests compare its results against the original NumPy code. This source model assumes one air-to-lens interface and a homogeneous medium to the image plane; it excludes the mask, exit refraction and material/print effects. **Web-generated outputs have not yet been physically validated.** Image preview continues to use idealized lens-aperture reconstruction, not a calibrated prediction of a fabricated sample. The optional experimental ray trace is available only for planar radial surfaces. More image states in the editor do not establish that a particular lens/printer combination can separate them physically.

Other current limits:

- Curves use point-based smooth or polyline interpolation. Native Rhino/NURBS/STEP and arbitrary mesh import are not implemented.
- One actuation mechanism per design; multi-actuator examples from the paper are not yet supported.
- Physical print unwrapping is implemented for the planar radial example; general curved-surface paper templates are not implemented.
- Collision checks sample motion positions and are not a proof of continuous clearance. Intended pinion/flexure contacts are recorded separately from rigid collisions. A valid sampled assembly still needs fabrication and mechanical testing.
- Exports are meshes, not editable STEP solids. Texture and material-role exports do not contain printer-specific J55 recipes.

See [simulation](SIMULATION.md), [rendering](RENDERING.md), and [native mechanism provenance](docs/native-mechanisms.md) for the models, measured CAD repairs and validation boundaries.

## Development

```sh
pnpm test
pnpm build
```

The current suite contains 66 tests covering numerical parity with the original optical evaluation, optimized-profile geometry and the three mechanisms across surface families, switch-slot reach, rack-driven motion, matching preview/export poses, image encoding, project round trips, lens coverage, generated detent seats, texture coordinates and export topology. CI runs the tests and production build on Node 22 and 24. Sampled collision tests use actual solid intersections. See [CONTRIBUTING.md](CONTRIBUTING.md) for development and bug-report guidance.

| Location | Responsibility |
| --- | --- |
| `src/optics.mjs`, `src/optics.worker.mjs` | Original evaluation ray tracer, grid search and cylinder benchmark |
| `src/automatic-optics.mjs` | Saved optimization settings, invalidation signature and assembly-constrained automatic fitting |
| `src/optical-section.mjs`, `src/optics-panel.mjs` | Local section evaluation, numerical reporting and application to geometry |
| `src/surface.mjs` | Curve interpolation, rigid motion, surface frames and UV projection |
| `src/model.mjs`, `src/project.mjs` | Parameters, image-state encoding and saved-project validation |
| `src/geometry.mjs`, `src/geometry.worker.mjs` | Solid generation, booleans and collision checks in a worker |
| `src/native-actuation.mjs`, `src/native-fitting.mjs`, `src/native-detents.mjs` | CAD mechanism constraints, mounts, racks and clearance pockets |
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
