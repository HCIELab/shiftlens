import {clamp} from '../model.mjs';
// Measured v03 CAD, millimeters. Keep this profile fixed to the printed hardware.
export const KEYCHAIN=Object.freeze({version:'v03',width:40,height:30,depth:7,count:8,pitch:3,lensMinX:-9,lensWidth:24,lensHeight:20,lensBottom:4,lensTop:7,centerX:3,paperWidth:26.5,paperHeight:21.2,paperZ:3.5,travel:1.5,pixelsPerMm:40});
export const carrierOffset=phase=>(clamp(phase,0,1)-.5)*KEYCHAIN.travel;
// The right half of each carrier period is image 1; sliding the carrier right
// brings its left half (image 2) under the stationary clear aperture.
export function keychainSample(x,y){
  const q=(x-KEYCHAIN.lensMinX)/KEYCHAIN.pitch,cell=Math.floor(q),local=q-cell,band=Math.min(1,Math.floor(local*2));
  return {state:1-band,u:clamp((cell+local*2-band)/KEYCHAIN.count,0,1),v:clamp(.5-y/KEYCHAIN.lensHeight,0,1)};
}
export function previewCarrierX(x,phase){
  const q=clamp((x-KEYCHAIN.lensMinX)/KEYCHAIN.pitch,0,KEYCHAIN.count-1e-7),cell=Math.floor(q),local=q-cell;
  return KEYCHAIN.lensMinX+cell*KEYCHAIN.pitch+KEYCHAIN.pitch/2+local*KEYCHAIN.pitch/2-clamp(phase,0,1)*KEYCHAIN.travel;
}
export function encodeKeychainRGBA(sources,width,height){
  if(sources.length!==2||sources.some(s=>s.data.length!==s.width*s.height*4))throw new Error('Two complete images are required.');
  const out=new Uint8ClampedArray(width*height*4),left=KEYCHAIN.centerX-KEYCHAIN.paperWidth/2;
  for(let x=0;x<width;x++)for(let y=0;y<height;y++){
    const s=keychainSample(left+(x+.5)/width*KEYCHAIN.paperWidth,(.5-(y+.5)/height)*KEYCHAIN.paperHeight),src=sources[s.state];
    const sx=clamp(Math.floor(s.u*src.width),0,src.width-1),sy=clamp(Math.floor(s.v*src.height),0,src.height-1),a=(sy*src.width+sx)*4,b=(y*width+x)*4;
    out[b]=src.data[a];out[b+1]=src.data[a+1];out[b+2]=src.data[a+2];out[b+3]=255;
  }
  return out;
}
