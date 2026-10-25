import {derive} from './model.mjs';
import {surfaceMetrics,doorSurface} from './surface.mjs';
import {opticalSection} from './optical-section.mjs';
import {optimizeLens} from './optics.mjs';

// Include every value that can change the solved profile. Mechanism position,
// images and crops are deliberately absent: they do not change this section.
export function optimizationSignature(parameters,surface=null) {
  const p=derive(parameters);
  return JSON.stringify({version:1,profile:p.opticsProfile,threshold:p.visibilityThreshold,N:p.stateCount,ior:p.ior,gap:p.gap,pitch:p.pitch,nativeDoor:p.nativeDoor,innerRadius:p.innerRadius,outerRadius:p.outerRadius,sweepDeg:p.sweepDeg,lensRadiusRatio:p.lensRadiusRatio,substrate:p.substrate,surface});
}
export function automaticOptimization(parameters,surface=null,onProgress=()=>{}) {
  const d=derive(parameters),s=surface??doorSurface(d);
  const metrics=surface?surfaceMetrics(s,d.pitch):{count:d.count};
  const section=opticalSection({surface:s,derived:{...d,...metrics}},.5);
  const paperZ=-d.gap-.18;
  const result=optimizeLens({...section,threshold:d.visibilityThreshold,paperZ,minHeight:.4-paperZ},onProgress);
  const f=result.fitted;
  if(!f?.passes)throw new Error('No lens in this search grid meets the visibility minimum while keeping the image gap and substrate. Lower the minimum visibility or adjust the image gap in Step 1.');
  const next={...parameters,opticalProfile:true,lensRadiusRatio:f.r/f.p,substrate:f.h+paperZ};
  return {parameters:next,signature:optimizationSignature(next,surface),report:{...result,section:.5,selection:'fitted',trigger:'automatic-before-simulation-or-export'}};
}
