import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {unzipSync,strFromU8} from 'fflate';
import {derive,DEFAULTS,readProject,serializeProject,remapImageRGBA} from '../src/model.mjs';
import {motionPoint,surfaceAt,validateSurface,SURFACE_PRESETS} from '../src/surface.mjs';
import {buildAssembly} from '../src/geometry.mjs';
import {manufacturing3MF,binarySTL} from '../src/export.mjs';
const lib=await Module();lib.setup();
test('offset axes and screw motion preserve the specified curve transform',()=>{
 const s={curve:{points:[[12,20,0],[12,20,10]],interpolation:'linear'},motion:{type:'screw',origin:[10,20,0],axis:[0,0,2],angleDeg:90,distance:8}};
 const p=motionPoint(s,[12,20,0],1);for(const[a,b]of p.map((x,i)=>[x,[10,22,8][i]]))assert.ok(Math.abs(a-b)<1e-9);
 assert.deepEqual(surfaceAt(s,0,0),[12,20,0]);
});
test('edited generator curves change the resulting solid rather than selecting a canned mesh',()=>{
 const s=structuredClone(SURFACE_PRESETS.ribbon.surface),p={...DEFAULTS,switchEnabled:false};
 const a=buildAssembly(lib,p,{surface:s,collisionSamples:0});s.curve.points[2][2]=14;
 const b=buildAssembly(lib,p,{surface:s,collisionSamples:0});assert.notEqual(a.parts[0].volume,b.parts[0].volume);
 assert.throws(()=>validateSurface({...s,motion:{...s.motion,axis:[0,0,0]}}));
});
test('reversible fabrication edits regenerate valid collision-checked door assemblies',()=>{
 for(const patch of [{pitch:3.5,switchRadius:130,switchAngleDeg:4},{pitch:7.5,switchRadius:155,switchAngleDeg:-5},{rails:false},{sweepDeg:180,switchEnabled:false}]){
  const a=buildAssembly(lib,{...DEFAULTS,...patch},{collisionSamples:7});assert.equal(a.checks.collisions.length,0,JSON.stringify({patch,collisions:a.checks.collisions}));for(const p of a.parts)assert.ok(p.volume>0);
 }
});
test('3MF and STL exports preserve component topology and millimeter units',()=>{
 const a=buildAssembly(lib,DEFAULTS,{collisionSamples:0}),files=unzipSync(manufacturing3MF(a)),xml=strFromU8(files['3D/3dmodel.model']);
 assert.match(xml,/unit="millimeter"/);assert.equal([...xml.matchAll(/<object /g)].length,a.parts.length);
 assert.equal([...xml.matchAll(/<triangle /g)].length,a.parts.reduce((sum,p)=>sum+p.indices.length/3,0));
 assert.equal([...xml.matchAll(/<vertex /g)].length,a.parts.reduce((sum,p)=>sum+p.positions.length/3,0));
 for(const p of a.parts){assert.ok(xml.includes(p.name));const stl=binarySTL(p,a);assert.equal(stl.length,84+p.triangles*50);assert.equal(new DataView(stl.buffer).getUint32(80,true),p.triangles);}
});
test('image encoding preserves state order and project files reject malformed crops',()=>{
 const w=128,h=1,a=new Uint8ClampedArray(w*4),b=new Uint8ClampedArray(w*4);for(let i=0;i<w;i++){a.set([255,0,0,255],i*4);b.set([0,0,255,255],i*4);}
 const encoded=remapImageRGBA(a,b,w,h,4);assert.equal(encoded[Math.floor(.125*w)*4],255);assert.equal(encoded[Math.floor(.25*w)*4+2],255);
 const images=['data:image/png;base64,AA==','data:image/png;base64,AA=='],crops=[{zoom:1,x:0,y:0},{zoom:1,x:0,y:0}],p=serializeProject(DEFAULTS,images,crops);assert.equal(readProject(p).parameters.pitch,5);assert.throws(()=>readProject({...p,crops:[{zoom:5,x:0,y:0},crops[1]]}));assert.throws(()=>derive({pitch:NaN}));
});
