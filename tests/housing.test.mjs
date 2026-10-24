import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {DEFAULTS} from '../src/model.mjs';
import {buildAssembly,addSurfaceUVs} from '../src/geometry.mjs';

const lib=await Module();lib.setup();
const surface={curve:{points:[[0,-35,0],[0,35,0]],interpolation:'linear'},motion:{type:'translation',origin:[0,0,0],axis:[1,0,0],angleDeg:0,distance:90},flip:false};
test('retaining the carrier adds clear housing geometry beneath it, not opaque rails over the lens',()=>{
  const free=buildAssembly(lib,{...DEFAULTS,switchEnabled:false,rails:false},{surface,collisionSamples:0});
  const held=buildAssembly(lib,{...DEFAULTS,switchEnabled:false,rails:true},{surface,collisionSamples:0});
  const part=(a,id)=>a.parts.find(p=>p.id===id);
  assert.ok(Math.abs(part(held,'base').volume-part(free,'base').volume)<1e-5);
  assert.ok(part(held,'lens').volume>part(free,'lens').volume+100);
  assert.equal(part(held,'lens').material,'clear');
  assert.equal(part(held,'lens').motion,'lens');
  const lowest=Math.min(...Array.from(part(held,'lens').positions).filter((_,i)=>i%3===2));
  assert.ok(lowest<held.derived.baseBottom-DEFAULTS.clearance);
});
test('the image insert is one separated sheet without a competing back face',()=>{
  const a=addSurfaceUVs(buildAssembly(lib,{...DEFAULTS,switchEnabled:false},{surface,collisionSamples:0}));
  const heights=Array.from(a.patternMesh.positions).filter((_,i)=>i%3===2);
  assert.ok(heights.every(z=>Math.abs(z-(a.derived.paperZ+.08))<1e-8));
  assert.equal(a.patternMesh.uv.length,a.patternMesh.positions.length/3*2);
});
