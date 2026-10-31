import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {KEYCHAIN as K,carrierOffset,keychainSample,previewCarrierX,traceKeychainRay,encodeKeychainRGBA} from '../src/demo/keychain.mjs';
import {stickerPDF,pngWithPhysicalSize,stickerSheetRGBA,STICKER_SHEET} from '../src/demo/print.mjs';
import {PhotoReceiver,CHUNK_SIZE,MAX_PHOTO_BYTES,sha256,parsePairing,pairingURL} from '../src/demo/protocol.mjs';
import {unzlibSync} from 'fflate';
const cad=JSON.parse(readFileSync(new URL('../src/assets/keychain-v04.json',import.meta.url)));
const bounds=p=>[0,1,2].map(a=>{const values=p.positions.filter((_,i)=>i%3===a);return [Math.min(...values),Math.max(...values)];});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('demo uses all 30 saved CAD regions, fixed physical dimensions, and no actuator',()=>{
 assert.equal(cad.parts.length,30);assert.equal(cad.units,'mm');assert.equal(cad.sourceSha256,'16e61298f58ce291148a12c9071e3da751d1115faf515740b335eadaccc23295');
 assert.deepEqual(bounds(cad.parts.find(p=>p.name==='TOP_CLEAR')),[[-9,15],[-10,10],[3.3,5.4]]);
 assert.deepEqual(bounds(cad.parts.find(p=>p.name==='TOP_FRAME_AND_RAILS')),[[-20,20],[-15,15],[0,3.9]]);
 assert.deepEqual(bounds(cad.parts.find(p=>p.name==='BOTTOM_IMAGE_CARRIER')),[[-18,18],[-12,12],[1.15,3.15]]);
 assert.ok(cad.parts.every(p=>!/(switch|knob|roller|actuator)/i.test(p.name)));
});
test('carrier and sticker travel 1.5 mm and stay under the lens at both endpoints',()=>{
 near(carrierOffset(1)-carrierOffset(0),1.5);
 for(const phase of [0,.5,1]){const left=K.centerX-K.paperWidth/2+carrierOffset(phase),right=left+K.paperWidth;assert.ok(left<K.lensMinX);assert.ok(right>K.lensMinX+K.lensWidth);}
 for(const p of cad.parts.filter(p=>p.name.startsWith('BOTTOM')||p.name.startsWith('BRAND')))near(p.normalizationX,.75);
});
test('two-interface rays stay inside the correct encoded state at both slide endpoints',()=>{
 let rays=0;
 for(const phase of [0,1])for(let i=0;i<8;i++)for(let j=0;j<100;j++){
  const x=K.lensMinX+(i+(j+.5)/100)*K.pitch,hit=previewCarrierX(x,phase);
  if(hit===null)continue;rays++;
  const s=keychainSample(hit,0);assert.equal(s.state,phase);assert.ok(s.u>=i/8&&s.u<=(i+1)/8);
 }
 assert.ok(rays>500);assert.equal(traceKeychainRay(1.49),null);
});
test('v04 normal-view footprint is about 40% of pitch, independently checked in Python',()=>{
 const hits=Array.from({length:20001},(_,i)=>traceKeychainRay(-1.5+(i+.5)*3/20001)).filter(Boolean).map(q=>q.x);
 const width=Math.max(...hits)-Math.min(...hits);
 assert.ok(Math.abs(width-1.1981)<.002);assert.ok(width/K.pitch>.39&&width/K.pitch<.41);
 near(K.substrate/K.pitch,.2);near(K.radius/K.pitch,.5);near(K.lensBottom-K.paperZ,K.airGap);
 // Two-interface refraction and finite mask channel alter the mapping: center
 // stays centered; outer surface rays are blocked rather than stretched to fit.
 near(traceKeychainRay(0).x,0);assert.equal(traceKeychainRay(1.4),null);
});
test('image bands register under actual center apertures at the CAD slide endpoints',()=>{
 for(let i=0;i<8;i++)for(const phase of [0,1]){const center=K.lensMinX+(i+.5)*K.pitch;const s=keychainSample(center-carrierOffset(phase),0);assert.equal(s.state,phase);near(s.u,(i+.5)/8);}
});
test('encoded raster has 1.5 mm alternating bands, bleed, and the right image orientation',()=>{
 const sources=[0,1].map(i=>({width:1,height:2,data:Uint8ClampedArray.from([i?0:255,i?255:0,0,255,i?0:255,i?255:0,127,255])}));
 const w=1080,h=800,out=encodeKeychainRGBA(sources,w,h);
 for(const x of [-7.5,-4.5,-1.5,1.5]){const px=Math.floor((x+10.5)*40);assert.equal(out[(400*w+px)*4],255);assert.equal(out[(400*w+px-60)*4+1],255);}
 assert.equal(out[2],0);assert.equal(out[(w*h-1)*4+2],127);assert.equal(out.length,w*h*4);
});
test('PDF embeds the exact RGB raster and an exact 27 x 20 mm page, no automatic scaling',()=>{
 const data=Uint8ClampedArray.from([255,0,1,255,0,255,2,255]),pdf=stickerPDF(data,2,1),s=Buffer.from(pdf).toString('latin1');
 const box=s.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);near(Number(box[1])*25.4/72,27);near(Number(box[2])*25.4/72,20);assert.match(s,/\/PrintScaling \/None/);assert.match(s,/\/Interpolate false/);
 const pos=s.indexOf('stream\n',s.indexOf('/Subtype /Image'))+7,end=s.indexOf('\nendstream',pos);
 assert.deepEqual([...unzlibSync(pdf.subarray(pos,end))],[255,0,1,0,255,2]);
 const xref=Number(s.match(/startxref\n(\d+)/)[1]);assert.equal(s.slice(xref,xref+4),'xref');
});
test('PNG density is 40 pixels/mm and replaces pre-existing density',()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUTcAAAAASUVORK5CYII=','base64');
 let out=pngWithPhysicalSize(png,1080,800);out=pngWithPhysicalSize(out,1080,800);let p=8,n=0;while(p<out.length){const d=new DataView(out.buffer,out.byteOffset+p),len=d.getUint32(0),type=Buffer.from(out.subarray(p+4,p+8)).toString();if(type==='pHYs'){n++;assert.equal(d.getUint32(8),40000);assert.equal(d.getUint32(12),40000);assert.equal(out[p+16],1);}p+=len+12;}assert.equal(n,1);
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

test('sheet places the unchanged 27 × 20 mm raster at a 3 mm top-left margin',()=>{
 const w=1080,h=800,pixels=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;pixels.set([x%251,y%251,(x+y)%251,255],i);}
 const sheet=stickerSheetRGBA(pixels,w,h);assert.equal(sheet.width,2032);assert.equal(sheet.height,3048);
 for(let y=0;y<h;y++)assert.deepEqual(sheet.data.subarray(((y+120)*2032+120)*4,((y+120)*2032+120+w)*4),pixels.subarray(y*w*4,(y+1)*w*4));
 for(let y=0;y<sheet.height;y++)for(let x=0;x<sheet.width;x++)if(y<120||y>=920||x<120||x>=1200){const i=(y*sheet.width+x)*4;assert.equal(sheet.data[i],255);assert.equal(sheet.data[i+1],255);assert.equal(sheet.data[i+2],255);assert.equal(sheet.data[i+3],255);}
 assert.throws(()=>stickerSheetRGBA(pixels,1060,848));
});
test('sheet PNG density and PDF placement preserve 2 × 3 inch stock and 27 × 20 mm insert',()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUTcAAAAASUVORK5CYII=','base64');
 const out=pngWithPhysicalSize(png,2032,3048,STICKER_SHEET.width,STICKER_SHEET.height);let p=8,found=false;
 while(p<out.length){const d=new DataView(out.buffer,out.byteOffset+p),n=d.getUint32(0);if(Buffer.from(out.subarray(p+4,p+8)).toString()==='pHYs'){found=true;assert.equal(d.getUint32(8),40000);assert.equal(d.getUint32(12),40000);}p+=n+12;}assert.ok(found);
 const pdf=stickerPDF(Uint8ClampedArray.from([123,45,67,255]),1,1,{sheet:true}),text=Buffer.from(pdf).toString('latin1');
 const box=text.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);near(+box[1],144);near(+box[2],216);
 const transform=text.match(/([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/).slice(1).map(Number);
 near(transform[0]*25.4/72,27);near(transform[1]*25.4/72,20);near(transform[2]*25.4/72,3);near((216-transform[3]-transform[1])*25.4/72,3);
 const pos=text.indexOf('stream\n',text.indexOf('/Subtype /Image'))+7,end=text.indexOf('\nendstream',pos);assert.deepEqual([...unzlibSync(pdf.subarray(pos,end))],[123,45,67]);
});
