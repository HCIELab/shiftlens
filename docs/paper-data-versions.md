# ShiftLens Fig. 8 provenance audit

Version decision: the web tool defaults to the 0.5° recomputation and the effective viewing-angle definition in §5.2. Original inputs remain unchanged. This report is not a recovered author specification.

## Verified published labels

`2026-shiftlens-paper.pdf`, page 7, Figure 8c is embedded raster image Im9.png, extracted for inspection. SHA256 of PDF: `fdb26a571d48c0462daaa9ef197fa59209ef699cd8ecfeb41a8ec75a037a562b`.

All r labels are 0.5p. N=2..10 h/p labels are `[0, .3, .65, .78, .73, .73, .78, .82, .82]`; theta labels in degrees are `[85, 51, 26, 28, 25, 24, 25, 26, 26]`.

Section 5.2 defines effective theta as the largest contiguous half-angle meeting phi >= phi_min, with phi_min=.7 for samples. These published theta labels do not agree with that definition when recomputed from supplied corrected code.

## Recovered code and artifacts

Current `2_optimization/plot_best_at_phi70.py` searches 50x50 r/h, 64 rays, 1-degree angular samples, then plots the selected design using 256 rays and .5-degree angular samples. Its current SVG artifact has explicit theta legend comments `[47,13,8,6,5,4,3,3,2]`, and metadata date 2026-03-27T00:20:38.682882.

Current corrected source uses uniform-X sampling, projected-aperture weights and a fixed center strip. Older `ray_trace.py` has uniform-arc sampling and unweighted hit counting; it is a different numeric model.

Old experimentation SVGs represent another version: `experimentation/phi_curves_N4.svg` labels h=3.00 mm for phi_min=.7 (metadata 2026-03-26T11:21:08.844200), and matching heatmap labels theta=9 degrees. It does not recover published h=.65p (=3.25 mm). No alternative matching original search script was found in the master project; ZIP computational files match extracted folder bytes.

## Supported inference about angular resolution

Changing only search angular resolution from 1 degree to .5 degree while preserving supplied corrected 64-ray tracer, 50x50 linear r/h grid and strict-first tie rule produces:

| N | r mm | h/p | effective theta degrees |
|---|---:|---:|---:|
|2|2.51|0|47|
|3|2.51|.326530612244898|13.5|
|4|2.51|.653061224489796|8.5|
|5|2.51|.7755102040816327|6.5|
|6|2.51|.7346938775510204|5|
|7|2.51|.7346938775510204|4|
|8|2.51|.7755102040816327|3.5|
|9|2.51|.8163265306122449|3|
|10|2.51|.8163265306122449|2.5|

These normalized heights reproduce all Figure 8c labels at their published precision, including the coarse one-decimal N3=.3. This is a plausible numerical version explanation, not proof that the missing original figure-generating source used .5-degree search.

Figure 8b additionally appears to show N4 phi(0) around .78, matching current 1-degree selected geometry h/p=.408163 (64-ray phi(0)=.7816126849150956). Figure 8c h/p=.653061 gives phi(0)=.9964116898058134. Thus b/c are inconsistent under the supplied model and appear to mix different design selections.

Figure 8c theta labels lie near where curve tails disappear, but do not match one consistent recovered nonzero-tail definition either. For .5-degree-selected N4, last nonzero sample is 25.5 degrees with 64 rays but 27.5 with 256 rays; N5 gives 29.5 / 29 versus published28. They must remain verbatim published labels of unresolved meaning, not be relabeled effective theta=.7 or inferred as exact code output.

## Recommended handling

Maintain explicit separate versions: (1) verbatim published Figure8 labels, marked historical reference with unresolved theta semantics; (2) supplied 64-ray, 1-degree corrected source and CSV provenance; (3) any new .5-degree search version, labeled as a deliberate recomputation. Compute every reported effective theta from the curve of the exact selected geometry and resolution. Never use the Figure8 theta labels to validate newly generated web designs.

Reproduce the complete nine-state tables and curves with `python scripts/generate-optics-versions.py --output /tmp/optics-versions.json --csv-output /tmp/versioned-optima.csv` (requires NumPy). Compare against `tests/fixtures/optics-versions.json` and [the full CSV table](evaluation/versioned-optima.csv). `docs/evaluation/reference_definitions.py` contains the extracted author computational definitions. `tests/optics-versions.test.mjs` checks the JavaScript against both independent NumPy tables, not against the unresolved published θ labels.

Key hashes:

- `ray_trace.py`: c7f1f397565af6a32d2c9c6acfaeb3e04a0f72402265593f538093fdcd09310a
- `optimize_lens.py`: 4887fc5a3f4dc61c82be70b485d5f26fc3d39cf8b3dd94e601920b01ae2ce978
- `compute_opv.py`: 163aa01a92321a5ee7b03d61d78be3e3f4adcd7d364ebca92c49c97560c04bcc
- `plot_best_at_phi70.py`: f2afa4a90bc0bc0b3637d7f281824d939fb099bc6fcc5ba5275f56f55f8cb66f
- `phi_curves_best_phi70.svg`: 170cc0a4eb6b1b50875c9d68d7667a4ea8402e3a212f22942b7829535729767c
- `experimentation/heatmap_N4_phi70.svg`: 1340ebd9446e41612fb70390da03a18bcc7f5512ccc7e9344f9311a933df3cb2
