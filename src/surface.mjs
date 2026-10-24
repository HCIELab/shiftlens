// The generative model is a 3D curve swept by a one-parameter rigid motion.
// Presets contain data; none supplies a separate surface implementation.
import {DEG} from './model.mjs';
export const add = (a,b) => a.map((x,i)=>x+b[i]);
export const sub = (a,b) => a.map((x,i)=>x-b[i]);
export const scale = (a,s) => a.map(x=>x*s);
export const dot = (a,b) => a.reduce((s,x,i)=>s+x*b[i],0);
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function unit(a) { const n=Math.hypot(...a); if(n<1e-8) throw new Error('The curve and motion form a degenerate surface here. Move the curve away from the axis or change the direction.'); return scale(a,1/n); }
export function rotate(p,axis,angle) { const c=Math.cos(angle),s=Math.sin(angle); return add(add(scale(p,c),scale(cross(axis,p),s)),scale(axis,dot(axis,p)*(1-c))); }
export function validateSurface(s) {
  if(!s || !Array.isArray(s.curve?.points) || s.curve.points.length<2 || s.curve.points.length>64 || s.curve.points.some(p=>!Array.isArray(p)||p.length!==3||p.some(x=>!Number.isFinite(x)||Math.abs(x)>1000))) throw new Error('A curve needs 2–64 finite XYZ points, in millimeters.');
  if(s.curve.interpolation!==undefined&&!['linear','smooth'].includes(s.curve.interpolation)) throw new Error('Choose polyline or smooth curve interpolation.');
  if(!['translation','revolution','screw'].includes(s.motion?.type)) throw new Error('Choose translation, revolution, or screw motion.');
  for(const key of ['origin','axis']) if(!Array.isArray(s.motion[key]) || s.motion[key].length!==3 || s.motion[key].some(x=>!Number.isFinite(x))) throw new Error('The motion axis needs an origin and direction in XYZ.');
  unit(s.motion.axis);
  if(!Number.isFinite(s.motion.angleDeg)||!Number.isFinite(s.motion.distance)||Math.abs(s.motion.angleDeg)>360||Math.abs(s.motion.distance)>600) throw new Error('Use a finite sweep of at most 360° and travel of at most 600 mm.');
  if(s.motion.type==='translation' && Math.abs(s.motion.distance)<1) throw new Error('Translation distance must be at least 1 mm.');
  if(s.motion.type!=='translation' && Math.abs(s.motion.angleDeg)<1) throw new Error('Rotation sweep must be at least 1°.');
  return s;
}
export function curveAt(curve,t) {
  const points=curve.points, q=Math.max(0,Math.min(1,t))*(points.length-1), i=Math.min(points.length-2,Math.floor(q)), f=q-i;
  if(curve.interpolation==='linear' || points.length===2) return add(scale(points[i],1-f),scale(points[i+1],f));
  const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];
  return b.map((_,j)=>0.5*((2*b[j])+(-a[j]+c[j])*f+(2*a[j]-5*b[j]+4*c[j]-d[j])*f*f+(-a[j]+3*b[j]-3*c[j]+d[j])*f*f*f));
}
export function motionPoint(s,point,u) {
  const m=s.motion, axis=unit(m.axis), angle=m.type==='translation'?0:m.angleDeg*DEG*u;
  const distance=m.type==='revolution'?0:m.distance*u;
  return add(add(m.origin,rotate(sub(point,m.origin),axis,angle)),scale(axis,distance));
}
export function surfaceAt(s,u,v) { return motionPoint(s,curveAt(s.curve,v),u); }
export function frameAt(s,u,v) {
  const e=1e-5,p=surfaceAt(s,u,v);
  const du=sub(surfaceAt(s,u+e,v),surfaceAt(s,u-e,v));
  const vlo=Math.max(0,v-e),vhi=Math.min(1,v+e),dv=sub(surfaceAt(s,u,vhi),surfaceAt(s,u,vlo));
  const tangent=unit(du),normal=unit(cross(du,dv)),across=unit(cross(normal,tangent));
  return {position:p,tangent,across,normal:s.flip?scale(normal,-1):normal};
}
export function surfaceMetrics(s,pitch) {
  validateSurface(s);
  if(!Number.isFinite(pitch)||pitch<1||pitch>15) throw new Error('Lens pitch must be 1–15 mm.');
  const paths=[];
  for(let j=0;j<=30;j++){let length=0,prev=surfaceAt(s,0,j/30);for(let i=1;i<=80;i++){const p=surfaceAt(s,i/80,j/30);length+=Math.hypot(...sub(p,prev));prev=p;}paths.push(length);frameAt(s,0.5,j/30);}
  const sorted=[...paths].sort((a,b)=>a-b), count=Math.max(2,Math.min(90,Math.floor(sorted[3]/pitch)));
  return {count,minPitch:sorted[0]/count,maxPitch:sorted.at(-1)/count,referencePitch:sorted[3]/count};
}
export function doorSurface(d) { return {curve:{points:[[d.innerRadius,0,0],[d.outerRadius,0,0]],interpolation:'linear'},motion:{type:'revolution',origin:[0,0,0],axis:[0,0,1],angleDeg:d.sweepDeg,distance:0},startFraction:-0.5,flip:true}; }
export const SURFACE_PRESETS={
  door:{name:'Door sign',surface:{curve:{points:[[100,0,0],[170,0,0]],interpolation:'linear'},motion:{type:'revolution',origin:[0,0,0],axis:[0,0,1],angleDeg:40,distance:0},flip:true}},
  ribbon:{name:'Curved extrusion',surface:{curve:{points:[[0,-35,0],[0,-17,9],[0,0,0],[0,17,-7],[0,35,0]],interpolation:'smooth'},motion:{type:'translation',origin:[0,0,0],axis:[1,0,0],angleDeg:0,distance:90},flip:false}},
  vessel:{name:'Revolved vessel',surface:{curve:{points:[[30,0,0],[40,0,20],[33,0,42],[24,0,65]],interpolation:'smooth'},motion:{type:'revolution',origin:[0,0,0],axis:[0,0,1],angleDeg:280,distance:0},flip:false}},
  screw:{name:'Screw surface',surface:{curve:{points:[[30,0,0],[42,0,18],[35,0,40],[27,0,60]],interpolation:'smooth'},motion:{type:'screw',origin:[0,0,0],axis:[0,0,1],angleDeg:220,distance:24},flip:false}}
};

// Invert the surface coordinates continuously. Sampling only the nearest grid
// point quantized the texture and visibly broke letters along the lens array.
export function projectSurfaceUV(surface, point, seed = [0.5, 0.5], bounds = [0, 1]) {
  const m = surface.motion, curve = surface.curve;
  if (m.type === 'translation' && curve.points.length === 2) {
    const origin = curve.points[0], a = scale(unit(m.axis), m.distance);
    const b = sub(curve.points[1], origin), p = sub(point, origin);
    const aa = dot(a, a), ab = dot(a, b), bb = dot(b, b), det = aa * bb - ab * ab;
    if (Math.abs(det) > 1e-12) return [(dot(p, a) * bb - dot(p, b) * ab) / det, (dot(p, b) * aa - dot(p, a) * ab) / det];
  }
  let [u, v] = seed;
  for (let i = 0; i < 5; i++) {
    const e = 1e-4, lo = Math.max(0, v - e), hi = Math.min(1, v + e);
    const p = surfaceAt(surface, u, v), residual = sub(point, p);
    const a = scale(sub(surfaceAt(surface, u + e, v), surfaceAt(surface, u - e, v)), 1 / (2 * e));
    const b = scale(sub(surfaceAt(surface, u, hi), surfaceAt(surface, u, lo)), 1 / Math.max(1e-8, hi - lo));
    const aa = dot(a, a), ab = dot(a, b), bb = dot(b, b), det = aa * bb - ab * ab;
    if (Math.abs(det) < 1e-10) break;
    const du = (dot(residual, a) * bb - dot(residual, b) * ab) / det;
    const dv = (dot(residual, b) * aa - dot(residual, a) * ab) / det;
    u = Math.max(bounds[0], Math.min(bounds[1], u + du));
    v = Math.max(0, Math.min(1, v + dv));
    if (Math.abs(du) + Math.abs(dv) < 1e-7) break;
  }
  return [u, v];
}
