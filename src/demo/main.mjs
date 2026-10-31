import './style.css';
import QRCode from 'qrcode';
import {KeychainViewer} from './viewer.mjs';
import {KEYCHAIN as K,encodeKeychainRGBA} from './keychain.mjs';
import {wirePhotoCards,placeholder} from './photos.mjs';
import {pngWithPhysicalSize,stickerPDF,stickerSheetRGBA,STICKER_SHEET} from './print.mjs';
import {download} from '../images.mjs';
import {pairingURL} from './protocol.mjs';
import {receivePhotos} from './transfer.mjs';
const $=id=>document.getElementById(id);let viewer,phase=0,playing=false,direction=1,ready=false,receiver,pairURL='',session=0,encodeFrame=0,encodeRevision=0,files={};
function setPhase(value){phase=value;viewer?.update(phase);$('slide').value=String(phase);$('phase-label').textContent=phase<.01?'Image 1':phase>.99?'Image 2':`${Math.round(phase*100)}% slide`;}
function pause(){playing=false;$('play').textContent='▶ Play';$('play').setAttribute('aria-label','Start sliding animation');}
try{viewer=new KeychainViewer($('canvas-host'),p=>{pause();setPhase(p);});viewer.tick=dt=>{if(!playing)return;let p=phase+direction*dt*.25;if(p>=1){p=1;direction=-1;}if(p<=0){p=0;direction=1;}setPhase(p);};}catch(error){$('model-error').hidden=false;$('model-error').textContent='3D preview is unavailable. Enable WebGL or try another browser. You can still upload and print.';}
const blanks=[placeholder(0),placeholder(1)];
const exportButtons=['download','download-png','download-sheet','download-sheet-pdf','share-png','share-sheet'];
const canShare=file=>{try{return !!file&&!!navigator.canShare?.({files:[file]});}catch{return false;}};
function resetExports(){files={};for(const id of exportButtons)$(id).disabled=true;for(const id of ['share-png','share-sheet'])$(id).hidden=true;}
async function pngFile(canvas,name,widthMm,heightMm){
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('Could not prepare the image. Try choosing the photos again.');
  const bytes=pngWithPhysicalSize(new Uint8Array(await blob.arrayBuffer()),canvas.width,canvas.height,widthMm,heightMm);
  return new File([bytes],name,{type:'image/png'});
}
function encode(canvases){
  ready=canvases.every(Boolean);const revision=++encodeRevision;resetExports();cancelAnimationFrame(encodeFrame);
  $('download-status').textContent=ready?'Preparing print files…':'';
  encodeFrame=requestAnimationFrame(async()=>{
    try{
      const sources=canvases.map((c,i)=>{c=c??blanks[i];return c.getContext('2d').getImageData(0,0,c.width,c.height);});
      const canvas=document.createElement('canvas');canvas.width=K.paperWidth*K.pixelsPerMm;canvas.height=K.paperHeight*K.pixelsPerMm;
      const pixels=encodeKeychainRGBA(sources,canvas.width,canvas.height);canvas.getContext('2d').putImageData(new ImageData(pixels,canvas.width,canvas.height),0,0);viewer?.setTexture(canvas);
      if(!ready)return;
      // Prepare before the tap: mobile file sharing requires user activation.
      const png=await pngFile(canvas,'ShiftLens-keychain-27x20mm.png',K.paperWidth,K.paperHeight);
      if(revision!==encodeRevision)return;
      const sheet=stickerSheetRGBA(pixels,canvas.width,canvas.height),sheetCanvas=document.createElement('canvas');sheetCanvas.width=sheet.width;sheetCanvas.height=sheet.height;
      sheetCanvas.getContext('2d').putImageData(new ImageData(sheet.data,sheet.width,sheet.height),0,0);
      const sheetPng=await pngFile(sheetCanvas,'ShiftLens-sheet-2x3in.png',STICKER_SHEET.width,STICKER_SHEET.height);
      sheetCanvas.width=sheetCanvas.height=1;
      if(revision!==encodeRevision)return;
      files={png,sheet:sheetPng,pdf:new File([stickerPDF(pixels,canvas.width,canvas.height)],'ShiftLens-keychain-27x20mm.pdf',{type:'application/pdf'}),sheetPdf:new File([stickerPDF(pixels,canvas.width,canvas.height,{sheet:true})],'ShiftLens-sheet-2x3in.pdf',{type:'application/pdf'})};
      for(const id of exportButtons)$(id).disabled=false;
      $('share-png').hidden=!canShare(files.png);$('share-sheet').hidden=!canShare(files.sheet);
      $('download-status').textContent='Print files ready.';
    }catch(error){if(revision===encodeRevision){resetExports();$('download-status').textContent=error.message;}}
  });
}
const photos=wirePhotoCards($('photos'),encode);$('photos').addEventListener('photoerror',e=>$('photo-error').textContent=e.detail);encode([null,null]);
function pairing(){
  receiver?.close();const version=++session;pairURL='';$('qr').hidden=true;$('copy-link').disabled=$('show-qr').disabled=true;if($('qr-dialog').open)$('qr-dialog').close();$('pair-status').textContent='Connecting…';
  try{receiver=receivePhotos({onReady:async({peer,token})=>{if(version!==session)return;pairURL=pairingURL(new URL('./',location.href),peer,token);await QRCode.toCanvas($('qr'),pairURL,{width:512,margin:4,color:{dark:'#233d5cff',light:'#ffffffff'},errorCorrectionLevel:'M'});if(version!==session)return;$('qr').hidden=false;$('copy-link').disabled=$('show-qr').disabled=false;$('pair-status').textContent='Visitors scan to send two photos here. Keep this page open. QR lasts 15 minutes.';},onStatus:message=>{if(version===session)$('pair-status').textContent=message;},onPair:bytes=>photos.setPair(bytes,()=>version===session),onComplete:()=>{if(version===session){$('qr').hidden=true;$('copy-link').disabled=$('show-qr').disabled=true;if($('qr-dialog').open)$('qr-dialog').close();pause();setPhase(0);}}});}catch{$('pair-status').textContent='Phone pairing unavailable. Choose photos on this device.';}
}
$('new-qr').onclick=pairing;$('copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(pairURL);$('pair-status').textContent='Link copied. Open it on the visitor’s phone.';}catch{$('pair-status').textContent='Clipboard unavailable. Scan the QR code instead.';}};
$('next-visitor').onclick=()=>{photos.reset();pause();setPhase(0);$('photo-error').textContent='';pairing();};
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Ⅱ Pause':'▶ Play';$('play').setAttribute('aria-label',playing?'Pause sliding animation':'Start sliding animation');};
$('slide').oninput=e=>{pause();setPhase(Number(e.target.value));};for(const [id,p]of [['state-1',0],['state-2',1]])$(id).onclick=()=>{pause();setPhase(p);};$('reset-view').onclick=()=>viewer?.fit();
for(const [id,key,message] of [
  ['download-png','png','PNG ready: 27 × 20 mm. If your app ignores image sizing, enter these dimensions.'],
  ['download','pdf','PDF ready. Print at Actual size / 100%.'],
  ['download-sheet','sheet','Sheet PNG ready. Print the entire sheet on 2 × 3 inch stock, without cropping or borderless enlargement.'],
  ['download-sheet-pdf','sheetPdf','Sheet PDF ready. Select 2 × 3 inch paper and Actual size / 100%.']
])$(id).onclick=()=>{const file=files[key];if(!file)return;download(file.name,file,file.type);$('download-status').textContent=message;};
for(const [id,key] of [['share-png','png'],['share-sheet','sheet']])$(id).onclick=async()=>{
  const file=files[key];if(!canShare(file))return;
  try{await navigator.share({files:[file]});$('download-status').textContent='File handed to your chosen app.';}
  catch(error){if(error.name!=='AbortError')$('download-status').textContent='Sharing unavailable. Use the download button instead.';}
};
$('show-qr').onclick=()=>{if(!pairURL||$('qr').hidden)return;const canvas=$('qr-large');canvas.width=canvas.height=512;canvas.getContext('2d').drawImage($('qr'),0,0,512,512);$('qr-dialog').showModal();};
$('close-qr').onclick=()=>$('qr-dialog').close();
$('upload-link').onclick=e=>{e.preventDefault();$('show-qr').click();};
window.addEventListener('pagehide',()=>receiver?.close());
window.addEventListener('pageshow',event=>{if(event.persisted)pairing();});
pairing();
