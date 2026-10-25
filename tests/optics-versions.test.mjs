import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {optimizeLens,profileAngles,lensResult} from '../src/optics.mjs';
const ref=JSON.parse(readFileSync(new URL('./fixtures/optics-versions.json',import.meta.url)));
const near=(a,b)=>assert.ok(Math.abs(a-b)<2e-12,`${a} != ${b}`);
test('both recorded data versions reproduce all nine independent NumPy optima and curves',()=>{
  for(const [profile,version]of Object.entries(ref.versions))for(const d of version.designs){
    const {best}=optimizeLens({p:5,N:d.N,ior:1.52,threshold:.7,profile});
    near(best.r,d.r);near(best.h,d.h);near(best.theta,d.effectiveThetaDeg);
    assert.equal(best.angleStep,version.grid.angleStepDeg);
    best.phis.forEach((phi,i)=>near(phi,d.optimizationCurve.phi[i]));
  }
});
test('published labels remain verbatim evidence and are never substituted for effective angles',()=>{
  assert.equal(ref.paper.heightRatios[2],.65);assert.equal(ref.paper.thetaLabelsDeg[2],26);
  const best=optimizeLens({p:5,N:4,profile:'recomputed-halfdeg-v1'}).best;
  near(best.h/5,32/49);assert.equal(best.theta,8.5);assert.notEqual(best.theta,ref.paper.thetaLabelsDeg[2]);
});
