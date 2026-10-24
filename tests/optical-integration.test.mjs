import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {DEFAULTS} from '../src/model.mjs';
import {buildAssembly} from '../src/geometry.mjs';
import {SURFACE_PRESETS} from '../src/surface.mjs';
import {originalDoorParameters} from '../src/original-door-profile.mjs';
import {opticalSection,evaluateAssembly} from '../src/optical-section.mjs';
import {optimizeLens} from '../src/optics.mjs';
import {serializeDesign,restoreDesign,newDesign} from '../src/project.mjs';
const lib=await Module();lib.setup();
test('applying optics to original door retains layout and generates the evaluated profile',()=>{
  const source=buildAssembly(lib,{...DEFAULTS,...originalDoorParameters},{collisionSamples:0});
  const q=opticalSection(source),paperZ=-source.derived.gap-.18;
  const search=optimizeLens({...q,threshold:.7,paperZ,minHeight:.4-paperZ}),f=search.fitted;
  const parameters={...DEFAULTS,...originalDoorParameters,opticalProfile:true,lensRadiusRatio:f.r/f.p,substrate:f.h+paperZ};
  const applied=buildAssembly(lib,parameters,{collisionSamples:9});
  assert.equal(applied.sourceGeometry,null);assert.equal(applied.derived.count,source.derived.count);
  const actual=opticalSection(applied);assert.ok(Math.abs(actual.r-f.r)<1e-8);assert.ok(Math.abs(actual.h-f.h)<1e-8);assert.ok(Math.abs(actual.p-f.p)<1e-8);
  assert.equal(applied.checks.collisions.length,0);assert.equal(applied.placement.valid,true);
  const design=newDesign();design.parameters=parameters;const restored=restoreDesign(serializeDesign(design));assert.equal(restored.parameters.opticalProfile,true);assert.equal(restored.parameters.lensRadiusRatio,parameters.lensRadiusRatio);
});
test('optimized profiles regenerate every surface family with actual native hardware and collision checks',()=>{
  for(const key of ['ribbon','vessel','screw'])for(const type of ['switch','knob','roller']){
    const p={...DEFAULTS,switchEnabled:true,mechanismType:type,stateCount:type==='switch'?2:3,switchU:.4,switchV:.5};
    const s=SURFACE_PRESETS[key].surface,initial=buildAssembly(lib,p,{surface:s,collisionSamples:0}),input=opticalSection(initial),paperZ=-p.gap-.18;
    const {fitted:f}=optimizeLens({...input,threshold:.7,minHeight:.4-paperZ,paperZ});assert.ok(f?.passes);
    const a=buildAssembly(lib,{...p,opticalProfile:true,lensRadiusRatio:f.r/f.p,substrate:f.h+paperZ},{surface:s,collisionSamples:9});
    assert.equal(a.placement.valid,true,`${key}/${type}: ${a.placement.message}`);assert.equal(a.checks.collisions.length,0,JSON.stringify({key,type,collisions:a.checks.collisions}));
    assert.ok(a.parts.every(p=>p.volume>0));const report=evaluateAssembly(a);assert.ok(Number.isFinite(report.surfaceEstimate.opv));assert.equal(report.N,p.stateCount);
  }
});
