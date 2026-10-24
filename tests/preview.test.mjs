import test from 'node:test';
import assert from 'node:assert/strict';
import {apertureAddress, imageCanvasSize} from '../src/preview.mjs';
import {encodingSample} from '../src/model.mjs';

test('preview endpoints reconstruct the corresponding encoded image across different lens counts', () => {
  for (const count of [3,14,18,37,90]) for (const phase of [0,1]) {
    for (let i = 0; i < 1000; i++) {
      const sourceU = (i + 0.5) / 1000;
      const padded = apertureAddress(sourceU, count, phase);
      const physicalU = (padded * (count + 2) - 1) / count;
      const decoded = encodingSample(physicalU, count);
      assert.equal(decoded.state, phase);
      assert.ok(Math.abs(decoded.sourceU - sourceU) < .003);
    }
  }
});
test('mid-transition is spatial aperture motion, rather than a whole-image dissolve', () => {
  const states = new Set();
  for (let i = 0; i < 1000; i++) {
    const sample = apertureAddress((i + .5) / 1000, 18, .5);
    states.add(encodingSample((sample * 20 - 1) / 18, 18).state);
  }
  assert.deepEqual([...states].sort(), [0,1]);
});
test('image aspect follows the dimensions of a user-defined flat surface', () => {
  const assembly = {door:false,surface:{curve:{points:[[0,-35,0],[0,35,0]],interpolation:'linear'},motion:{type:'translation',origin:[0,0,0],axis:[1,0,0],angleDeg:0,distance:90},flip:false}};
  const size = imageCanvasSize(assembly);
  assert.equal(size.width,2048);
  assert.ok(Math.abs(size.height/size.width - 70/90) < 1/2048);
});

import {SURFACE_PRESETS,surfaceAt,frameAt,projectSurfaceUV} from '../src/surface.mjs';
test('flat texture coordinates are exact rather than snapped to a coarse grid', () => {
  const s={curve:{points:[[0,-35,0],[0,35,0]],interpolation:'linear'},motion:{type:'translation',origin:[0,0,0],axis:[1,0,0],angleDeg:0,distance:90},flip:false};
  for(const u of [.013,.129,.517,.987])for(const v of [.014,.273,.819]){
    const p=surfaceAt(s,u,v);p[2]=3.2;
    const result=projectSurfaceUV(s,p);
    assert.ok(Math.abs(result[0]-u)<1e-10);assert.ok(Math.abs(result[1]-v)<1e-10);
  }
});
test('curved-surface UV refinement recovers points offset along the lens normal', () => {
  for(const key of ['ribbon','vessel','screw']){
    const s=SURFACE_PRESETS[key].surface;
    for(const [u,v] of [[.23,.29],[.51,.48],[.71,.76]]){
      const f=frameAt(s,u,v),p=f.position.map((x,i)=>x+f.normal[i]*2);
      const actual=projectSurfaceUV(s,p,[u+.003,v-.005]);
      assert.ok(Math.abs(actual[0]-u)<.0001,`${key} u`);assert.ok(Math.abs(actual[1]-v)<.0001,`${key} v`);
    }
  }
});
