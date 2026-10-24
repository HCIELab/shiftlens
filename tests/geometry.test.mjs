import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {DEFAULTS} from '../src/model.mjs';
import {buildAssembly} from '../src/geometry.mjs';
import {SURFACE_PRESETS,surfaceAt,motionPoint,surfaceMetrics} from '../src/surface.mjs';
const lib=await Module();lib.setup();
test('door sign has closed positive solids and no sampled intersections',()=>{const a=buildAssembly(lib,DEFAULTS,{collisionSamples:17});console.log('DOOR CHECKS',a.checks);for(const p of a.parts){assert.ok(p.volume>0);assert.ok(p.triangles>0);}assert.equal(a.checks.collisions.length,0);assert.ok(a.checks.maxResidual<1e-9);});
test('the same curve engine generates all three motion families',()=>{for(const key of ['ribbon','vessel','screw']){const s=SURFACE_PRESETS[key].surface;const m=surfaceMetrics(s,5);assert.ok(m.count>2);const a=buildAssembly(lib,{...DEFAULTS,switchEnabled:false},{surface:s,collisionSamples:0});assert.equal(a.parts.length,3);for(const p of a.parts)assert.ok(p.volume>0);}});
