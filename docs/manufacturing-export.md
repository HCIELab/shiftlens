# Manufacturing exports

All exports use the same state-1 part poses as the viewport. STL files retain geometry only. The web app does not require Rhino or Grasshopper to create any export.

## Textured 3MF

`assembly.3mf` stores the existing closed component meshes in millimeters. With all image states assigned, it embeds the exact encoded PNG and maps it to the carrier's image-facing triangles using the same padded surface UV coordinates as the preview. Carrier walls, pocket floors and travel stops keep their structural color. No open paper overlay is added to the manufacturing mesh.

The archive includes the [3MF Materials and Properties Extension](https://github.com/3MFConsortium/spec_materials/blob/master/3MF%20Materials%20Extension.md), required extension declaration, PNG content type and model-to-texture relationship. A reader that does not support that extension must reject it rather than silently dropping the image. Without all images, Export writes a core, geometry-only 3MF with no required texture extension.

## VRML97

The ZIP also includes `assembly.wrl` and `carrier-texture.png`. Keep them in the same folder. VRML coordinates are **meters**, as specified by [VRML97](https://www.web3d.org/documents/specifications/14772/V2.0/part1/concepts.html); the exported coordinates are divided by 1000 from the millimeter design.

Each closed part remains one complete IndexedFaceSet. The carrier uses separate texture-coordinate indices for its image faces and its plain structural faces. A one-pixel plain-color border in the PNG atlas supplies the latter without splitting the solid or adding coplanar surfaces. Lens, mask and mechanism remain separate named material roles.

These are interoperable color/texture and mesh outputs, not proprietary J55 tray files or material recipes. A print operator must assign suitable clear, opaque and structural printer materials. No printer import, fabrication or optical calibration is claimed. The SVG/PNG paper-insert workflow remains available independently of multi-material printing.

## Verification

`tests/textured-export.test.mjs` checks all three motion families and the radial example: texture bytes, relationships, face-property indices, image-face classification, coordinate scale, unchanged triangle counts and complete closed-part geometry. `verification.json` includes the actual optical version and automatic-optimization result, geometry statistics, rigid-part intersections and any intended detent contact data. Texture-capable importer and printer tests are separate from these computational checks.
