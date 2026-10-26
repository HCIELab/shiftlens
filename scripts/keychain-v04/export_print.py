"""Export separate material regions, grouped as two physical pieces. Rhino 8."""
import Rhino, os, json, struct, zipfile
from Rhino import Geometry as g
from xml.etree import ElementTree as ET
ROOT=os.path.join(os.environ['SHIFTLENS_KEYCHAIN_ROOT'],'output/v04')
OUT=os.path.join(ROOT,'print');os.makedirs(os.path.join(OUT,'STL'),exist_ok=True)
m=Rhino.FileIO.File3dm.Read(os.path.join(ROOT,'ShiftLens_keychain_v04.3dm'))
# Keep an exact multi-material 3dm, hardware only, laid out side by side.
paper=next(o for o in m.Objects if o.Attributes.Name=='PAPER_PLACEHOLDER')
m.Objects.Delete(paper.Attributes.ObjectId)
parts=[];replacements=[];mp=g.MeshingParameters.QualityRenderMesh;mp.MaximumEdgeLength=.25;mp.Tolerance=.001;mp.MinimumEdgeLength=.005
for o in m.Objects:
 name=o.Attributes.Name;b=o.Geometry.DuplicateBrep()
 attributes=o.Attributes.Duplicate()
 replacements.append((o.Attributes.ObjectId,b,attributes))
 if name.startswith(('BOTTOM','BRAND')):b.Transform(g.Transform.Translation(50,0,-1.15))
 pieces=g.Mesh.CreateFromBrep(b,mp);mesh=g.Mesh()
 for part in pieces:mesh.Append(part)
 mesh.Faces.ConvertQuadsToTriangles();mesh.Vertices.CombineIdentical(True,True);mesh.Weld(3.141592653589793);mesh.UnifyNormals();mesh.Normals.ComputeNormals();mesh.Compact();mesh.HealNakedEdges(.001);mesh.Vertices.CombineIdentical(True,True);mesh.Normals.ComputeNormals()
 if not mesh.IsValid or not mesh.IsClosed:raise ValueError('Invalid/open print mesh: '+name)
 if mesh.SolidOrientation()<0:mesh.Flip(True,True,True)
 vertices=[(v.X,v.Y,v.Z) for v in mesh.Vertices];faces=[(f.A,f.B,f.C) for f in mesh.Faces]
 with open(os.path.join(OUT,'STL',name+'.stl'),'wb') as f:
  f.write(('ShiftLens v04 mm '+name).encode()[:80].ljust(80,b' '));f.write(struct.pack('<I',len(faces)))
  for i,(a,b,c) in enumerate(faces):
   va,vb,vc=[g.Point3d(*vertices[k]) for k in (a,b,c)];n=g.Vector3d.CrossProduct(vb-va,vc-va);n.Unitize()
   f.write(struct.pack('<12fH',n.X,n.Y,n.Z,*vertices[a],*vertices[b],*vertices[c],0))
 color=o.Attributes.ObjectColor
 parts.append({'name':name,'vertices':vertices,'faces':faces,'color':'#%02X%02X%02XFF'%(color.R,color.G,color.B),'volume':abs(mesh.Volume()),'closed':mesh.IsClosed})
# File3dmObject.Geometry returns detached geometry; explicitly replace objects.
for identifier,geometry,attributes in replacements:
 m.Objects.Delete(identifier);m.Objects.AddBrep(geometry,attributes)
if not m.Write(os.path.join(OUT,'ShiftLens_keychain_v04_PRINT.3dm'),8):raise ValueError('Print 3dm write failed')
# 3MF core: per-region base materials; component objects keep both pieces together.
ns='http://schemas.microsoft.com/3dmanufacturing/core/2015/02';ET.register_namespace('',ns)
tag=lambda n:'{'+ns+'}'+n
model=ET.Element(tag('model'),{'unit':'millimeter','{http://www.w3.org/XML/1998/namespace}lang':'en-US'})
ET.SubElement(model,tag('metadata'),{'name':'Title'}).text='ShiftLens v04 — two multi-material pieces'
resources=ET.SubElement(model,tag('resources'));materials=ET.SubElement(resources,tag('basematerials'),{'id':'1'})
for i,p in enumerate(parts):ET.SubElement(materials,tag('base'),{'name':p['name'],'displaycolor':p['color']})
for i,p in enumerate(parts):
 obj=ET.SubElement(resources,tag('object'),{'id':str(i+2),'type':'model','name':p['name'],'pid':'1','pindex':str(i)})
 mesh=ET.SubElement(obj,tag('mesh'));vs=ET.SubElement(mesh,tag('vertices'));ts=ET.SubElement(mesh,tag('triangles'))
 for v in p['vertices']:ET.SubElement(vs,tag('vertex'),dict(zip(['x','y','z'],[format(a,'.8g') for a in v])))
 for a,b,c in p['faces']:ET.SubElement(ts,tag('triangle'),{'v1':str(a),'v2':str(b),'v3':str(c)})
for oid,prefixes,label in [(100,('TOP',),'Lens and frame'),(101,('BOTTOM','BRAND'),'Image carrier')]:
 obj=ET.SubElement(resources,tag('object'),{'id':str(oid),'type':'model','name':label});components=ET.SubElement(obj,tag('components'))
 for i,p in enumerate(parts):
  if p['name'].startswith(prefixes):ET.SubElement(components,tag('component'),{'objectid':str(i+2)})
build=ET.SubElement(model,tag('build'))
for oid in [100,101]:ET.SubElement(build,tag('item'),{'objectid':str(oid)})
with zipfile.ZipFile(os.path.join(OUT,'ShiftLens_keychain_v04_PRINT.3mf'),'w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')
 z.writestr('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')
 z.writestr('3D/3dmodel.model',ET.tostring(model,encoding='utf-8',xml_declaration=True))
report={'parts':[dict(name=p['name'],triangles=len(p['faces']),closed=p['closed'],volumeMm3=p['volume']) for p in parts],'physicalPieces':2,'units':'mm'}
with open(os.path.join(ROOT,'print-validation.json'),'w') as f:json.dump(report,f,indent=2)
m.Dispose();print(json.dumps({'directory':OUT,'parts':len(parts),'allClosed':True}))
