// Port of 10_Evaluation/2_optimization/optimize_lens.py::phi_curve and
// 4_curved-surface/compute_opv.py. Definitions and limitations: docs/optics.md.
const DEG = Math.PI / 180;
export const OPTICS_MODEL = 'shiftlens-evaluation-uniform-x-v1';
export const OPTICS_PROVENANCE = Object.freeze({source:'10_Evaluation',tracer:'2_optimization/optimize_lens.py::phi_curve',curvedSurface:'4_curved-surface/compute_opv.py',sourceSha256:{'2_optimization/ray_trace.py':'c7f1f397565af6a32d2c9c6acfaeb3e04a0f72402265593f538093fdcd09310a','2_optimization/optimize_lens.py':'4887fc5a3f4dc61c82be70b485d5f26fc3d39cf8b3dd94e601920b01ae2ce978','4_curved-surface/compute_opv.py':'163aa01a92321a5ee7b03d61d78be3e3f4adcd7d364ebca92c49c97560c04bcc'}});
export const SEARCH_ANGLES = Object.freeze(Array.from({length:90},(_,i)=>i));
export function validateOptics({p,r,h,N,ior=1.52,rays=64}) {
  if (![p,r,h,ior].every(Number.isFinite) || p<=0 || r<=p/2 || h<0 || ior<=1 || ior>3 || !Number.isInteger(N) || N<2 || N>10 || !Number.isInteger(rays) || rays<2 || rays>4096) throw new Error('Use a positive pitch, radius greater than half the pitch, nonnegative height, 2–10 states, and 2–4096 rays.');
}
// Weighted fraction of rays landing in the central p/N strip, conditional on
// hitting this lens footprint. Escaping rays are excluded, exactly as in Python.
export function phiCurve(input,angles=SEARCH_ANGLES) {
  const q={ior:1.52,rays:64,...input};validateOptics(q);
  if (!Array.isArray(angles) || angles.some(a=>!Number.isFinite(a)||Math.abs(a)>=90)) throw new Error('Viewing angles must be finite and between −90° and 90°.');
  const {p,r,h,N,ior,rays}=q,p2=p/2,ratio=1/ior,ycc=h-Math.sqrt(r*r-p2*p2);
  const samples=Array.from({length:rays},(_,i)=>{const x=-p2+p*i/(rays-1),nx=x/r,ny=Math.sqrt(Math.max(0,1-nx*nx));return {x,nx,ny,y:ycc+r*ny};});
  return angles.map(angle=>{
    const sin=Math.sin(angle*DEG),cos=Math.cos(angle*DEG);let valid=0,center=0;
    for (const s of samples) {
      const w=Math.max(0,cos*s.ny-sin*s.nx),flip=sin*s.nx-cos*s.ny>0;
      const nx=flip?-s.nx:s.nx,ny=flip?-s.ny:s.ny,ci=-(sin*nx-cos*ny),st=ratio*ratio*(1-ci*ci);
      if(st>=1)continue;
      const ct=Math.sqrt(Math.max(0,1-st));let rx=ratio*sin+(ratio*ci-ct)*nx,ry=-ratio*cos+(ratio*ci-ct)*ny;
      const norm=Math.sqrt(rx*rx+ry*ry)||1;rx/=norm;ry/=norm;
      if(ry>=0)continue;
      const x=s.x-s.y*rx/ry;
      if(Math.abs(x)>p2)continue;
      valid+=w;if(Math.abs(x)<=p/(2*N))center+=w;
    }
    return valid>0?center/valid:0;
  });
}
export function viewingHalfAngle(angles,phis,threshold=.7) {
  if(!angles.length||angles.length!==phis.length||!Number.isFinite(threshold)||threshold<=0||threshold>1)throw new Error('Invalid visibility curve or threshold.');
  if(phis[0]<threshold)return 0;
  const failed=phis.findIndex(x=>x<threshold);return angles[failed<0?angles.length-1:failed-1];
}
export function lensResult(input,threshold=.7) {
  const q={ior:1.52,rays:64,...input},phis=phiCurve(q),theta=viewingHalfAngle(SEARCH_ANGLES,phis,threshold);
  return {...q,threshold,angles:[...SEARCH_ANGLES],phis,theta,passes:phis[0]>=threshold,sag:q.r-Math.sqrt(q.r*q.r-q.p*q.p/4)};
}
export function buildGrid(p,nr=50,nh=50) {
  if(!Number.isFinite(p)||p<=0||![nr,nh].every(n=>Number.isInteger(n)&&n>=2&&n<=100))throw new Error('Invalid search grid.');
  return {radii:Array.from({length:nr},(_,i)=>p/2+.01+(15*p-p/2-.01)*i/(nr-1)),heights:Array.from({length:nh},(_,i)=>2*p*i/(nh-1))};
}
// Keep strict > and r-major/h-minor order: Python resolves tied optima by the
// first grid entry, even when no design passes the requested threshold at 0°.
export function optimizeLens({p,N,ior=1.52,threshold=.7,minHeight=0,maxSubstrate=20,paperZ=0,nr=50,nh=50},onProgress=()=>{}) {
  validateOptics({p,N,ior,r:p/2+.01,h:0,rays:64});
  if(!Number.isFinite(threshold)||threshold<=0||threshold>1||!Number.isFinite(minHeight)||minHeight<0)throw new Error('Invalid optimization threshold or height.');
  const {radii,heights}=buildGrid(p,nr,nh);let best=null,fitted=null;
  for(let i=0;i<radii.length;i++){
    for(const h of heights){
      const q={p,r:radii[i],h,N,ior,rays:64};
      // Stop at the first failed angle; subsequent islands cannot increase θ.
      // Full curves are recomputed for the selected candidates below.
      let theta=0,passes=false;
      for(const a of SEARCH_ANGLES){const phi=phiCurve(q,[a])[0];if(a===0)passes=phi>=threshold;if(phi<threshold)break;theta=a;}
      const candidate={...q,theta,passes};
      if(!best||theta>best.theta)best=candidate;
      if(h>=minHeight&&h+paperZ<=maxSubstrate&&(!fitted||theta>fitted.theta))fitted=candidate;
    }
    onProgress((i+1)/radii.length);
  }
  return {model:OPTICS_MODEL,provenance:OPTICS_PROVENANCE,grid:{nr,nh,rMin:p/2+.01,rMax:15*p,hMin:0,hMax:2*p,angleStep:1,rays:64},threshold,minHeight,paperZ,best:lensResult(best,threshold),fitted:fitted?lensResult(fitted,threshold):null};
}
export function overallVisibility(offsets,phis) {
  if(!offsets.length||offsets.length!==phis.length||offsets.some(a=>!Number.isFinite(a)||Math.abs(a)>=90)||phis.some(v=>!Number.isFinite(v)||v<0||v>1))throw new Error('OPV needs matching front-facing angles and visibility values.');
  let sum=0,weight=0;offsets.forEach((a,i)=>{const w=Math.cos(a*DEG);sum+=phis[i]*w;weight+=w;});return sum/weight;
}
export function cylinderBenchmark(input,{radius=25,lenses=15}={}) {
  if(!Number.isFinite(radius)||radius<=0||!Number.isInteger(lenses)||lenses<1||lenses>301||lenses%2!==1)throw new Error('Use a positive cylinder radius and an odd lens count.');
  const offsets=Array.from({length:lenses},(_,i)=>Math.abs(i-(lenses-1)/2)*input.p/radius/DEG);
  if(offsets.some(a=>a>=90))throw new Error('Cylinder benchmark lenses must face the viewer. Increase the cylinder radius or reduce the lens count.');
  const phis=phiCurve(input,offsets);return {radius,lenses,offsets,phis,opv:overallVisibility(offsets,phis)};
}
// The profile generator uses the same r/p ratio across a varying-pitch surface.
export function capSag(pitch,ratio=.5){const r=pitch*ratio;return r-Math.sqrt(Math.max(0,r*r-pitch*pitch/4));}
export function capHeight(pitch,x,substrate,ratio=.5){const r=pitch*ratio;return substrate-Math.sqrt(Math.max(0,r*r-pitch*pitch/4))+Math.sqrt(Math.max(0,r*r-x*x));}
