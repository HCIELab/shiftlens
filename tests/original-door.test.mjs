import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import original from '../src/assets/original-door.mjs';
import {originalDoorParameters, usesOriginalLens, usesOriginalRails} from '../src/original-door-profile.mjs';
import {DEFAULTS, derive} from '../src/model.mjs';
import {buildAssembly, addSurfaceUVs} from '../src/geometry.mjs';
import {posedPositions} from '../src/export.mjs';

const lib=await Module();lib.setup();
const parameters={...DEFAULTS,...originalDoorParameters};

// A vertical ray intersects the actual exported triangles, independent of the
// renderer's appearance shader and its image-address calculations.
function covered(part, positions, x, y) {
  for(let i=0;i<part.indices.length;i+=3){
    const a=part.indices[i]*3,b=part.indices[i+1]*3,c=part.indices[i+2]*3;
    const ax=positions[a],ay=positions[a+1],bx=positions[b],by=positions[b+1],cx=positions[c],cy=positions[c+1];
    const den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
    if(Math.abs(den)<1e-10)continue;
    const u=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/den;
    const v=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/den,w=1-u-v;
    if(u>=-1e-6&&v>=-1e-6&&w>=-1e-6&&u*positions[a+2]+v*positions[b+2]+w*positions[c+2]>=0)return true;
  }
  return false;
}

test('original CAD parts retain source identities and form closed positive solids',()=>{
  assert.equal(original.units,'mm');
  assert.match(original.sourceSha256,/^[a-f0-9]{64}$/);
  for(const part of original.parts){
    assert.match(part.sourceId,/^[a-f0-9-]{36}$/i);
    assert.equal(part.closed,true);
    const body=new lib.Manifold(new lib.Mesh({numProp:3,vertProperties:new Float32Array(part.positions),triVerts:new Uint32Array(part.indices)}));
    try{assert.equal(body.status(),'NoError');assert.ok(body.volume()>0);}finally{body.delete();}
  }
  assert.equal(derive(parameters).count,20);
  assert.equal(usesOriginalLens({...parameters,outerRadius:190}),false);
  assert.equal(usesOriginalRails({...parameters,clearance:.4}),false);
});

test('the original door lens covers the finite image through the full slide and remains collision free',()=>{
  const a=buildAssembly(lib,parameters,{collisionSamples:17}),d=a.derived;
  assert.deepEqual(a.sourceGeometry.parts,['lens','rails']);
  assert.deepEqual(a.checks.collisions,[]);
  const image=a.patternMesh.positions,angles=[];
  for(let i=0;i<image.length;i+=3)angles.push(Math.atan2(image[i+1],image[i]));
  assert.ok(Math.abs(Math.min(...angles)-d.a0)<1e-6);
  assert.ok(Math.abs(Math.max(...angles)-d.a1)<1e-6);
  const lens=a.parts.find(p=>p.id==='lens');
  // Avoid the intentional switch opening; test radial rows on both sides of it.
  for(const phase of [0,.25,.5,.75,1]){
    const p=posedPositions(lens,a,phase);
    for(const radius of [100,130,170])for(let i=0;i<=24;i++){
      const angle=d.a0+.0001+(d.sweep-.0002)*i/24;
      assert.ok(covered(lens,p,radius*Math.cos(angle),radius*Math.sin(angle)),`uncovered r=${radius}, angle=${angle}, phase=${phase}`);
    }
  }
});

test('a custom flat image occupies only the unpadded source range',()=>{
  const surface={curve:{points:[[0,-35,0],[0,35,0]],interpolation:'linear'},motion:{type:'translation',origin:[0,0,0],axis:[1,0,0],angleDeg:0,distance:90},flip:false};
  const a=addSurfaceUVs(buildAssembly(lib,{...DEFAULTS,switchEnabled:false},{surface,collisionSamples:0}));
  const xs=Array.from(a.patternMesh.positions).filter((_,i)=>i%3===0),us=Array.from(a.patternMesh.uv).filter((_,i)=>i%2===0),n=a.derived.count;
  assert.ok(Math.abs(Math.min(...xs))<1e-6);
  assert.ok(Math.abs(Math.max(...xs)-90)<1e-6);
  assert.ok(Math.abs(Math.min(...us)-1/(n+2))<1e-6);
  assert.ok(Math.abs(Math.max(...us)-(n+1)/(n+2))<1e-6);
});
