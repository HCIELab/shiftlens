import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {DEFAULTS,derive,encodingSample} from '../src/model.mjs';
import {SURFACE_PRESETS,doorSurface,motionPoint} from '../src/surface.mjs';
import {buildAssembly} from '../src/geometry.mjs';
import {nativeAt,nativePlacement,NATIVE,slideFraction,sourcePartMesh} from '../src/native-actuation.mjs';
import {frameCoordinates} from '../src/actuation.mjs';
import {posedPositions} from '../src/export.mjs';
import {newDesign,serializeDesign,restoreDesign} from '../src/project.mjs';
import {originalDoorParameters} from '../src/original-door-profile.mjs';
import {apertureAddress} from '../src/preview.mjs';
const lib=await Module();lib.setup();
for(const key of ['door','ribbon','vessel','screw'])for(const type of ['switch','roller','knob'])test(`${key} / ${type}: native assembly clears its complete sampled motion`,()=>{
  const surface=key==='door'?null:SURFACE_PRESETS[key].surface;
  const a=buildAssembly(lib,{...DEFAULTS,...(surface?{}:originalDoorParameters),mechanismType:type},{surface,collisionSamples:17});
  assert.equal(a.placement.valid,true);assert.equal(a.mechanism.type,type);assert.equal(a.parts.length,4);
  assert.deepEqual(a.checks.collisions,[]);assert.ok(a.checks.maxResidual<.015);
  assert.equal(a.mechanismSource.file,'6_together/widgets.3dm');assert.match(a.mechanismSource.sha256,/^[a-f0-9]{64}$/);
  const lens=a.parts.find(p=>p.id==='lens');
  for(const phase of [0,.5,1]){
    const positions=posedPositions(lens,a,phase),want=motionPoint(a.surface,Array.from(lens.positions.subarray(0,3)),phase*slideFraction(a.derived));
    want.forEach((value,j)=>assert.ok(Math.abs(value-positions[j])<1e-4));
    const k=nativeAt(a.surface,a.mechanism,phase);
    if(type==='switch'){
      const v=frameCoordinates(a.mechanism.frame,k.upper),radial=Math.hypot(v[1],v[2]);
      assert.ok(radial>=NATIVE.switch.h-.015&&radial<=NATIVE.switch.h+NATIVE.switch.slot+.015);
      assert.ok(Math.abs(k.angle-Math.atan2(-v[1],v[2]))<1e-10);
    }else assert.ok(Math.abs(k.angle+k.distance/a.mechanism.radius)<1e-10);
  }
});
for(const [type,states]of [['knob',5],['roller',10]])test(`${type}: maximum state count, encoding and project survive together`,()=>{
  const p={...DEFAULTS,...originalDoorParameters,mechanismType:type,stateCount:states},a=buildAssembly(lib,p,{collisionSamples:25});
  assert.deepEqual(a.checks.collisions,[]);assert.equal(a.mechanism.travel,(states-1)/(states*a.derived.count));
  const design=newDesign();design.surface=SURFACE_PRESETS.door.surface;design.mechanism=type;design.parameters=p;
  design.images=Array(states).fill('data:image/png;base64,AA==');design.crops=Array.from({length:states},()=>({zoom:1,x:0,y:0}));
  assert.equal(restoreDesign(serializeDesign(design)).mechanism,type);
  for(let state=0;state<states;state++)for(const u of [.05,.18,.33,.51,.76,.91]){
    const address=apertureAddress(u,a.derived.count,state/(states-1),1,8192,states),sample=encodingSample((address*(a.derived.count+2)-1)/a.derived.count,a.derived.count,states);
    assert.equal(sample.state,state);assert.ok(Math.abs(sample.sourceU-u)<.002);
  }
});
test('native switch body and roller gear retain unscaled source volumes',()=>{
  for(const[type,index]of [['switch',44],['roller',71]]){
    const p=sourcePartMesh(index),body=new lib.Manifold(new lib.Mesh({numProp:3,vertProperties:new Float32Array(p.positions),triVerts:new Uint32Array(p.triangles)}));
    try{const a=buildAssembly(lib,{...DEFAULTS,mechanismType:type},{collisionSamples:0});assert.ok(Math.abs(body.volume()-a.parts.find(p=>p.id==='actuator').volume)<1e-7);}finally{body.delete();}
  }
});
test('invalid placements remain recoverable without a disconnected mechanism',()=>{
  const a=buildAssembly(lib,{...DEFAULTS,mechanismType:'knob',switchRadius:169},{collisionSamples:0});
  assert.equal(a.placement.valid,false);assert.equal(a.mechanism,null);assert.equal(a.parts.length,3);
  assert.equal(nativePlacement(a.surface,a.derived,{radius:140,angle:0},'knob').valid,true);
  assert.equal(nativePlacement(a.surface,{...a.derived,baseThickness:2},{radius:140,angle:0},'knob').valid,false);
  const d=derive({...DEFAULTS,pitch:10,switchRadius:160}),s=doorSurface(d);
  assert.equal(nativePlacement(s,{...d,topMax:d.rimHeight},{radius:160,angle:0},'switch').valid,false);
});
test('a newly drawn tight curve clears the fixed lower switch axle',()=>{
  const surface={curve:{points:[[20,0,0],[40,0,0],[60,0,8],[80,0,0],[100,0,0]],interpolation:'smooth'},motion:{type:'translation',axis:[0,1,0],origin:[0,0,0],distance:90,angleDeg:0},flip:true};
  const a=buildAssembly(lib,{...DEFAULTS,switchU:.53225,switchV:.48057},{surface,collisionSamples:17});
  assert.equal(a.placement.valid,true);assert.deepEqual(a.checks.collisions,[]);
});
