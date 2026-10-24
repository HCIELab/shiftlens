# Glass rendering and housing corrections

The reference is the supplied Rhino render and the 4.09-second screen recording
from October 23. Frames extracted at 0, 20, 40, 60, 80 and 98 percent show white
patches on the uncovered carrier changing as the view rotates.

## Real-time glass

Both Geometry and Image preview use Three.js MeshPhysicalMaterial with
transmission 0.90, opacity 1, transparent false, roughness 0.085 and the selected
IOR. Alpha opacity is not a substitute for optical transmission. A procedural
RoomEnvironment is prefiltered once; Fresnel reflection and the standard
physical specular model provide the visible lens shape. Khronos PBR Neutral
tone mapping preserves image colors better than the tested ACES setting.

The image preview supplies the encoded aperture reconstruction as transmitted
radiance inside the physical material's transmission stage. A single refraction
segment checks whether the underside aperture blocks the view. Glass rails,
rims, sides and mechanism mounts use standard screen-space volume transmission.
The existing optional two-interface geometric trace remains separate. The
default still assumes idealized magnification and is not a calibrated prediction
of real optical separation or lens aberrations.

There is no stochastic path-tracing accumulation or per-frame environment-map
generation. The shared transmission buffer uses half the viewport resolution
in each dimension; the encoded image reconstruction stays at display resolution.
This avoids using a noisy progressive renderer during editing and animation.

References:
- https://threejs.org/docs/pages/MeshPhysicalMaterial.html
- https://threejs.org/examples/webgl_materials_physical_transmission.html
- https://github.com/KhronosGroup/ToneMapping/tree/main/PBR_Neutral

## Depth and normals

The old print had two faces separated by only 0.035 mm; its top was only 0.015 mm
above the carrier, with a camera near plane of 0.1 mm. This was vulnerable to
depth fighting at the camera distances used in the recording. The print is now
one sheet 0.08 mm above the carrier, with a small polygon depth bias. The near
plane follows camera distance to retain depth precision while zooming.

Glass uses transmission rather than alpha blending, avoiding transparent object
sorting. Creased normals keep housing edges hard and the cylindrical lens caps
smooth. The viewport has a uniform light gray background, with no floor plane,
grid or shadow map. In exploded inspection, the paper moves with the
carrier rather than staying suspended between the parts.

## Retaining housing

The clear lens part owns the wraparound walls and underside retaining lips.
The image carrier no longer owns rails that overlap the top of the lens. Rail
thickness and sliding clearance still control real geometry, and the same
solids are used for display, sampled intersection checks and export.

Verification covers rail ownership by comparing generated solids with/without
rails, lip position beneath the carrier, a single separated print sheet, and
the existing door/surface switch sweep and export checks. Browser checks cover
both image endpoints, animation, camera rotation and exploded inspection.

## Original door CAD and coverage

The Door sign example now uses tessellations of the original v17 final lens
cell and both rail solids, with their source IDs and transform recorded in
`src/assets/original-door.mjs`. The carrier uses the source's measured radii
and 40-degree sweep, rebuilt as a closed solid because the saved carrier Brep
is open. The switch, knob and roller use original v06 CAD hardware with generated editable mounts and cutouts. See docs/native-mechanisms.md.

The original cell repeats across 20 encoded periods. An extra leading lens
cell and extended rails maintain coverage while the clear assembly slides by
the image-state stroke (half a period for two states). The image and carrier occupy only the design domain; former
full-width print padding on both sides is removed. Paper UVs and the annular
print export crop the padded encoding to the same finite physical domain.
Narrow connected mechanical stop tabs remain outside it.

Native lens geometry is retained while its baseline curve, sweep, width and
substrate match. Editing these returns to generated geometry; rail/clearance
edits can regenerate the housing while retaining the native lenses. Tests cast
vertical rays through actual posed lens triangles at multiple radii, angles and
phases, independently of the appearance shader, and check 17 motion positions
for intersections.
