import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import Module from 'manifold-3d';
import {DEFAULTS} from '../src/model.mjs';
import {buildAssembly} from '../src/geometry.mjs';
import {posedPositions} from '../src/export.mjs';
import {SURFACE_PRESETS} from '../src/surface.mjs';
import {switchPlacement} from '../src/switch-placement.mjs';
import {SwitchPreview} from '../src/switch-preview.mjs';
const lib=await Module();lib.setup();
function bounds(p){const b=new THREE.Box3();for(let i=0;i<p.length;i+=3)b.expandByPoint(new THREE.Vector3(p[i],p[i+1],p[i+2]));return b;}
for(const type of ['switch','roller','knob'])test(`${type}: mouse ghost uses the same CAD pose as the built assembly`,()=>{
  const surface=SURFACE_PRESETS.ribbon.surface,parameters={...DEFAULTS,mechanismType:type,switchU:.6,switchV:.45};
  const a=buildAssembly(lib,parameters,{surface,collisionSamples:0}),snapshot=structuredClone(a.derived),ghost=new SwitchPreview();
  try{
    for(const phase of [0,.5,1]){
      const candidate=switchPlacement(a,{u:.6,v:.45},phase,type);assert.equal(candidate.valid,true);
      ghost.show(candidate,surface);ghost.updateMatrixWorld(true);
      const expected=bounds(posedPositions(a.parts.find(p=>p.id==='actuator'),a,phase));
      const moving=ghost.children.filter(p=>!([45,46,72].includes(p.userData.index))),actual=new THREE.Box3();
      for(const mesh of moving)actual.expandByObject(mesh,true);
      assert.ok(actual.min.distanceTo(expected.min)<.0001);assert.ok(actual.max.distanceTo(expected.max)<.0001);
    }
    assert.deepEqual(a.derived,snapshot);
    ghost.show(switchPlacement(a,{u:.002,v:.002},0,type),surface);
    assert.equal(ghost.visible,true);assert.equal(ghost.material.color.getHexString(),'ed4545');
    ghost.show(switchPlacement(a,{u:.6,v:.45},0,type),surface);
    assert.equal(ghost.material.color.getHexString(),'25b46c');assert.equal(ghost.material.opacity,.5);
    ghost.hide();assert.equal(ghost.visible,false);
  }finally{ghost.dispose();}
});
