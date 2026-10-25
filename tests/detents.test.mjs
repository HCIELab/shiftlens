import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {buildAssembly} from '../src/geometry.mjs';
import {DEFAULTS,derive} from '../src/model.mjs';
import {SURFACE_PRESETS} from '../src/surface.mjs';
import {newDesign,serializeDesign,restoreDesign} from '../src/project.mjs';
const lib=await Module();lib.setup();
for(const [key,states] of [['door',2],['door',3],['door',4],['door',5],['ribbon',5],['vessel',5],['screw',5]])test(`${key}/${states}: original pinion seats and generated flexure remain distinct from rigid collisions`,()=>{
 const parameters={...DEFAULTS,mechanismType:'knob',knobMode:'indexed',stateCount:states};
 const a=buildAssembly(lib,parameters,{surface:key==='door'?null:SURFACE_PRESETS[key].surface,collisionSamples:17}),d=a.mechanism.detent;
 assert.deepEqual(a.checks.collisions,[]);assert.deepEqual(a.checks.intendedElasticContacts,d);
 assert.equal(d.sourcePinion,75);assert.equal(d.elasticSimulation,false);assert.equal(d.stabilityValidated,false);
 assert.equal(d.statePhases.length,states);assert.ok(d.stateContactVolumesMm3.every(v=>v<1e-5));
 assert.ok(d.betweenStatePeakVolumesMm3.every(v=>v>.001));
 assert.equal(a.parts.length,4);assert.ok(a.parts.every(p=>p.volume>0));
 // The carrier/flexure union must be a single connected component rather than
 // a floating spring. Other disconnected travel-stop islands are not counted.
 const part=a.parts[0],solid=new lib.Manifold(new lib.Mesh({numProp:3,vertProperties:part.positions,triVerts:part.indices}));
 try{const shells=solid.decompose();try{assert.equal(shells.filter(s=>Math.abs(s.volume())>1e-5).length,1,'flexure must be attached to the carrier');}finally{shells.forEach(s=>s.delete());}}finally{solid.delete();}
});
test('smooth mode stays source-based, and indexing is saved explicitly',()=>{
 const a=buildAssembly(lib,{...DEFAULTS,mechanismType:'knob'},{collisionSamples:0});assert.equal(a.mechanism.detent,undefined);
 const design=newDesign();design.parameters.knobMode='indexed';assert.equal(restoreDesign(serializeDesign(design)).parameters.knobMode,'indexed');
 assert.throws(()=>derive({...DEFAULTS,knobMode:'fake'}));
});
