import {cropCanvas,loadImage} from '../images.mjs';
export const MAX_FILE_BYTES=20*1024*1024;
export async function readPhoto(file){
  if(!file||file.size>MAX_FILE_BYTES)throw new Error('Choose a photo smaller than 20 MB.');
  if(!/^image\//.test(file.type)&&!(/\.(heic|heif|jpe?g|png|webp|avif)$/i.test(file.name)))throw new Error('Choose a photo from your gallery.');
  const url=URL.createObjectURL(file);
  try{
    let image;try{image=await loadImage(url);}catch{throw new Error('This browser cannot open that photo. Choose a JPEG or PNG copy.');}
    if(image.width*image.height>60_000_000)throw new Error('Choose a photo under 60 megapixels.');
    // Normalize orientation and discard metadata before network transfer.
    const ratio=Math.min(1,1600/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    return await loadImage(canvas.toDataURL('image/jpeg',.96));
  }finally{URL.revokeObjectURL(url);}
}
export function photoCanvas(image,fit='cover'){return cropCanvas(image,{fit,zoom:1,x:0,y:0},1200,1000);}
export function placeholder(index){const c=document.createElement('canvas');c.width=1200;c.height=1000;const x=c.getContext('2d');x.fillStyle=index?'#ece6fc':'#dbeffa';x.fillRect(0,0,1200,1000);x.fillStyle=index?'#a48aca':'#75adce';x.beginPath();x.arc(index?820:380,500,260,0,Math.PI*2);x.fill();x.fillStyle='#ffffff';x.font='bold 240px Arial';x.textAlign='center';x.fillText(String(index+1),600,580);return c;}
export function canvasBytes(canvas){return new Promise((resolve,reject)=>canvas.toBlob(async b=>b?resolve(new Uint8Array(await b.arrayBuffer())):reject(new Error('Could not prepare the photo.')),'image/jpeg',.96));}
export function wirePhotoCards(container,onChange){
  const photos=[null,null],fits=['cover','cover'];let revisions=[0,0];
  container.innerHTML=[0,1].map(i=>`<article class="photo-card"><label class="photo-pick"><span class="photo-label">Image ${i+1}</span><img alt="Image ${i+1} crop" hidden><span class="empty-photo"><svg viewBox="0 0 24 24" width="27" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 6"/></svg><span>Choose photo</span></span><input type="file" accept="image/*" aria-label="Upload image ${i+1}"></label><label class="fit-option"><input type="checkbox" aria-label="Fit entire image ${i+1}"> Fit entire photo</label></article>`).join('');
  const cards=[...container.children];
  const render=i=>{const c=photos[i]?photoCanvas(photos[i],fits[i]):null,img=cards[i].querySelector('img');img.hidden=!c;if(c)img.src=c.toDataURL();else img.removeAttribute('src');cards[i].querySelector('.empty-photo').hidden=!!c;onChange(photos.map((p,j)=>p?photoCanvas(p,fits[j]):null));};
  cards.forEach((card,i)=>{
    card.querySelector('input[type=file]').addEventListener('change',async e=>{const file=e.target.files[0],revision=++revisions[i];if(!file)return;const input=e.target;input.disabled=true;try{const photo=await readPhoto(file);if(revision!==revisions[i])return;photos[i]=photo;render(i);container.dispatchEvent(new CustomEvent('photoerror',{detail:''}));}catch(error){container.dispatchEvent(new CustomEvent('photoerror',{detail:error.message}));}finally{input.disabled=false;input.value='';}});
    card.querySelector('input[type=checkbox]').addEventListener('change',e=>{fits[i]=e.target.checked?'contain':'cover';render(i);});
  });
  return {reset(){photos.fill(null);fits.fill('cover');revisions=revisions.map(r=>r+1);cards.forEach((card,i)=>{card.querySelector('input[type=checkbox]').checked=false;render(i);});},async setPair(bytes,isCurrent=()=>true){const decoded=await Promise.all(bytes.map(b=>readPhoto(new File([b],'photo.jpg',{type:'image/jpeg'}))));if(!isCurrent())return;decoded.forEach((p,i)=>{revisions[i]++;photos[i]=p;fits[i]='cover';cards[i].querySelector('input[type=checkbox]').checked=false;const img=cards[i].querySelector('img');img.src=photoCanvas(p).toDataURL();img.hidden=false;cards[i].querySelector('.empty-photo').hidden=true;});onChange(photos.map(p=>photoCanvas(p)));}};
}
