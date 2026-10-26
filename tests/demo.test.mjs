import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {KEYCHAIN as K,carrierOffset,keychainSample,previewCarrierX,encodeKeychainRGBA} from '../src/demo/keychain.mjs';
import {stickerPDF,pngWithPhysicalSize} from '../src/demo/print.mjs';
import {PhotoReceiver,CHUNK_SIZE,MAX_PHOTO_BYTES,sha256,parsePairing,pairingURL} from '../src/demo/protocol.mjs';
import {unzlibSync} from 'fflate';
const cad=JSON.parse(readFileSync(new URL('../src/assets/keychain-v03.json',import.meta.url)));
const bounds=p=>[0,1,2].map(a=>{const values=p.positions.filter((_,i)=>i%3===a);return [Math.min(...values),Math.max(...values)];});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('demo uses all 30 saved CAD regions, fixed physical dimensions, and no actuator',()=>{
 assert.equal(cad.parts.length,30);assert.equal(cad.units,'mm');assert.equal(cad.sourceSha256,'62a853c5190bd726c9f4239996836cb381c39ae7063f92fc106e416e3ef523fd');
 assert.deepEqual(bounds(cad.parts.find(p=>p.name==='TOP_CLEAR')),[[-9,15],[-10,10],[4,7]]);
 assert.deepEqual(bounds(cad.parts.find(p=>p.name==='TOP_FRAME_AND_RAILS')),[[-20,20],[-15,15],[0,5.5]]);
 assert.deepEqual(bounds(cad.parts.find(p=>p.name==='BOTTOM_IMAGE_CARRIER')),[[-18,18],[-12,12],[1.5,3.5]]);
 assert.ok(cad.parts.every(p=>!/(switch|knob|roller|actuator)/i.test(p.name)));
});
test('carrier and sticker travel 1.5 mm and stay under the lens at both endpoints',()=>{
 near(carrierOffset(1)-carrierOffset(0),1.5);
 for(const phase of [0,.5,1]){const left=K.centerX-K.paperWidth/2+carrierOffset(phase),right=left+K.paperWidth;assert.ok(left<K.lensMinX);assert.ok(right>K.lensMinX+K.lensWidth);}
 for(const p of cad.parts.filter(p=>p.name.startsWith('BOTTOM')||p.name.startsWith('BRAND')))near(p.normalizationX,.75);
});
test('preview decodes the correct image and source position across every lens at endpoints',()=>{
 for(const phase of [0,1])for(let i=0;i<8;i++)for(const local of [.01,.25,.5,.75,.99]){
  const x=K.lensMinX+(i+local)*K.pitch,s=keychainSample(previewCarrierX(x,phase),0);
  assert.equal(s.state,phase);near(s.u,(i+local)/8);near(s.v,.5);
 }
});
test('image bands register under actual center apertures at the CAD slide endpoints',()=>{
 for(let i=0;i<8;i++)for(const phase of [0,1]){const center=K.lensMinX+(i+.5)*K.pitch;const s=keychainSample(center-carrierOffset(phase),0);assert.equal(s.state,phase);near(s.u,(i+.5)/8);}
});
test('encoded raster has 1.5 mm alternating bands, bleed, and the right image orientation',()=>{
 const sources=[0,1].map(i=>({width:1,height:2,data:Uint8ClampedArray.from([i?0:255,i?255:0,0,255,i?0:255,i?255:0,127,255])}));
 const w=1060,h=848,out=encodeKeychainRGBA(sources,w,h);
 for(const x of [-7.5,-4.5,-1.5,1.5]){const px=Math.floor((x+10.25)*40);assert.equal(out[(424*w+px)*4],255);assert.equal(out[(424*w+px-60)*4+1],255);}
 assert.equal(out[2],0);assert.equal(out[(w*h-1)*4+2],127);assert.equal(out.length,w*h*4);
});
test('PDF embeds the exact RGB raster and an exact 26.5 x 21.2 mm page, no automatic scaling',()=>{
 const data=Uint8ClampedArray.from([255,0,1,255,0,255,2,255]),pdf=stickerPDF(data,2,1),s=Buffer.from(pdf).toString('latin1');
 const box=s.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);near(Number(box[1])*25.4/72,26.5);near(Number(box[2])*25.4/72,21.2);assert.match(s,/\/PrintScaling \/None/);assert.match(s,/\/Interpolate false/);
 const pos=s.indexOf('stream\n',s.indexOf('/Subtype /Image'))+7,end=s.indexOf('\nendstream',pos);
 assert.deepEqual([...unzlibSync(pdf.subarray(pos,end))],[255,0,1,0,255,2]);
 const xref=Number(s.match(/startxref\n(\d+)/)[1]);assert.equal(s.slice(xref,xref+4),'xref');
});
test('PNG density is 40 pixels/mm and replaces pre-existing density',()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUTcAAAAASUVORK5CYII=','base64');
 let out=pngWithPhysicalSize(png,1060,848);out=pngWithPhysicalSize(out,1060,848);let p=8,n=0;while(p<out.length){const d=new DataView(out.buffer,out.byteOffset+p),len=d.getUint32(0),type=Buffer.from(out.subarray(p+4,p+8)).toString();if(type==='pHYs'){n++;assert.equal(d.getUint32(8),40000);assert.equal(d.getUint32(12),40000);assert.equal(out[p+16],1);}p+=len+12;}assert.equal(n,1);
});
const manifest={type:'begin',id:'test',sizes:[3,2],hashes:['a'.repeat(64),'b'.repeat(64)]};
test('phone transfer accepts exactly two complete photos and checks sequence/length',()=>{
 const r=new PhotoReceiver();r.begin(manifest);assert.throws(()=>r.finish('test'));
 r.chunk({id:'test',slot:0,offset:0,bytes:new Uint8Array([1,2,3])});r.chunk({id:'test',slot:1,offset:0,bytes:new Uint8Array([4,5]).buffer});assert.deepEqual(r.finish('test').map(b=>[...b]),[[1,2,3],[4,5]]);
});
test('phone transfer rejects excess size, repeated/foreign chunks and incomplete images',()=>{
 const r=new PhotoReceiver();for(const sizes of [[1],[0,2],[1,MAX_PHOTO_BYTES+1],[Infinity,2]])assert.throws(()=>r.begin({...manifest,sizes}));r.begin(manifest);
 assert.throws(()=>r.chunk({id:'other',slot:0,offset:0,bytes:new Uint8Array(3)}));assert.throws(()=>r.chunk({id:'test',slot:0,offset:1,bytes:new Uint8Array(2)}));assert.throws(()=>r.chunk({id:'test',slot:2,offset:0,bytes:new Uint8Array(2)}));assert.throws(()=>r.chunk({id:'test',slot:0,offset:0,bytes:new Uint8Array(CHUNK_SIZE+1)}));
 r.chunk({id:'test',slot:0,offset:0,bytes:new Uint8Array(3)});assert.throws(()=>r.chunk({id:'test',slot:0,offset:0,bytes:new Uint8Array(3)}));r.reset();assert.throws(()=>r.finish('test'));
});
test('pair link stays under the GitHub project path and puts the secret in fragment only',()=>{
 const peer='sl-'+crypto.randomUUID(),token=crypto.randomUUID(),url=new URL(pairingURL('https://hcielab.github.io/shiftlens/demo/',peer,token));
 assert.equal(url.pathname,'/shiftlens/demo/upload.html');assert.equal(url.search,'');assert.deepEqual(parsePairing(url.hash),{peer,token});assert.throws(()=>parsePairing('#peer=bad&token=bad'));
});
test('integrity checksum detects corruption',async()=>{assert.notEqual(await sha256(new Uint8Array([1,2])),await sha256(new Uint8Array([1,3])));});
