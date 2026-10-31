import {clamp} from '../model.mjs';
// Measured v04 hardware, millimeters. The demo insert is 27 × 20 mm;
// changing its cut size does not scale the lens pitch or the encoded bands.
export const KEYCHAIN=Object.freeze({version:'v04',width:40,height:30,depth:5.4,count:8,pitch:3,lensMinX:-9,lensWidth:24,lensHeight:20,lensBottom:3.3,lensTop:5.4,radius:1.5,substrate:.6,airGap:.15,maskThickness:.3,ior:1.4,centerX:3,paperWidth:27,paperHeight:20,paperZ:3.15,travel:1.5,pixelsPerMm:40});
export const carrierOffset=phase=>(clamp(phase,0,1)-.5)*KEYCHAIN.travel;
// The right half of each carrier period is image 1; sliding the carrier right
// brings its left half (image 2) under the stationary clear aperture.
export function keychainSample(x,y){
  const q=(x-KEYCHAIN.lensMinX)/KEYCHAIN.pitch,cell=Math.floor(q),local=q-cell,band=Math.min(1,Math.floor(local*2));
  return {state:1-band,u:clamp((cell+local*2-band)/KEYCHAIN.count,0,1),v:clamp(.5-y/KEYCHAIN.lensHeight,0,1)};
}
// Normal-incidence and oblique rays through the actual cylindrical cap,
// 0.3 mm opaque mask channel, clear substrate, and glass-to-air exit.
// x is measured from one lens center. Null means masked or total reflection.
export function traceKeychainRay(x,angle=0){
  const {pitch,radius:r,substrate:h,airGap:gap,maskThickness:mask,ior:n}=KEYCHAIN;
  if(Math.abs(x)>=r||Math.abs(angle)>=90)return null;
  const nx=x/r,nz=Math.sqrt(1-nx*nx),a=angle*Math.PI/180,dx=Math.sin(a),dz=-Math.cos(a);
  const ci=-(dx*nx+dz*nz);if(ci<=0)return null;
  const k=1-(1-ci*ci)/(n*n);if(k<0)return null;
  const rx=dx/n+(ci/n-Math.sqrt(k))*nx,rz=dz/n+(ci/n-Math.sqrt(k))*nz;
  if(rz>=0)return null;
  const z=h+r*nz,top=x+(mask-z)*rx/rz,bottom=x-z*rx/rz;
  if(Math.abs(top)>pitch/4||Math.abs(bottom)>pitch/4)return null;
  const exitX=n*rx;if(Math.abs(exitX)>=1)return null;
  return {x:bottom+gap*exitX/Math.sqrt(1-exitX*exitX),weight:ci,maskTopX:top,maskBottomX:bottom};
}
export function previewCarrierX(x,phase){
  const cell=Math.floor((x-KEYCHAIN.lensMinX)/KEYCHAIN.pitch),center=KEYCHAIN.lensMinX+(cell+.5)*KEYCHAIN.pitch;
  const hit=traceKeychainRay(x-center);
  return hit?center+hit.x-carrierOffset(phase):null;
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
