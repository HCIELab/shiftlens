"""Measure saved geometry independently of the builder's dimension arithmetic.

Run in Rhino MCP after setting validation_model_path to the assembled .3dm.
"""
import json
import os
import Rhino
from Rhino import Geometry as g

ROOT = os.environ['SHIFTLENS_KEYCHAIN_ROOT']
model_path = os.path.join(ROOT, 'output/v04/ShiftLens_keychain_v04.3dm')
model = Rhino.FileIO.File3dm.Read(model_path)
TOL = 0.001


def require(condition, message):
    if not condition:
        raise ValueError(message)


def hits(brep, start, end, axis):
    result = g.Intersect.Intersection.CurveBrep(
        g.LineCurve(g.Point3d(*start), g.Point3d(*end)), brep, TOL)
    require(result[0], 'Failed to intersect measurement line')
    return sorted(set(round(getattr(p, axis), 6) for p in result[2]))


try:
    objects = [o for o in model.Objects if o.Attributes.GetUserString('StudyCopy') != 'true']
    by_name = {o.Attributes.Name: o for o in objects}
    frame = by_name['TOP_FRAME_AND_RAILS'].Geometry
    clear = by_name['TOP_CLEAR'].Geometry
    carrier = by_name['BOTTOM_IMAGE_CARRIER'].Geometry
    sticker = by_name['PAPER_PLACEHOLDER'].Geometry
    black = [o.Geometry for o in objects
             if o.Attributes.GetUserString('Part') == 'TOP_BLACK_BLOCKERS']
    require(len(black) == 9, 'Expected nine black strips across eight lenses')
    for o in objects:
        require(isinstance(o.Geometry, g.Brep) and o.Geometry.IsValid and o.Geometry.IsSolid,
                'Saved object must be a closed solid: ' + o.Attributes.Name)

    guide_frame_z = hits(frame, (0, 11.7, -1), (0, 11.7, 8), 'Z')
    guide_carrier_z = hits(carrier, (0, 11.7, -1), (0, 11.7, 8), 'Z')
    require(len(guide_frame_z) == 4 and len(guide_carrier_z) == 2, 'Unexpected guide section')
    wall_y = hits(frame, (0, -17, 2), (0, 17, 2), 'Y')
    carrier_y = hits(carrier, (0, -17, 2), (0, 17, 2), 'Y')
    require(len(wall_y) == 4 and len(carrier_y) == 2, 'Unexpected lateral guide section')

    cb = carrier.GetBoundingBox(True)
    sb = sticker.GetBoundingBox(True)
    pocket_z = (sb.Min.Z + sb.Max.Z) / 2
    pocket_x_hits = hits(carrier, (-21, 0, pocket_z), (21, 0, pocket_z), 'X')
    pocket_y_hits = hits(carrier, (sb.Center.X, -17, pocket_z),
                         (sb.Center.X, 17, pocket_z), 'Y')
    pocket_x0 = max(v for v in pocket_x_hits if v < sb.Center.X)
    pocket_x1 = min(v for v in pocket_x_hits if v > sb.Center.X)
    pocket_y0 = max(v for v in pocket_y_hits if v < 0)
    pocket_y1 = min(v for v in pocket_y_hits if v > 0)
    image_z = hits(sticker, (4.5, 0, 0), (4.5, 0, 8), 'Z')
    optical_z = hits(clear, (4.5, 0, 0), (4.5, 0, 8), 'Z')

    gaps = {
        'left_wall': carrier_y[0] - wall_y[1],
        'right_wall': wall_y[2] - carrier_y[1],
        'lower_retaining_lip': guide_carrier_z[0] - guide_frame_z[1],
        'upper_guide': guide_frame_z[2] - guide_carrier_z[1],
        'image_to_lens': optical_z[0] - image_z[-1],
        'sticker_pocket_left': sb.Min.X - pocket_x0,
        'sticker_pocket_right': pocket_x1 - sb.Max.X,
        'sticker_pocket_bottom': sb.Min.Y - pocket_y0,
        'sticker_pocket_top': pocket_y1 - sb.Max.Y,
    }
    for name, measured in gaps.items():
        require(abs(measured - (0.15 if name in ['lower_retaining_lip','upper_guide','image_to_lens'] else 0.5)) < TOL, name + ' incorrect clearance: ' + str(measured))
    require(abs(sb.Diagonal.Z - 0.75) < TOL, 'Sticker thickness is not 0.75 mm')
    require(abs(cb.Max.Z - sb.Max.Z) < TOL, 'Sticker does not sit flush with the carrier top')
    require(abs(cb.Max.Z - sb.Min.Z - 0.75) < TOL, 'Recess is not 0.75 mm deep')

    # Sample the actual bottom material partition, away from strip boundaries.
    bb = clear.GetBoundingBox(True)
    black_bb = black[0].GetBoundingBox(True)
    sample_z = (black_bb.Min.Z + black_bb.Max.Z) / 2
    counts = {'black': 0, 'clear': 0, 'overlap': 0, 'void': 0}
    samples = 800
    for i in range(samples):
        x = bb.Min.X + bb.Diagonal.X * (i + 0.5) / samples
        point = g.Point3d(x, 0, sample_z)
        in_black = any(b.IsPointInside(point, TOL, True) for b in black)
        in_clear = clear.IsPointInside(point, TOL, True)
        counts['black'] += int(in_black)
        counts['clear'] += int(in_clear)
        counts['overlap'] += int(in_black and in_clear)
        counts['void'] += int(not in_black and not in_clear)
    require(counts == {'black': 400, 'clear': 400, 'overlap': 0, 'void': 0},
            'Saved mask does not provide an exact 50/50 partition: ' + str(counts))

    radii = []
    for face in clear.Faces:
        ok, cylinder = face.TryGetCylinder(TOL)
        if ok:
            radii.append(cylinder.Radius)
    require(len(radii) == 8 and all(abs(r - 1.5) < TOL for r in radii),
            'Source lens cylindrical curvature changed')

    require(abs(clear.GetBoundingBox(True).Min.Z-3.3)<TOL,'Lens underside')
    require(abs(clear.GetBoundingBox(True).Max.Z-5.4)<TOL,'Lens height')
    cylinder_feet=[]
    for face in clear.Faces:
        ok,cyl=face.TryGetCylinder(TOL)
        if ok:cylinder_feet.append(cyl.CircleAt(0).Center.Z)
    require(all(abs(z-3.9)<TOL for z in cylinder_feet),'Hemisphere base must be at 3.9 mm')
    require(abs(cylinder_feet[0]-clear.GetBoundingBox(True).Min.Z-.6)<TOL,'Substrate must be 0.6 mm')

    # Carrier and sticker move together; check both endpoints and midpoint.
    collisions = []
    for shift in [0.0, 0.75, 1.5]:
        for moving_name, moving in [('carrier', carrier), ('sticker', sticker)]:
            test = moving.DuplicateBrep()
            test.Transform(g.Transform.Translation(shift, 0, 0))
            overlap_volume = 0.0
            for top in [frame, clear] + black:
                pieces = g.Brep.CreateBooleanIntersection(top, test, TOL)
                if pieces:
                    overlap_volume += sum(abs(g.VolumeMassProperties.Compute(b).Volume) for b in pieces)
            require(overlap_volume < 0.001, moving_name + ' collides during nominal travel')
            collisions.append({'part': moving_name, 'shift_from_first_state': shift,
                               'overlap_mm3': overlap_volume})

    report = {'model': model_path, 'units': str(model.Settings.ModelUnitSystem),
              'closed_valid_solid_count': len(objects), 'measured_gaps_mm': gaps,
              'sticker_thickness_mm': sb.Diagonal.Z, 'recess_depth_mm': cb.Max.Z - sb.Min.Z,
              'lower_lip_thickness_mm': guide_frame_z[1] - guide_frame_z[0],
              'lens_cylinder_radii_mm': radii, 'material_sample_counts': counts,
              'black_fraction': counts['black'] / float(samples),
              'substrate_mm':cylinder_feet[0]-clear.GetBoundingBox(True).Min.Z,
              'lens_feet_z':cylinder_feet,
              'nominal_motion_checks': collisions}
    with open(os.path.join(ROOT, 'output/v04/validation.json'), 'w') as stream:
        json.dump(report, stream, indent=2)
    print(json.dumps(report))
finally:
    model.Dispose()
