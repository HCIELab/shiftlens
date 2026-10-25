import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {unzipSync,strFromU8} from 'fflate';
import {DEFAULTS} from '../src/model.mjs';
import {SURFACE_PRESETS} from '../src/surface.mjs';
import {buildAssembly,addSurfaceUVs} from '../src/geometry.mjs';
import {manufacturing3MF,manufacturingVRML,carrierTextureUV} from '../src/export.mjs';
const lib=await Module();lib.setup();
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUuoAAAAASUVORK5CYII=','base64'));
for(const key of ['door','ribbon','vessel','screw'])test(`${key}: texture travels with the closed carrier, with no new triangles`,()=>{
 const a=addSurfaceUVs(buildAssembly(lib,{...DEFAULTS,switchEnabled:false},{surface:key==='door'?null:SURFACE_PRESETS[key].surface,collisionSamples:0}));
 const files=unzipSync(manufacturing3MF(a,png)),xml=strFromU8(files['3D/3dmodel.model']);
 const base=a.parts[0],map=carrierTextureUV(a,base);assert.ok(map.top.length>100);
 assert.deepEqual(files['3D/Textures/encoded-pattern.png'],png);
 assert.match(xml,/requiredextensions="m"/);assert.match(strFromU8(files['3D/_rels/3dmodel.model.rels']),/2013\/01\/3dtexture/);
 assert.equal([...xml.matchAll(/<triangle /g)].length,a.parts.reduce((n,p)=>n+p.triangles,0));
 assert.equal([...xml.matchAll(new RegExp(` pid="${a.parts.length+3}" p1=`,"g"))].length,map.top.length);
 const coords=Array.from(xml.matchAll(/<m:tex2coord u="([^"]+)" v="([^"]+)"/g),m=>[+m[1],+m[2]]);
 assert.equal(coords.length,base.positions.length/3);
 // Top-face vertices stay inside the active padded UV range; no backside or
 // pocket wall is given image properties, even on a spatially curved carrier.
 for(const face of map.top)for(const id of base.indices.subarray(face*3,face*3+3)){
  assert.ok(coords[id][0]>0&&coords[id][0]<1);
  assert.ok(coords[id][1]>=-1e-6&&coords[id][1]<=1.000001);
  assert.ok(Math.abs((base.surfaceHeight?base.surfaceHeight[id]:base.positions[id*3+2])-a.derived.paperZ)<.025);
 }
 const wrl=manufacturingVRML(a,{width:320,height:256});
 assert.match(wrl,/^#VRML V2.0 utf8/);assert.match(wrl,/carrier-texture.png/);
 assert.equal([...wrl.matchAll(/geometry IndexedFaceSet/g)].length,a.parts.length);
 const coordinateBlocks=Array.from(wrl.matchAll(/coord Coordinate \{ point \[ ([\s\S]*?) \] \}/g),m=>m[1].split(',').map(v=>v.trim().split(/\s+/).map(Number)));
 assert.equal(coordinateBlocks[0].length,base.positions.length/3);
 assert.ok(Math.abs(coordinateBlocks[0][0][0]-base.positions[0]/1000)<1e-10);
 const faceBlocks=Array.from(wrl.matchAll(/coordIndex \[ ([\s\S]*?) \]/g),m=>m[1]);
 assert.equal(faceBlocks.reduce((n,b)=>n+[...b.matchAll(/ -1/g)].length,0),a.parts.reduce((n,p)=>n+p.triangles,0));
});
