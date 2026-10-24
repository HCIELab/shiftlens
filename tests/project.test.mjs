import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {newDesign, designReady, serializeDesign, restoreDesign, isPlanarRadial} from '../src/project.mjs';
import {DEFAULTS} from '../src/model.mjs';
import {buildAssembly} from '../src/geometry.mjs';

const lib = await Module(); lib.setup();
test('New design is empty and has no inherited example or images', () => {
  const a = newDesign(), b = newDesign();
  assert.equal(designReady(a), false);
  assert.equal(a.surface.motion.type, null);
  assert.deepEqual(a.surface.curve.points, []);
  assert.deepEqual(a.images, [null, null]);
  assert.equal(a.parameters.switchEnabled, false);
  a.surface.curve.points.push([20, 0, 0]);
  assert.deepEqual(b.surface.curve.points, []);
});
test('empty and partially assigned projects survive a save/open round trip', () => {
  const draft = newDesign();
  assert.deepEqual(restoreDesign(JSON.parse(JSON.stringify(serializeDesign(draft)))), draft);
  draft.surface.motion.type = 'translation';
  draft.surface.motion.angleDeg = 0;
  draft.images[0] = 'data:image/png;base64,AA==';
  const loaded = restoreDesign(serializeDesign(draft));
  assert.equal(designReady(loaded), false);
  assert.deepEqual(loaded.images, draft.images);
});
test('a new user curve and direction produce actual solids without loading a preset', () => {
  const design = newDesign();
  design.surface.motion.type = 'translation';
  design.surface.motion.angleDeg = 0;
  design.surface.curve.points = [[20, 0, 0], [60, 0, 20], [100, 0, 0]];
  assert.equal(designReady(design), true);
  const assembly = buildAssembly(lib, design.parameters, {surface: design.surface, collisionSamples: 0});
  assert.equal(assembly.door, false);
  assert.equal(assembly.parts.length, 3);
  assert.ok(assembly.parts.every(part => part.volume > 0));
  const loaded = restoreDesign(serializeDesign(design));
  assert.deepEqual(loaded.surface, design.surface);
});
test('a new radial curve can enter the integrated switch path without preset identity', () => {
  const design = newDesign();
  design.surface = {curve: {points: [[100,0,0],[170,0,0]], interpolation:'linear'}, motion:{type:'revolution',origin:[0,0,0],axis:[0,0,1],angleDeg:40,distance:0},flip:true};
  assert.equal(isPlanarRadial(design.surface), true);
  const assembly = buildAssembly(lib, {...DEFAULTS, switchEnabled: true}, {collisionSamples: 9});
  assert.equal(assembly.checks.collisions.length, 0);
  assert.equal(assembly.parts.length, 4);
});
test('version 1 projects still load, while malformed blank drafts are rejected', () => {
  const value = serializeDesign(newDesign());
  assert.throws(() => restoreDesign({...value, surface:{...value.surface,motion:{...value.surface.motion,axis:[0,0,0]}}}));
  const legacy = {...value,version:1,images:['data:image/png;base64,AA==','data:image/png;base64,AA=='],surface:{curve:{points:[[100,0,0],[170,0,0]],interpolation:'linear'},motion:{type:'revolution',origin:[0,0,0],axis:[0,0,1],angleDeg:40,distance:0},flip:true}};
  assert.equal(designReady(restoreDesign(legacy)), true);
});
