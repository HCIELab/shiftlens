import {zlibSync,strToU8} from 'fflate';
import {KEYCHAIN as K} from './keychain.mjs';
// Portrait 2 × 3 inch stock. This is a blank margin, not scaled image bleed.
export const STICKER_SHEET=Object.freeze({width:50.8,height:76.2,left:3,top:3});
export function stickerSheetRGBA(rgba,width,height){
  const ppm=K.pixelsPerMm;
  if(width!==K.paperWidth*ppm||height!==K.paperHeight*ppm||rgba.length!==width*height*4)throw new Error('The sticker sheet requires the full-size encoded image.');
  const sheetWidth=Math.round(STICKER_SHEET.width*ppm),sheetHeight=Math.round(STICKER_SHEET.height*ppm),left=Math.round(STICKER_SHEET.left*ppm),top=Math.round(STICKER_SHEET.top*ppm);
  const data=new Uint8ClampedArray(sheetWidth*sheetHeight*4).fill(255);
  for(let y=0;y<height;y++)data.set(rgba.subarray(y*width*4,(y+1)*width*4),((top+y)*sheetWidth+left)*4);
  return {data,width:sheetWidth,height:sheetHeight};
}
const join=arrays=>{const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let i=0;for(const a of arrays){out.set(a,i);i+=a.length;}return out;};
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const out=new Uint8Array(12+data.length),v=new DataView(out.buffer);v.setUint32(0,data.length);out.set(strToU8(type),4);out.set(data,8);v.setUint32(8+data.length,crc32(out.subarray(4,8+data.length)));return out;}
export function pngWithPhysicalSize(png,width,height,physicalWidth=K.paperWidth,physicalHeight=K.paperHeight){
  const density=new Uint8Array(9),v=new DataView(density.buffer);v.setUint32(0,Math.round(width/(physicalWidth/1000)));v.setUint32(4,Math.round(height/(physicalHeight/1000)));density[8]=1;
  const chunks=[png.subarray(0,8)];let p=8;
  while(p<png.length){const n=new DataView(png.buffer,png.byteOffset+p,4).getUint32(0),type=String.fromCharCode(...png.subarray(p+4,p+8));if(type!=='pHYs')chunks.push(png.subarray(p,p+n+12));if(type==='IHDR')chunks.push(chunk('pHYs',density));p+=n+12;}
  return join(chunks);
}
// One sticker-sized PDF page, with the identical raster used by the viewport.
// PDF points define physical size independently of a PNG importer's DPI rules.
export function stickerPDF(rgba,width,height,{sheet=false}={}){
  const rgb=new Uint8Array(width*height*3);for(let i=0;i<width*height;i++)rgb.set(rgba.subarray(i*4,i*4+3),i*3);
  const pt=72/25.4,w=(sheet?STICKER_SHEET.width:K.paperWidth)*pt,h=(sheet?STICKER_SHEET.height:K.paperHeight)*pt;
  const imageWidth=K.paperWidth*pt,imageHeight=K.paperHeight*pt,left=sheet?STICKER_SHEET.left*pt:0,bottom=sheet?(STICKER_SHEET.height-STICKER_SHEET.top-K.paperHeight)*pt:0;
  const image=zlibSync(rgb),content=strToU8(`q\n${imageWidth} 0 0 ${imageHeight} ${left} ${bottom} cm\n/Im0 Do\nQ\n`);
  const stream=(head,data)=>join([strToU8(`${head} /Length ${data.length} >>\nstream\n`),data,strToU8('\nendstream')]);
  const objects=[strToU8('<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>'),strToU8('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),strToU8(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),stream(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Interpolate false`,image),stream('<<',content)];
  const pieces=[strToU8('%PDF-1.4\n%ShiftLens\n')],offsets=[0];let size=pieces[0].length;
  objects.forEach((obj,i)=>{offsets.push(size);const p=join([strToU8(`${i+1} 0 obj\n`),obj,strToU8('\nendobj\n')]);pieces.push(p);size+=p.length;});
  pieces.push(strToU8(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`));return join(pieces);
}
