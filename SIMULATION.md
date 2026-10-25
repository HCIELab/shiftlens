# Image simulation and its limits

## Display modes

Geometry is an assembly-inspection view. Its translucent material is not a simulation of the image selected by the lens. Starting simulation now switches to Image preview, closes placement/exploded inspection, and uses the same phase for the layer transform and texture sampling. Opening a project with images defaults to Image preview. Both views use a physical glass material with transmission 0.90 and opacity 1, environment reflections, Fresnel response and a low-roughness surface. The image preview replaces only transmitted image radiance with the encoded state reconstruction, with a single ray segment to the underside aperture to retain the opaque mask at lens edges. It no longer uses a 90/10 flat color blend. This is still an uncalibrated design preview. See RENDERING.md for rendering settings and the depth-artifact fix.

Image preview uses idealized aperture magnification. For N image states, a lens magnifies a 1/N-period window of the actual interleaved texture. Moving it by (N−1)/N of a local pitch sweeps the aperture across the ordered state bands. Endpoints reconstruct the assigned images; intermediate positions contain spatially interleaved portions, rather than a global opacity dissolve. `preview.mjs` contains the coordinate contract and the matching GLSL function. The exported encoded texture is the input to this preview.

This is a design preview under an ideal magnification assumption. It does not model material roughness, focal errors, aberrations, finite viewing pupils or printer tolerances. The separate **Experimental ray-traced optics** checkbox in model details remains available for the planar radial example. Its semicircular profile, substrate, index and aperture model are uncalibrated and can predict poor separation for unsuitable dimensions. It is not silently substituted for the default design preview.

## Mapping and framing

Image-canvas aspect follows sampled dimensions of the generated surface. A camera frame based on surface tangents presents the assigned image upright. Mirroring on a reversed lens side is applied in both image encoding and preview; it is not a display-only correction.

Flat translation surfaces use exact affine UV inversion. Other compatible surfaces refine the nearest-grid seed continuously. The previous grid-only mapping visibly quantized and tore text. Source coordinates, N-state band phase, texture padding and rendering all share the same lens count.

## Regression checks

The browser regression uses a 90 × 70 mm flat translation surface, 5 mm nominal lens spacing and the exact supplied JPEGs. It checks states 0, 0.5 and 1; Geometry/Explode → Start; reverse-side/custom-axis orientation; and the door-sign example. Automated checks verify reconstruction at both endpoints for lens counts 3, 14, 18, 37 and 90; spatial switching at mid-travel; surface-derived image aspect; exact planar UVs; and refined UVs on all three motion families.

## Numerical optical evaluation

Step 1 now includes the original evaluation's corrected uniform-X weighted ray tracer, 50 × 50 radius/height optimization, independent cylinder benchmark and section-wise visibility reports. Applying a fitted candidate changes the actual generated circular profile, rails and mechanism fit. This numerical model and the idealized animation have distinct assumptions; the evaluation does not turn the default animation into a calibrated ray trace. See [optics](docs/optics.md) for exact source definitions, independent Python parity fixtures and limitations.
