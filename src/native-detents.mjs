import {sourcePartMesh,nativeAt,NATIVE} from './native-actuation.mjs';
import {framePoint} from './actuation.mjs';
import {motionPoint} from './surface.mjs';

// New web-generated opposite-wall flexure. The original pinion is the cutter
// for seats at the exact optical states; the original hardware is untouched.
// This models a compliant contact, not a second fixed rack meshed to the gear.
export function fitKnobDetent(api,s,d,m,base){
 const {own,solid,cut,union,lib}=api;
 const length=Math.abs(m.contactRate*m.travel),end=5.5,lo=-end,hi=length+end;
 function prism(x0,x1,y0,y1,z0,z1,steps=40){
  const p=[],t=[];
  for(let j=0;j<=steps;j++)for(const[x,z]of [[x0,z0],[x1,z0],[x1,z1],[x0,z1]])p.push(...motionPoint(s,framePoint(m.frame,[x,0,z]),(y0+(y1-y0)*j/steps)/m.contactRate));
  for(let j=0;j<steps;j++)for(let k=0;k<4;k++){const a=j*4+k,b=j*4+(k+1)%4,c=b+4,e=a+4;t.push(a,b,c,a,c,e);}
  t.push(0,2,1,0,3,2,steps*4,steps*4+1,steps*4+2,steps*4,steps*4+2,steps*4+3);
  let v=0;for(let j=0;j<t.length;j+=3){const a=t[j]*3,b=t[j+1]*3,c=t[j+2]*3;v+=p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])+p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]);}
  if(v<0)for(let j=0;j<t.length;j+=3)[t[j+1],t[j+2]]=[t[j+2],t[j+1]];
  return solid({positions:p,triangles:t});
 }
 const pinion=solid(sourcePartMesh(75,m));
 // Inflate the 2D CAD section only for seat clearance. Moving hardware is
 // never scaled. Gear teeth have constant Z through the working band.
 const section=own(pinion.slice(0)),clearSection=own(section.offset(.06,'Round',2,32));
 const cutter=own(own(clearSection.extrude(2.9)).translate([0,0,-1.65]));
 const states=Array.from({length:d.stateCount},(_,i)=>i/(d.stateCount-1));
 const seats=union(states.map(phase=>own(cutter.transform(nativeAt(s,m,phase).matrix))));
 const blank=prism(-4.75,-3.5,lo,hi,-1.6,1.1);
 const leaf=cut(blank,seats);
 // Back relief and free sides leave a compliant leaf; end tabs seat in the
 // carrier. Interference with the pinion is intentional between the seats.
 const relief=prism(-5.35,-3.25,lo+.7,hi-.7,-1.85,1.35);
 base=cut(base,relief);
 const samples=Array.from({length:(d.stateCount-1)*8+1},(_,i)=>i/((d.stateCount-1)*8));
 const contact=samples.map(phase=>({phase,volume:own(leaf.intersect(own(pinion.transform(nativeAt(s,m,phase).matrix)))).volume()}));
 const stateContacts=states.map(phase=>contact.find(c=>Math.abs(c.phase-phase)<1e-9)?.volume??0);
 const peaks=states.slice(1).map((right,i)=>Math.max(...contact.filter(c=>c.phase>states[i]&&c.phase<right).map(c=>c.volume)));
 if(stateContacts.some(v=>v>.00001)||peaks.some(v=>v<.001))throw new Error('This knob location does not produce distinct detent seats. Choose smooth motion or another placement.');
 m.detent={kind:'generated-opposite-wall-flexure',sourcePinion:NATIVE.knob.parts[1],statePhases:states,seatClearanceMm:.06,backReliefMm:.6,minimumNominalWebMm:.69,maximumNominalDeflectionMm:.5,contactSamples:contact,stateContactVolumesMm3:stateContacts,betweenStatePeakVolumesMm3:peaks,elasticSimulation:false,stabilityValidated:false,geometryStatus:'experimental-generated-seats; additional equilibrium positions and force not solved'};
 return {base,detent:leaf};
}
