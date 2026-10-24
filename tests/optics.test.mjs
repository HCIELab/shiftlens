import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {phiCurve,viewingHalfAngle,optimizeLens,cylinderBenchmark,overallVisibility,capHeight,capSag} from '../src/optics.mjs';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/optics-python.json',import.meta.url)));
const near=(a,b,eps=2e-12)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
test('corrected ray tracer matches original Python on six profiles, signed views and 64/256 rays',()=>{
  for(const q of fixtures.cases){const result=phiCurve(q,q.angles);result.forEach((v,i)=>near(v,q.phi[i]));const positive=phiCurve(q,q.positiveAngles);positive.forEach((v,i)=>near(v,q.positivePhi[i]));assert.equal(viewingHalfAngle(q.positiveAngles,positive,.7),q.thetaAt07);}
});
test('2500-candidate search retains author grid optima, tie order, and cylinder OPV',()=>{
  for(const q of fixtures.optima){const {best}=optimizeLens(q);near(best.r,q.r);near(best.h,q.h);assert.equal(best.theta,q.theta);near(best.phis[0],q.phiAt0);
    const phis=phiCurve(best,q.cylinder.offsets);phis.forEach((v,i)=>near(v,q.cylinder.phi[i]));near(overallVisibility(q.cylinder.offsets,phis),q.cylinder.opv);
    if(q.cylinder.benchmark!==false){const cylinder=cylinderBenchmark(best);near(cylinder.opv,q.cylinder.opv);cylinder.offsets.forEach((v,i)=>near(v,q.cylinder.offsets[i]));}
  }
});
test('a later visibility island cannot extend the contiguous viewing range',()=>{
  assert.equal(viewingHalfAngle([0,1,2,3],[.8,.6,.9,.95],.7),0);
  assert.equal(viewingHalfAngle([0,1,2],[.6,.9,.95],.7),0);
  const result=optimizeLens({p:5,N:10,threshold:1,nr:2,nh:2});assert.equal(result.best.passes,false);
});
test('mechanically fitted optimum respects the actual image plane and substrate floor',()=>{
  const result=optimizeLens({p:5,N:2,threshold:.7,paperZ:-.53,minHeight:.93});
  assert.equal(result.best.h,0);assert.ok(result.fitted.h>=.93);assert.ok(result.fitted.h+result.paperZ>=.4);assert.ok(result.fitted.passes);assert.ok(result.fitted.theta<=result.best.theta);
});
test('a generated circular cap has the specified radius, pitch endpoints and sag',()=>{
  const p=5,r=4,ratio=r/p,h=1.4,ycc=h-Math.sqrt(r*r-p*p/4);
  for(const x of [-2.5,-1.5,0,1.5,2.5])near(x*x+(capHeight(p,x,h,ratio)-ycc)**2,r*r);
  near(capHeight(p,-p/2,h,ratio),h);near(capHeight(p,p/2,h,ratio),h);near(capHeight(p,0,h,ratio),h+capSag(p,ratio));
  assert.throws(()=>phiCurve({p:5,r:2,h:1,N:2}));assert.throws(()=>phiCurve({p:5,r:3,h:-1,N:2}));assert.throws(()=>cylinderBenchmark({p:5,r:3,h:1,N:2},{radius:10}));
});
