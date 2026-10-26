"""Extract the v03 keychain's SAVED render meshes. No CAD regeneration/rescaling.
Requires rhino3dm 8.35.0 only when refreshing this asset; no Rhino runtime.
Usage: python scripts/prepare-keychain.py /path/to/ShiftLens_keychain_v03_fit_and_masks.3dm
"""
import hashlib, json, sys
from pathlib import Path
import rhino3dm as r
source=Path(sys.argv[1]); model=r.File3dm.Read(str(source))
assert model.Settings.ModelUnitSystem == r.UnitSystem.Millimeters
parts=[]
for o in model.Objects:
    name=o.Attributes.Name
    if name=='PAPER_PLACEHOLDER': continue
    assert isinstance(o.Geometry,r.Brep) and o.Geometry.IsSolid, name
    positions=[]; indices=[]
    for face in o.Geometry.Faces:
        mesh=face.GetMesh(r.MeshType.Render)
        assert mesh is not None, f'Missing saved mesh: {name}'
        offset=len(positions)//3
        # The saved assembly places the carrier at its left stop (-0.75 mm).
        # Normalize its moving parts to the centered carrier frame; the demo
        # then applies exactly -0.75 .. +0.75 mm, including the sticker.
        dx=.75 if name.startswith(('BOTTOM','BRAND')) else 0
        for v in mesh.Vertices: positions.extend(round(c,6)+0.0 for c in (v.X+dx,v.Y,v.Z))
        for a,b,c,d in mesh.Faces:
            indices.extend([offset+a,offset+b,offset+c])
            if c!=d: indices.extend([offset+a,offset+c,offset+d])
    parts.append(dict(name=name,sourceId=str(o.Attributes.Id),normalizationX=dx,positions=positions,indices=indices))
data=dict(source=source.name,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),units='mm',parts=parts)
out=Path(__file__).resolve().parents[1]/'src/assets/keychain-v03.json'
out.write_text(json.dumps(data,separators=(',',':'))+'\n')
print(json.dumps(dict(source=data['source'],sha256=data['sourceSha256'],parts=len(parts),vertices=sum(len(p['positions'])//3 for p in parts),bytes=out.stat().st_size)))
