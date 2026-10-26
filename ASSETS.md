# Asset provenance and licensing

The MIT license in this repository applies to the software code. Dependencies and externally sourced artwork retain their own licenses. The records below distinguish source identity from redistribution permission; a content hash does not establish ownership.

## Demo artwork

The user supplied these exact 1280 × 1280 JPEG files on October 23, 2026, requesting their use in the ShiftLens example. The repository copies are byte-for-byte originals, with descriptive filenames.

| State | Asset | SHA-256 |
| --- | --- | --- |
| 1 — PLEASE COME IN | `src/assets/please-come-in.jpg` | `293b5a9afc5a65a6d3b632f5c5faf389edabc38bd525c62275c4c0fb1012d2db` |
| 2 — MEETING IN PROGRESS | `src/assets/meeting-in-progress.jpg` | `2eb81b15f374f0334a106643796bff1705f0a16c396fda93c5802ef4afca90da` |

The browser creates derived cropped and encoded textures. It retains the original files in portable projects and names exported source files according to their MIME type. These assets have no separate redistribution license recorded here.

## Surface-type illustrations

`translation-type.png`, `revolve-type.png` and `combined-type.png` are copied unchanged from `17_Yunyi_video-tuned/framework_assets/`. They are the illustrations used by the original Grasshopper interface.

## Original door geometry

`original-door.mjs` contains millimeter tessellations from
`17_Yunyi_video-tuned/ShiftLens.3dm` (SHA-256
`d7307b142b3677058ffa4ddf061b4950d82791d078531e69045fbdd11a743115`).
Object 10 supplies the intact final lens cell; objects 7 and 5 supply the inner
and outer rails. Source GUIDs, rotation, height offset and measured carrier
radii are embedded in the asset. `original-door-meta.mjs` exposes the small
parameter record without loading mesh data into the UI bundle.

The exported mesh snapshots and their parameter metadata are bundled. They are sufficient to build and run the web tool without the original CAD or Rhino. `original-door.mjs` records the source object IDs and applied transforms. The source CAD is identified here for provenance, not used as a runtime file dependency. The carrier, mounts and clearance openings are generated separately in the browser. No separate redistribution license for the source CAD was recorded with the supplied files.

## Native actuation hardware

`src/assets/native-mechanisms.mjs` contains the original moving parts and native rack tooth profiles from `6_together/widgets.3dm` (SHA-256 `71e18ac07ff352292ea694d3f4534074accf5052dc1d5ef1ce8aad87b968caf6`). Object IDs and source indices are retained. See [native mechanism provenance](docs/native-mechanisms.md) for exact rack placement repairs, fitting adjustments and the reproducible normalization script. No substitute switch, knob or roller handle is generated. Generated carrier mounts and clearance openings are separate fitting geometry.

Confirm asset redistribution terms before a public release. The code is licensed MIT; this does not assign a new license to externally supplied artwork or to the paper.

## Optical evaluation source

The browser evaluation is ported from the user-supplied `10_Evaluation/2_optimization/optimize_lens.py` and `10_Evaluation/4_curved-surface/compute_opv.py`. Exact extracted NumPy computational definitions are retained in `docs/evaluation/reference_definitions.py` for independent parity checks. Original full-file SHA256 identities are recorded in `tests/fixtures/optics-python.json` and exported reports. The private source folder, plotting scripts, correspondence, rendering caches and rendered images are not runtime dependencies. See [optics](docs/optics.md) for equations, model limits, stale-cache corrections and fixture regeneration.

## Fixed keychain demo

`src/assets/keychain-v03.json` contains 30 saved render-mesh regions from the user-supplied `ShiftLens_keychain_v03_fit_and_masks.3dm`, SHA-256 `62a853c5190bd726c9f4239996836cb381c39ae7063f92fc106e416e3ef523fd`. Original object IDs and moving-part normalization offsets are retained. The sticker placeholder is excluded. `scripts/prepare-keychain.py` reproduces the extraction using rhino3dm 8.35.0, without a Rhino runtime. See [demo geometry and print dimensions](docs/demo.md). This records provenance; it does not assign a new license to the source CAD.
