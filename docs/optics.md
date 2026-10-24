# Optical evaluation and optimization

The browser ports the supplied `10_Evaluation` numerical model. It runs in JavaScript; no Rhino, Grasshopper, Python, Mitsuba or server is needed at runtime. It does not replace the three-step design workflow or the idealized image animation.

## Use in the editor

1. Define a surface, or load an example. In Step 1 open **Optical evaluation and optimization**.
2. Choose the primary-curve position and minimum target visibility φ (default 0.7). The panel evaluates the current local lens section, plots φ at 0–89°, and reports the contiguous viewing half-angle. Refractive index comes from Additional lens settings; state count comes from Step 2.
3. **Optimize this section** searches the original 50 × 50 grid. It reports the unconstrained source optimum separately from a candidate fitting the web assembly's air gap, 0.18 mm mask and minimum 0.4 mm substrate. The first optimum can have h = 0; that cannot be applied to this separated-layer assembly.
4. **Apply fitted lens profile** generates the circular profile with that radius and height. The reference section uses the fitted r, p and h; other sections retain r/p as pitch varies. Substrate height stays constant. Rails, openings, native mechanism mounts and sampled collisions regenerate. Invalid assemblies cannot be exported. The source grid may offer a worse nominal half-angle than an existing semicircular profile: applying it is optional, and the panel says when this occurs.
5. Download an optical report with parameters, full curves, source identities, assumptions and any search/benchmark results. The complete image/geometry export also includes an evaluation of its current center section in `verification.json`.

Original door-sign CAD stays intact until a profile is applied or its source dimensions are edited. Applying a profile preserves its 20-cell layout while switching to generated lens/rail solids. Undo restores the original design. Profile parameters are saved in project JSON.

## Mathematical definitions and source fidelity

A local circular lens has pitch p, radius r > p/2 and height h from the image plane to the arc's endpoints. The center is at y = h − sqrt(r² − (p/2)²); its sag is r − sqrt(r² − (p/2)²). Thus h is not just the lens substrate thickness. The web mapping is h = substrate − paperZ.

The authoritative tracer is `2_optimization/optimize_lens.py::phi_curve`, also copied into `4_curved-surface/compute_opv.py`. The older tracer in `ray_trace.py` has different sampling and weighting. The port preserves:

- 64 uniform-X samples, including both endpoints, per viewing angle.
- Projected-aperture weight max(0, cos(α) Ny − sin(α) Nx).
- One Snell refraction, air to lens, followed by straight propagation to y = 0 in a homogeneous medium.
- φ = weighted central-strip hits / weighted hits within the lens footprint. The central strip width is p/N. Escaped rays are excluded from the denominator. **φ is a conditional hit fraction, not absolute brightness or transmission.**
- θ is the last angle in the contiguous interval from 0° satisfying φ ≥ φ_min. A failed normal view is explicitly reported as “Below minimum,” even though the original θ function returns 0 in that case.
- Linear grids r ∈ [p/2 + 0.01 mm, 15p] and h ∈ [0, 2p], 50 samples each. Some old docstrings say “log-spaced”; executable code uses linear spacing.
- Search angles 0–89° in 1° steps. Ties retain the first strict maximum, traversing r first, h second. The worker may stop a candidate at its first failed angle, which preserves the contiguous-interval objective. Full curves are then recomputed for chosen candidates.

Current generated sections use the actual chord pitch at the selected curve position. Existing exact semicircles are evaluated at r = p/2 + 10⁻¹⁰ mm to satisfy the source's strict radius inequality; their zero-angle endpoint normals are singular in the exact limit. Original CAD is explicitly labeled a **nominal circular-section estimate**, not an exact optical tracing of the triangulated CAD.

## Curved-surface visibility

The original cylinder benchmark is independent of the current project: radius 25 mm, pitch 5 mm, 15 lenses, IOR 1.52. It optimizes the selected state count and threshold, evaluates offsets |i|p/R for i = −7…7, and computes φ_o = Σ φ_i cos(θ_i) / Σ cos(θ_i). At N = 2, threshold 0.7, it gives r = 2.51 mm, h = 0, θ = 47°, φ(0) ≈ 0.8075346385 and φ_o ≈ 0.7162687054.

The editor additionally reports an approximate array-row visibility at the selected position along the generator curve. Each front-facing cell uses its local pitch and projected incidence relative to the center section normal. This extends the same local-2D assumption to the three surface families; it does **not** solve self-occlusion, out-of-plane obliquity or full 3D caustics, and it is not a measurement of the finished object.

## Verification and limits

`tests/fixtures/optics-python.json` was independently generated from the original NumPy definitions. Tests compare six profiles, positive/signed viewing angles, 64/256-ray settings, four full-grid optima, and cylinder visibility to within 2 × 10⁻¹². Additional tests apply fitted profiles to the door sign and all three motion families with the original switch, knob and roller, inspect actual solid intersections, and check save/reopen.

`docs/evaluation/reference_definitions.py` retains only the computational definitions extracted from the supplied scripts. Source SHA256 identities are in the fixtures and exported reports. To regenerate fixtures with Python and NumPy (optional development dependency):

```sh
python scripts/generate-optics-reference.py
pnpm test
```

The old `3_verification/lens_table.csv` reports φ(0) = 1 for every state count. Recalculation with the corrected tracer disagrees for several entries (N = 2 and N = 3 both give ≈ 0.80753). The browser recomputes metrics rather than copying those stale columns. The original OBJ verification generator also draws a full radius-r semicircle rather than limiting its endpoints to ±p/2; the browser uses the analytical arc definition instead.

The supplied `3_verification` renderer uses Mitsuba path tracing. It is computational verification, **not a physical measurement dataset**. Its image outputs are not evidence that newly generated web parts have been fabricated or calibrated.

The source evaluation omits the glass-to-air exit interface, opaque aperture mask, Fresnel loss, scattering, finite pupils, printer response and manufacturing tolerance. The web assembly contains a separated image plane and mask; fitting h does not remove this model mismatch. This panel reproduces the supplied optical optimization model, while image animation remains the labeled idealized preview. The optional two-interface viewport shader is a separate experimental model. Physical validation of web-generated outputs is still pending.
