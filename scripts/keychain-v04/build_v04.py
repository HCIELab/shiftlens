"""Derive v04 from the saved v03 assembly; run in Rhino 8 through run_python.
Preserves the source hemispherical surfaces and all carrier/branding geometry.
Dimensions in mm. v03 is never overwritten.
"""
import os, json, math, hashlib
import Rhino
from Rhino import Geometry as g
ROOT=os.environ['SHIFTLENS_KEYCHAIN_ROOT']
SOURCE=os.path.join(ROOT,'output/ShiftLens_keychain_v03_fit_and_masks.3dm')
OUT=os.path.join(ROOT,'output/v04')
os.makedirs(OUT,exist_ok=True)
doc=__rhino_doc__
TOL=.001
P={'version':'v04','pitch':3.,'radius':1.5,'substrate':.6,'ior':1.4,
   'lensBottom':3.3,'lensFeet':3.9,'lensTop':5.4,'paperZ':3.15,
   'imageGap':.15,'guideGap':.15,'maskThickness':.3,'maskCoverage':.5,
   'travel':1.5,'carrierBottom':1.15,'carrierTop':3.15,
   'paperWidth':26.5,'paperHeight':21.2,'paperThickness':.75,
   'outerWidth':40.,'outerHeight':30.}
source=Rhino.FileIO.File3dm.Read(SOURCE)
objects={o.Attributes.Name:o for o in source.Objects}
def solid(b,label):
 if not b or not b.IsValid or not b.IsSolid: raise ValueError(label+' invalid/not solid')
 if b.SolidOrientation==g.BrepSolidOrientation.Inward: b.Flip()
 return b
def one(result,label):
 if result is None or len(result)!=1: raise ValueError(label+' expected one solid')
 return solid(result[0],label)
def box(a,b,c,d,e,f):
 return solid(g.Brep.CreateFromBox(g.BoundingBox(g.Point3d(a,c,e),g.Point3d(b,d,f))),'box')
def diff(a,b,label): return one(g.Brep.CreateBooleanDifference(a,b,TOL),label)
def rounded(x0,x1,y0,y1,r,z):
 k=r/math.sqrt(2); p=lambda x,y:g.Point3d(x,y,z); seg=[]
 def line(a,b):
  if a.DistanceTo(b)>TOL:seg.append(g.LineCurve(a,b))
 def arc(a,m,b):seg.append(g.Arc(a,m,b).ToNurbsCurve())
 line(p(x0+r,y0),p(x1-r,y0));arc(p(x1-r,y0),p(x1-r+k,y0+r-k),p(x1,y0+r))
 line(p(x1,y0+r),p(x1,y1-r));arc(p(x1,y1-r),p(x1-r+k,y1-r+k),p(x1-r,y1))
 line(p(x1-r,y1),p(x0+r,y1));arc(p(x0+r,y1),p(x0+r-k,y1-r+k),p(x0,y1-r))
 line(p(x0,y1-r),p(x0,y0+r));arc(p(x0,y0+r),p(x0+r-k,y0+r-k),p(x0+r,y0))
 return g.Curve.JoinCurves(seg,TOL)[0]
def extrusion(c,h):return solid(g.Extrusion.Create(c,h,True).ToBrep(),'extrusion')
black_names=sorted(n for n in objects if n.startswith('TOP_BLACK_BLOCKERS'))
envelope=one(g.Brep.CreateBooleanUnion([objects['TOP_CLEAR'].Geometry.DuplicateBrep()]+[objects[n].Geometry.DuplicateBrep() for n in black_names],TOL),'restore envelope')
# Remove 0.9 mm from the flat substrate only, then lower the whole optical stack.
# The eight radius-1.5 cylindrical surfaces are not scaled.
clear=one(g.Brep.CreateBooleanIntersection(envelope,box(-10,16,-11,11,4.9,8),TOL),'trim flat substrate')
clear.Transform(g.Transform.Translation(0,0,-1.6))
black={}
for name in black_names:
 b=objects[name].Geometry.DuplicateBrep();b.Transform(g.Transform.Translation(0,0,-.7));black[name]=b
 clear=diff(clear,b,'partition mask '+name)
frame=extrusion(rounded(-20,20,-15,15,3,0),P['lensFeet'])
frame=diff(frame,box(-18.75,21,-12.5,12.5,1,P['lensBottom']),'guide channel')
frame=diff(frame,box(-18.75,21,-10.6,10.6,-1,1.01),'lower opening')
frame=diff(frame,box(-9,15,-10,10,P['lensBottom']-.01,8),'lens aperture')
frame=diff(frame,extrusion(rounded(-17.25,-11.75,-2,2,2,-1),9),'ring slot')
new={**black,'TOP_CLEAR':clear,'TOP_FRAME_AND_RAILS':frame}
for name,o in objects.items():
 if name.startswith(('BOTTOM','BRAND')) or name=='PAPER_PLACEHOLDER':
  b=o.Geometry.DuplicateBrep();b.Transform(g.Transform.Translation(0,0,-.35));new[name]=solid(b,name)
# Refuse to change any unrelated open geometry. Work in the new document only.
if any(not o.IsDeleted for o in doc.Objects):raise ValueError('Use an empty Rhino document')
doc.ModelUnitSystem=Rhino.UnitSystem.Millimeters;doc.ModelAbsoluteTolerance=TOL
for layer in source.Layers:
 copy=Rhino.DocObjects.Layer();copy.Name=layer.Name;copy.Color=layer.Color
 if doc.Layers.FindName(layer.Name) is None:doc.Layers.Add(copy)
# Basic material colors are copied; native source glass is assigned below.
for m in source.Materials:
 copy=Rhino.DocObjects.Material();copy.Name=m.Name;copy.DiffuseColor=m.DiffuseColor;copy.Transparency=m.Transparency;copy.IndexOfRefraction=m.IndexOfRefraction;copy.Shine=m.Shine
 doc.Materials.Add(copy)
for name,o in objects.items():
 b=solid(new[name],name);a=o.Attributes.Duplicate();a.SetUserString('KeychainVersion','v04')
 a.SetUserString('SourceV03Object',str(o.Attributes.ObjectId));a.SetUserString('OpticalProfile','p=3 r=1.5 substrate=0.6 air=0.15 mm')
 layer=doc.Layers.FindName(source.Layers[o.Attributes.LayerIndex].Name)
 a.LayerIndex=layer.Index
 doc.Objects.AddBrep(b,a)
doc.Strings.SetString('ShiftLens','KeychainVersion','v04')
doc.Strings.SetString('ShiftLens','Dimensions',json.dumps(P))
exec(compile(open(os.path.join(ROOT,'assign_materials.py')).read(),'assign_materials.py','exec'))
# Force fresh render meshes; no stale v03 render cache is exported.
mp=Rhino.Geometry.MeshingParameters.QualityRenderMesh
mp.MaximumEdgeLength=.4;mp.MinimumEdgeLength=.01;mp.Tolerance=.002
for o in doc.Objects:
 if not o.IsDeleted:o.CreateMeshes(g.MeshType.Render,mp,False)
path=os.path.join(OUT,'ShiftLens_keychain_v04.3dm')
opts=Rhino.FileIO.FileWriteOptions();opts.SuppressDialogBoxes=True;opts.WriteRenderMeshes=True
if not doc.WriteFile(path,opts):raise ValueError('Save failed')
P['sourceSha256']=hashlib.sha256(open(SOURCE,'rb').read()).hexdigest()
P['cadSha256']=hashlib.sha256(open(path,'rb').read()).hexdigest()
with open(os.path.join(OUT,'parameters.json'),'w') as f:json.dump(P,f,indent=2)
source.Dispose();doc.Views.Redraw();print(json.dumps({'saved':path,'parameters':P}))
