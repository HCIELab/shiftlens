"""Independent 2-interface Snell trace of v04 (not the paper's 1-interface model).
Normal view footprint is measured after both faces of the finite mask channel.
"""
import json, math, os
from pathlib import Path
ROOT=Path(os.environ['SHIFTLENS_KEYCHAIN_ROOT'])/'output/v04'
p=json.loads((ROOT/'parameters.json').read_text());pitch=p['pitch'];r=p['radius'];n=p['ior']
def trace(x,angle,gap):
 nx=x/r;nz=math.sqrt(max(0,1-nx*nx));a=math.radians(angle);d=(math.sin(a),-math.cos(a));ci=-(d[0]*nx+d[1]*nz)
 if ci<=0:return None
 ct=math.sqrt(1-(1-ci*ci)/(n*n));rx=d[0]/n+(ci/n-ct)*nx;rz=d[1]/n+(ci/n-ct)*nz
 if rz>=0:return None
 z=p['substrate']+r*nz;top=x+(p['maskThickness']-z)*rx/rz;bottom=x-z*rx/rz
 if max(abs(top),abs(bottom))>pitch/4:return None
 ex=n*rx
 if abs(ex)>=1:return None
 return bottom+gap*ex/math.sqrt(1-ex*ex)
def footprint(gap,angle=0):
 hits=[v for i in range(200001) if (v:=trace(-r+(i+.5)*2*r/200001,angle,gap)) is not None]
 return {'gapMm':gap,'angleDegrees':angle,'minMm':min(hits),'maxMm':max(hits),'widthMm':max(hits)-min(hits),'fractionOfPitch':(max(hits)-min(hits))/pitch,'unblockedRays':len(hits)}
report={'model':'Snell air-to-glass and glass-to-air; both mask faces; normal incidence footprint',
 'paperReference':'2026-shiftlens-paper.pdf sections 3.1, 5.1, 5.3: strips p/N; h is lens-feet to pattern layer. 40% is a user target, not a paper-specified encoding fraction.',
 'parameters':p,'normal':footprint(p['imageGap']),
 'guidePlay':[footprint(g) for g in [0,.3]],'oblique':[footprint(p['imageGap'],a) for a in [10,20]],
 'limitations':['Nominal geometry and source CAD IOR 1.4; not a measured resin/printer calibration.','Mask absorption modeled as binary; no scattering, dispersion or Fresnel intensity.']}
assert .38<report['normal']['fractionOfPitch']<.42
(ROOT/'optics-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report['normal']))
