import cad from './assets/native-mechanisms.mjs';
import {clamp} from './model.mjs';
import {surfaceAt, motionPoint, sub, add, scale, dot} from './surface.mjs';
import {switchFrame, framePoint, frameCoordinates, frameMatrix, motionMatrix} from './actuation.mjs';

// Original widgets.3dm geometry, in mm. No gear, handle or pin is redrawn.
// Only mounts, clearance pockets and repeated native rack cells are fitted.
export const NATIVE = Object.freeze({
  switch: {parts:[44,45,46], h:3.942467388557, slot:0.708105600927, footprint:8},
  roller: {parts:[71,72], radius:2.833037341918, tip:3.210775654174, period:1.186699906762, phase:-0.517271914911, footprint:9},
  knob: {parts:[74,75,76,77], radius:3, tip:4, period:Math.PI, phase:0, footprint:10},
});
export const nativePart = index => cad.parts.find(p=>p.sourceIndex===index);
export const identity = () => [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export function multiply(a,b){return Array.from({length:16},(_,i)=>{const r=i%4,c=Math.floor(i/4);let v=0;for(let k=0;k<4;k++)v+=a[k*4+r]*b[c*4+k];return v;});}
export function transformPoint(m,p){return [0,1,2].map(i=>m[i]*p[0]+m[4+i]*p[1]+m[8+i]*p[2]+m[12+i]);}
export function rotation(axis,angle){const c=Math.cos(angle),s=Math.sin(angle);return axis==='x'?[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]:[c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];}
export const slideFraction = d => (d.stateCount-1)/(d.stateCount*d.count);

export function createNativeMechanism(surface,d,point,type=d.mechanismType??'switch'){
  if(!NATIVE[type])throw new Error('Choose a supported mechanism.');
  const u=point.u??point.angle/d.sweepDeg,v=point.v??(point.radius-d.innerRadius)/(d.outerRadius-d.innerRadius);
  const travel=slideFraction(d), f=switchFrame(surface,u,v), paper=d.paperZ;
  const m={kind:'native',type,u,v,travel,source:cad.source,sha256:cad.sourceSha256,sourceParts:NATIVE[type].parts};
  if(type==='switch'){
    // Keep the measured pin spacing and capsule slot. Raise the whole mounting
    // only as needed to leave a floor under the original rocker on thin bases.
    const h=NATIVE.switch.h, height=Math.max(1.011420368163,paper-d.baseThickness+2.6+h);
    m.upperFrame={...f,origin:framePoint(f,[0,0,height-h])};
    const upper=framePoint(f,[0,0,height]),mid=motionPoint(surface,upper,travel/2),middle=switchFrame(surface,u+travel/2,v);
    m.frame={...middle,origin:sub(mid,scale(middle.z,h))};m.height=height;m.h=h;
  }else{
    const height=type==='knob'?paper-1.2941816556:1.2608163557;
    m.frame={...f,origin:framePoint(f,[0,0,height])};m.height=height;
    m.radius=NATIVE[type].radius;m.period=NATIVE[type].period;
    const contact=type==='roller'?[0,0,-m.radius]:[m.radius,0,0];
    m.contactFrame={...m.frame,origin:framePoint(m.frame,contact)};
    const e=1e-5,velocity=scale(sub(motionPoint(surface,m.contactFrame.origin,e),motionPoint(surface,m.contactFrame.origin,-e)),1/(2*e));
    m.contactRate=dot(velocity,f.y);
    m.spin=-m.contactRate*travel/m.radius;
    m.capLift=type==='knob'?Math.max(0,d.topMax+.4-(height+4.554323981955)):0;
  }
  return m;
}
export function nativeAt(surface,m,phase){
  const q=clamp(phase,0,1),move=motionMatrix(surface,m.travel*q);
  if(m.type!=='switch')return {angle:m.spin*q, matrix:multiply(multiply(move,frameMatrix(m.frame)),rotation(m.type==='roller'?'x':'z',m.spin*q)),distance:Math.abs(m.contactRate*m.travel*q),residual:0};
  const upper=motionPoint(surface,framePoint(m.upperFrame,[0,0,m.h]),m.travel*q),v=frameCoordinates(m.frame,upper);
  const angle=Math.atan2(-v[1],v[2]),radial=Math.hypot(v[1],v[2]);
  return {angle,radial,upper,residual:Math.max(0,m.h-radial,radial-m.h-NATIVE.switch.slot),matrix:multiply(frameMatrix(m.frame),rotation('x',angle)),distance:Math.hypot(...sub(upper,motionPoint(surface,framePoint(m.upperFrame,[0,0,m.h]),0)))};
}
export function partMatrix(a,part,phase){
  if(part.motion==='lens')return motionMatrix(a.surface,slideFraction(a.derived)*phase);
  if(part.motion==='native')return nativeAt(a.surface,a.mechanism,phase).matrix;
  return identity();
}
export function sourcePartMesh(index,m){
  const p=nativePart(index),positions=[...p.positions];
  if(m?.type==='knob'&&m.capLift){
    for(let i=2;i<positions.length;i+=3){
      if(index===76||index===77)positions[i]+=m.capLift;
      if(index===74)positions[i]+=(positions[i]-.487481068327)/ (5.757265876486-.487481068327)*m.capLift;
    }
  }
  return {positions,triangles:p.indices,sourceId:p.sourceId};
}
export function nativePlacement(surface,d,point,type=d.mechanismType??'switch'){
  const m=createNativeMechanism(surface,d,point,type),start=surface.startFraction??0;
  let message='',valid=true;
  const reject=text=>{valid=false;message=text;};
  if(m.u<start||m.u>start+1||m.v<0||m.v>1)reject('Move over the lens surface.');
  const edge=[];for(let i=0;i<=64;i++)for(const uv of [[start+i/64,0],[start+i/64,1],[start,i/64],[start+1,i/64]])edge.push(surfaceAt(surface,...uv));
  const centers=[surfaceAt(surface,m.u,m.v),surfaceAt(surface,m.u+m.travel,m.v)],margin=Math.min(...centers.flatMap(center=>edge.map(p=>Math.hypot(...sub(p,center)))));
  if(margin<NATIVE[type].footprint+d.clearance)reject(`Move the ${type} farther from the rails and edges.`);
  if(d.baseThickness<(type==='knob'?3.3:2.5))reject(`The ${type} needs a thicker image carrier (${type==='knob'?'3.3':'2.5'} mm minimum).`);
  if(type==='switch')for(let i=0;i<=16;i++){
    const k=nativeAt(surface,m,i/16);
    if(k.residual>.015)reject('This stroke exceeds the original switch slot. Use a narrower lens width or another location.');
  }
  if(type!=='switch'&&(!Number.isFinite(m.contactRate)||m.contactRate<1))reject('The rack cannot follow the motion at this location.');
  return {mechanism:m,valid,message:valid?`Click to place the ${type}. Esc to cancel. Full assembly intersections are checked after placement.`:message};
}
