import './style.css';
import QRCode from 'qrcode';
import {KeychainViewer} from './viewer.mjs';
import {KEYCHAIN as K,encodeKeychainRGBA} from './keychain.mjs';
import {wirePhotoCards,placeholder} from './photos.mjs';
import {pngWithPhysicalSize,stickerPDF} from './print.mjs';
import {download} from '../images.mjs';
import {pairingURL} from './protocol.mjs';
import {receivePhotos} from './transfer.mjs';
const $=id=>document.getElementById(id);let viewer,phase=0,playing=false,direction=1,encoded,rgba,ready=false,receiver,pairURL='',session=0,encodeFrame=0;
function setPhase(value){phase=value;viewer?.update(phase);$('slide').value=String(phase);$('phase-label').textContent=phase<.01?'Image 1':phase>.99?'Image 2':`${Math.round(phase*100)}% slide`;}
function pause(){playing=false;$('play').textContent='▶ Play';$('play').setAttribute('aria-label','Start sliding animation');}
try{viewer=new KeychainViewer($('canvas-host'),p=>{pause();setPhase(p);});viewer.tick=dt=>{if(!playing)return;let p=phase+direction*dt*.25;if(p>=1){p=1;direction=-1;}if(p<=0){p=0;direction=1;}setPhase(p);};}catch(error){$('model-error').hidden=false;$('model-error').textContent='3D preview is unavailable. Enable WebGL or try another browser. You can still upload and print.';}
const blanks=[placeholder(0),placeholder(1)];
function encode(canvases){ready=canvases.every(Boolean);$('download').disabled=$('download-png').disabled=true;cancelAnimationFrame(encodeFrame);encodeFrame=requestAnimationFrame(()=>{const sources=canvases.map((c,i)=>{c=c??blanks[i];return c.getContext('2d').getImageData(0,0,c.width,c.height);});encoded=document.createElement('canvas');encoded.width=K.paperWidth*K.pixelsPerMm;encoded.height=K.paperHeight*K.pixelsPerMm;rgba=encodeKeychainRGBA(sources,encoded.width,encoded.height);encoded.getContext('2d').putImageData(new ImageData(rgba,encoded.width,encoded.height),0,0);viewer?.setTexture(encoded);$('download').disabled=$('download-png').disabled=!ready;$('download-status').textContent='';});}
const photos=wirePhotoCards($('photos'),encode);$('photos').addEventListener('photoerror',e=>$('photo-error').textContent=e.detail);encode([null,null]);
function pairing(){
  receiver?.close();const version=++session;pairURL='';$('upload-link').removeAttribute('href');$('qr').hidden=true;$('copy-link').disabled=true;$('pair-status').textContent='Connecting…';
  try{receiver=receivePhotos({onReady:async({peer,token})=>{if(version!==session)return;pairURL=pairingURL(new URL('./',location.href),peer,token);$('upload-link').href=pairURL;await QRCode.toCanvas($('qr'),pairURL,{width:224,margin:2,color:{dark:'#233d5cff',light:'#ffffffff'},errorCorrectionLevel:'M'});if(version!==session)return;$('qr').hidden=false;$('copy-link').disabled=false;$('pair-status').textContent='Scan to open your photo gallery. This QR code lasts 15 minutes.';},onStatus:message=>{if(version===session)$('pair-status').textContent=message;},onPair:bytes=>photos.setPair(bytes,()=>version===session),onComplete:()=>{if(version===session){$('qr').hidden=true;$('copy-link').disabled=true;pause();setPhase(0);}}});}catch{$('pair-status').textContent='Phone pairing unavailable. Choose photos on this laptop.';}
}
$('new-qr').onclick=pairing;$('copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(pairURL);$('pair-status').textContent='Link copied. Open it on your phone.';}catch{$('pair-status').textContent='Clipboard unavailable. Scan the QR code instead.';}};
$('next-visitor').onclick=()=>{photos.reset();pause();setPhase(0);$('photo-error').textContent='';pairing();};
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Ⅱ Pause':'▶ Play';$('play').setAttribute('aria-label',playing?'Pause sliding animation':'Start sliding animation');};
$('slide').oninput=e=>{pause();setPhase(Number(e.target.value));};for(const [id,p]of [['state-1',0],['state-2',1]])$(id).onclick=()=>{pause();setPhase(p);};$('reset-view').onclick=()=>viewer?.fit();
$('download').onclick=()=>{if(!ready)return;download('ShiftLens-keychain-26.5x21.2mm.pdf',stickerPDF(rgba,encoded.width,encoded.height),'application/pdf');$('download-status').textContent='PDF ready. Print at Actual size; do not fill the paper.';};
$('download-png').onclick=async()=>{if(!ready)return;const blob=await new Promise(r=>encoded.toBlob(r,'image/png'));download('ShiftLens-keychain-26.5x21.2mm.png',pngWithPhysicalSize(new Uint8Array(await blob.arrayBuffer()),encoded.width,encoded.height),'image/png');$('download-status').textContent='PNG includes physical-size metadata. If your print app ignores it, use the PDF or enter 26.5 × 21.2 mm.';};
window.addEventListener('pagehide',()=>receiver?.close());pairing();
