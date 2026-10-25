# Native CAD mechanisms

Source: `6_together/widgets.3dm`, millimeters.
SHA-256: `71e18ac07ff352292ea694d3f4534074accf5052dc1d5ef1ce8aad87b968caf6`.

The web tool uses the original CAD moving parts. It generates the carrier pockets, bearing mounts, clearance openings and repeated rack cells for the chosen surface. The source Grasshopper file did not contain a complete knob/roller animation constraint; `native-actuation.mjs` implements those constraints for this web tool.

| Mechanism | Source object indices | Constraint |
| --- | --- | --- |
| Switch | 44 rocker, 45 upper pin, 46 lower pin | Lower pin stays on the carrier. Upper pin moves with the lens. Rocker angle is solved from the upper pin in the lower pin frame; the original capsule slot takes the radial change. |
| Roller | 71 wheel, 72 shaft; rack tooth from 59 | 15 teeth, rack period 1.186699906762 mm, pitch radius 2.833037341918 mm. Shaft belongs to the moving lens; wheel rotates around it. |
| Knob | 74 shaft, 75 pinion, 76 flange, 77 cap; rack tooth from 88 | 6 teeth, rack period pi mm, pitch radius 3 mm. Shaft and knob rotate and translate together. |

## Measured source repairs and fitting

- The roller rack in the source is 0.739080725381 mm below proper pitch engagement. Its original tooth profile is raised by that amount, then backed off 0.06 mm for backlash: net +0.679080725381 mm.
- The knob rack is 1 mm too far from the pinion. Its original profile moves -1 mm in local X, plus 0.06 mm backlash: net -0.94 mm. The clean native pi-period cell is repeated; the two nonuniform seams in the baked source rack are not repeated.
- Tooth shapes, moving handle shapes and gear diameters are not rescaled. The knob flange/cap may be raised above the generated lens; the original cylindrical shaft is lengthened axially to connect them. `capLift` is included in the export verification.
- The switch keeps its measured 3.942467388557 mm pin spacing and 0.708105600927 mm straight slot length. Excessive stroke is rejected rather than stretching the original rocker. Its vertical mounting height adapts to carrier thickness.
- The source knob opposite wall has no identifiable detent or spring. Smooth knob and roller motion are continuous. The optional generated indexing wall is documented below; the source CAD itself has no detents.

## Shared motion

All three mechanisms use the generated surface's rigid motion. The lens moves `(N-1)/(N*count)` of the full surface motion for N image states. Gear angle is minus pitch-contact travel divided by pitch radius, including the transported surface frame on revolved/screw surfaces. Placement previews, the visible assembly, animation, collision checks and 3MF/STL exports use the same part transforms.

Switch has 2 image states; knob supports 2–5, roller 2–10. The encoder and idealized optical preview use the same ordered N-state bands. No new assertion of calibrated optical behavior is made for the additional state counts.

The worker checks solid intersections through the stroke. The volume tolerance is 0.02 mm³. Invalid placements remain editable and export is disabled when fitting or collision checks fail. These checks do not replace fabrication and optical calibration.

`native-mechanisms.mjs` is generated from audited tessellations with original object IDs. Run `scripts/prepare-native-cad.py --audit .../native-mechanisms.json --racks .../native-rack-profiles.json` to reproduce it. The audit inputs were obtained by reading and tessellating the source CAD without opening or modifying the user's Rhino document.

## Optional generated indexing wall

**Knob motion → Indexed wall (experimental)** adds a new web-generated compliant opposite wall; it is not a recovered source-CAD part. Smooth motion remains the default and preserves existing saved designs.

The generator uses the original pinion (object 75), its section at Z = 0, and the exact transported pinion poses at phase `i/(N-1)` to cut seats with 0.06 mm clearance. A nominal 0.69 mm minimum web and 0.6 mm back relief leave a flexible wall attached to the carrier at both ends. The original pinion, handle and driving rack remain intact. Releasing a dragged knob selects the nearest optical state in the interface; the timeline can still inspect continuous travel.

The closed exported carrier includes the wall and its end connections. Tests check seats at 2–5 states, intended pinion contact between adjacent states, connected positive-volume carrier geometry, and rigid-part clearance on all three surface families. Some kernels also produce a near-zero-volume shell on the screw example (about 5e-11 mm³); connectivity checks ignore such numerical debris, not substantial disconnected components.

`checks.intendedElasticContacts` records pinion/wall intersection volumes at sampled phases separately from rigid collisions. The wall is displayed undeformed: elastic deflection, stiffness, holding force, fatigue, and additional equilibrium positions are **not solved**. It is an experimental generated mechanism, not proof of stable physical indexing or an exact reconstruction of the paper's spring. Never report these intended compliant contacts as zero total intersections.
