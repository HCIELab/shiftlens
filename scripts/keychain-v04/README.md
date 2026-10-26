# v04 CAD derivation

These are the scripts used to derive and independently check the v04 geometry from the existing v03 assembly. Rhino 8 is required for CAD operations only, never for the website. Set `SHIFTLENS_KEYCHAIN_ROOT` to the local hardware/keychain directory containing `output/ShiftLens_keychain_v03_fit_and_masks.3dm`, `assign_materials.py`, and `parameters.json`. The original CAD and its source appearance material are not distributed here.

Run `build_v04.py` in an empty Rhino document with `__rhino_doc__` set to that document; then `validate_v04.py` and `export_print.py`. `check_optics.py` runs in ordinary Python without Rhino. The builder removes 0.9 mm only from the flat substrate and translates the unscaled semicircular surfaces. It rebuilds the frame for the thinner stack and copies the carrier and letters unchanged apart from vertical translation. It never overwrites v03.

The print export is a multi-material 3DM, a 3MF with two component assemblies and per-region base materials, and individual watertight STL regions. STL/3MF mesh seam healing is limited to 0.001 mm. The paper placeholder is excluded. Assign the clear optical resin and opaque colors in print preparation; 3MF display colors are not printer resin profiles.

The committed numeric results are in `docs/keychain-v04-validation.json`. `scripts/prepare-keychain.py` extracts the saved v04 render meshes for the browser.
