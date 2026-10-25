import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {automaticOptimization,optimizationSignature} from '../src/automatic-optics.mjs';
import {DEFAULTS,readProject,serializeProject} from '../src/model.mjs';
import {buildAssembly} from '../src/geometry.mjs';
import {opticalSection} from '../src/optical-section.mjs';
import {originalDoorParameters} from '../src/original-door-profile.mjs';
import {SURFACE_PRESETS} from '../src/surface.mjs';
const lib=await Module();lib.setup();
test('automatic optimization uses the saved refined version, then builds its selected geometry',()=>{
 const p={...DEFAULTS,...originalDoorParameters};const solved=automaticOptimization(p);
 assert.equal(solved.report.profile,'recomputed-halfdeg-v1');assert.equal(solved.report.grid.angleStep,.5);
 const a=buildAssembly(lib,solved.parameters,{collisionSamples:9}),q=opticalSection(a);
 assert.ok(Math.abs(q.r-solved.report.fitted.r)<1e-8);assert.ok(Math.abs(q.h-solved.report.fitted.h)<1e-8);
 assert.equal(a.checks.collisions.length,0);assert.equal(a.derived.count,20);
 assert.equal(optimizationSignature(solved.parameters),solved.signature);
});
test('state count, source profile and optical dimensions invalidate the solved signature',()=>{
 const p={...DEFAULTS,switchEnabled:false,mechanismType:'custom'},s=SURFACE_PRESETS.ribbon.surface,a=automaticOptimization(p,s),key=a.signature;
 for(const patch of [{stateCount:4},{ior:1.52},{gap:.5},{visibilityThreshold:.8},{opticsProfile:'source-1deg-v1'},{substrate:a.parameters.substrate+.1}])assert.notEqual(optimizationSignature({...a.parameters,...patch},s),key);
 assert.equal(optimizationSignature({...a.parameters,switchU:.7},s),key);
 const n=automaticOptimization({...p,stateCount:4},s);assert.equal(n.report.fitted.N,4);assert.ok(n.report.fitted.passes);
});
test('optimization settings survive project migration and invalid settings are rejected',()=>{
 const images=['data:image/png;base64,AA==','data:image/png;base64,AA=='],p=serializeProject({...DEFAULTS,autoOptimize:false,opticsProfile:'source-1deg-v1',visibilityThreshold:.85},images,[]);
 assert.equal(readProject(p).parameters.autoOptimize,false);assert.equal(readProject(p).parameters.visibilityThreshold,.85);
 assert.throws(()=>readProject({...p,parameters:{...p.parameters,opticsProfile:'unknown'}}));
 assert.throws(()=>readProject({...p,parameters:{...p.parameters,visibilityThreshold:NaN}}));
});
