import {frameAt,surfaceAt,sub,dot} from './surface.mjs';
import {lensResult,overallVisibility,OPTICS_MODEL,OPTICS_PROVENANCE} from './optics.mjs';
// A local 2D cross-section of the actual generated array, not an arbitrary p=5
// proxy. Native CAD remains a nominal circular approximation (clearly labeled).
export function opticalSection(a,v=.5,u=null) {
  const d=a.derived,start=a.surface.startFraction??0;
  u??=start+.5;
  const k=Math.min(d.count-1,Math.max(0,Math.floor((u-start)*d.count))),u0=start+k/d.count;
  const p=Math.hypot(...sub(surfaceAt(a.surface,u0,v),surfaceAt(a.surface,u0+1/d.count,v)));
  return {p,r:p*(d.opticalProfile?d.lensRadiusRatio:.5)+1e-10,h:d.substrate-d.paperZ,N:d.stateCount,ior:d.ior,rays:64,profile:d.opticsProfile};
}
export function evaluateAssembly(a,threshold=a.derived.visibilityThreshold??.7,v=.5) {
  const input=opticalSection(a,v),result=lensResult(input,threshold),start=a.surface.startFraction??0,center=frameAt(a.surface,start+.5,v);
  const samples=[];
  for(let i=0;i<a.derived.count;i++){
    const u=start+(i+.5)/a.derived.count,f=frameAt(a.surface,u,v),ns=dot(f.normal,center.normal),ts=dot(f.tangent,center.normal);
    if(ns<=0)continue;
    const angle=Math.atan2(ts,ns)*180/Math.PI;
    // Project into each lens's 2D optical section. Out-of-plane obliquity and
    // self-occlusion are not solved by the original cylinder approximation.
    const local=opticalSection(a,v,u),phi=lensResultAt(local,angle);
    samples.push({index:i,angle,phi});
  }
  return {model:OPTICS_MODEL,provenance:OPTICS_PROVENANCE,section:v,...result,approximation:a.sourceGeometry?'Nominal circular section of original CAD':'Circular section of generated lenses',surfaceEstimate:samples.length?{reference:'Array row at the selected primary-curve position; viewer aligned to center normal',samples,opv:overallVisibility(samples.map(s=>s.angle),samples.map(s=>s.phi))}:null,assumptions:['Single air-to-lens interface; homogeneous medium to the image plane','Opaque aperture, air gap exit refraction, material scattering, Fresnel loss and printer response excluded','Surface estimate uses projected local sections; no occlusion or out-of-plane ray tracing'],physicalValidation:'Web-generated outputs have not been physically validated'};
}
import {phiCurve} from './optics.mjs';
const lensResultAt=(input,angle)=>phiCurve(input,[angle])[0];
