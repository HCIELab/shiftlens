import cad from './assets/native-mechanisms.mjs';
import {NATIVE, nativeAt, sourcePartMesh} from './native-actuation.mjs';
import {framePoint, frameMatrix, motionMatrix, frameCoordinates} from './actuation.mjs';
import {motionPoint} from './surface.mjs';

// Mounts and clearance openings belong to the generated carrier/housing. The
// moving hardware and each repeated rack tooth retain the source CAD profile.
export function fitNative(api,s,d,m,bodies){
  const {own,solid,union,cut,box,cylinder,lib}=api;
  let {base,lens,mask}=bodies;
  const placed=(body,frame)=>own(body.transform(frameMatrix(frame)));
  const source=index=>solid(sourcePartMesh(index,m));
  const pose=(body,matrix)=>own(body.transform(matrix));
  const sweep=(body,inverse=false)=>union(Array.from({length:25},(_,i)=>pose(body,motionMatrix(s,m.travel*i/24*(inverse?-1:1)))));
  let actor;
  if(m.type==='switch'){
    actor=source(44);
    // The rocker is fixed to the carrier; its top pin is fixed to the lens.
    // Reserve its complete angular sweep in BOTH mating solids.
    const reach=Math.max(...Array.from({length:17},(_,i)=>Math.abs(Math.sin(nativeAt(s,m,i/16).angle))*12.51))+2.3+d.clearance;
    const envelope=placed(box([5+2*d.clearance,2*reach,16],[0,0,5.2]),m.frame);
    base=cut(base,envelope);lens=cut(lens,sweep(envelope,true));mask=cut(mask,sweep(envelope,true));
    base=union([base,placed(source(46),m.frame)]);
    // The lower axle can enter a curved lens even below its local tangent
    // plane. Clear its actual fixed span throughout the lens stroke too.
    const axleClear=placed(cylinder(9.815+2*d.clearance,1+d.clearance,[0,0,0],'x'),m.frame);
    const axleOpening=sweep(axleClear,true);lens=cut(lens,axleOpening);mask=cut(mask,axleOpening);
    const supports=[];
    for(const x of [-3.85,3.85])supports.push(placed(box([1.5,3,m.height+.2],[x,0,(m.height+.2)/2]),{...m.upperFrame,origin:framePoint(m.upperFrame,[0,0,m.h-m.height])}));
    lens=union([lens,placed(source(45),m.upperFrame),...supports]);
    m.paperCut={frame:m.frame,halfX:2.5+d.clearance,halfY:6};
  }else{
    const roller=m.type==='roller',cfg=NATIVE[m.type];
    actor=roller?source(71):union([74,75,76,77].map(source));
    // Rotor clearance is swept in fixed-carrier coordinates. It remains valid
    // on a spatial curve, because motionMatrix is the same rigid motion used
    // by the lens, shader, preview, and exported assembly.
    const rotorEnvelope=placed(cylinder(roller?6.4:3.0,cfg.tip+d.clearance,[0,0,0],roller?'x':'z'),m.frame);
    const pocket=sweep(rotorEnvelope);
    base=cut(base,pocket);
    if(roller){
      lens=cut(lens,rotorEnvelope);mask=cut(mask,rotorEnvelope);
      const supports=[];
      for(const x of [-4.5,4.5])supports.push(placed(box([1.5,3.2,m.height+.6],[x,0,(.6-m.height)/2]),m.frame));
      lens=union([lens,placed(source(72),m.frame),...supports]);
    }else{
      const shaftEnvelope=placed(cylinder(d.topMax-m.height+2,2.12,[0,0,(d.topMax-m.height)/2]),m.frame);
      lens=cut(lens,shaftEnvelope);mask=cut(mask,shaftEnvelope);
      // A fitted sleeve guides the original shaft. The handle/flange are only
      // raised by capLift, with the original cylinder extended axially.
      const sleeve=placed(cut(cylinder(d.topMax,2.8,[0,0,d.topMax/2-m.height]),cylinder(d.topMax+1,2.12,[0,0,d.topMax/2-m.height])),m.frame);
      lens=union([lens,sleeve]);
      lens=cut(lens,rotorEnvelope);mask=cut(mask,rotorEnvelope);
    }
    const rack=makeRack(api,s,d,m);
    base=union([base,rack]);
    // A spatial profile can bring a rack backing above the local tangent plane.
    // Reserve its true swept clearance in the lens, including the air gap.
    const points=rack.getMesh().vertProperties,lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<points.length;i+=3){const q=frameCoordinates(m.frame,Array.from(points.subarray(i,i+3)));for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],q[j]);hi[j]=Math.max(hi[j],q[j]);}}
    const rackClear=placed(box(hi.map((v,i)=>v-lo[i]+2*d.clearance),hi.map((v,i)=>(v+lo[i])/2)),m.frame);
    const rackOpening=sweep(rackClear,true);lens=cut(lens,rackOpening);mask=cut(mask,rackOpening);
    m.rack={sourcePart:roller?59:88,period:cfg.period,pitchRadius:cfg.radius,
      backlashMm:.06,correction:roller?[0,0,.679080725381]:[-.94,0,0],repeatedNativeCell:true};
    m.paperCut={frame:m.frame,halfX:roller?3.25:4.35,halfY:cfg.tip+Math.abs(m.contactRate*m.travel)+.5};
  }
  return {base,lens,mask,actor};
}

function makeRack(api,s,d,m){
  const {own,solid,union,lib}=api,roller=m.type==='roller',cfg=NATIVE[m.type];
  const profile=roller?cad.rackProfiles.roller59.profileLocalCenteredOnToothAndPitchPlane:cad.rackProfiles.knob88.profileLocalCenteredOnPitchPlaneAndTooth;
  const length=Math.abs(m.contactRate*m.travel),parts=[];
  const phase=cfg.phase,first=Math.floor((-cfg.tip-1-phase)/cfg.period),last=Math.ceil((length+cfg.tip+1-phase)/cfg.period);
  // Repeat a clean original cell; the source knob rack contained two seams.
  // Close each profile into the carrier. Neither its flank angle nor pitch is
  // substituted with a new gear design.
  const depth=m.height-d.paperZ+d.baseThickness-.1;
  for(let k=first;k<=last;k++){
    const offset=phase+k*cfg.period;
    let polygon,lo,hi;
    if(roller){polygon=[...profile.map(([y,z])=>[y+offset,z]),[profile.at(-1)[0]+offset,-depth+m.radius],[profile[0][0]+offset,-depth+m.radius]];lo=-3.225885471965;hi=3.120588338669;}
    else{polygon=[...profile.map(([x,y])=>[x,y+offset]),[6,profile.at(-1)[1]+offset],[6,profile[0][1]+offset]];lo=-1.7106742666;hi=1.2557560441;}
    const cap=lib.triangulate([polygon]),p=[],t=[],n=polygon.length;
    for(const side of [lo,hi])for(const[a,b]of polygon){
      // Roller polygon coordinates are [along,height]; knob [across,along].
      const actual=roller?[side,0,b-.06]:[a+.06,0,side],y=roller?a:b;
      p.push(...motionPoint(s,framePoint(m.contactFrame,actual),y/m.contactRate));
    }
    for(const[a,b,c]of cap)t.push(c,b,a,n+a,n+b,n+c);
    for(let j=0;j<n;j++){const q=(j+1)%n;t.push(j,q,n+q,j,n+q,n+j);}
    // Determine winding from signed volume after the curved sweep.
    let v=0;for(let i=0;i<t.length;i+=3){const a=t[i]*3,b=t[i+1]*3,c=t[i+2]*3;v+=p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])+p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]);}
    if(v<0)for(let i=0;i<t.length;i+=3)[t[i+1],t[i+2]]=[t[i+2],t[i+1]];
    parts.push(solid({positions:p,triangles:t}));
  }
  return union(parts);
}
