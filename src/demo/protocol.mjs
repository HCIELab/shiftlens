export const MAX_PHOTO_BYTES=6*1024*1024,CHUNK_SIZE=16*1024,SESSION_MS=15*60*1000;
export class PhotoReceiver{
  constructor(){this.reset();}
  reset(){this.id=null;this.buffers=null;this.offsets=[0,0];}
  begin(m){
    if(this.id)throw new Error('A transfer is already in progress.');
    if(typeof m.id!=='string'||!/^[-\w]{1,80}$/.test(m.id)||!Array.isArray(m.sizes)||m.sizes.length!==2||m.sizes.some(n=>!Number.isSafeInteger(n)||n<1||n>MAX_PHOTO_BYTES))throw new Error('Invalid photo sizes.');
    if(!Array.isArray(m.hashes)||m.hashes.length!==2||m.hashes.some(h=>typeof h!=='string'||!/^[a-f0-9]{64}$/.test(h)))throw new Error('Invalid photo checksums.');
    this.id=m.id;this.hashes=m.hashes;this.buffers=m.sizes.map(n=>new Uint8Array(n));this.offsets=[0,0];
  }
  chunk(m){
    if(!this.id||m.id!==this.id||![0,1].includes(m.slot)||!Number.isInteger(m.offset)||m.offset!==this.offsets[m.slot])throw new Error('Photo transfer is out of sequence.');
    if(!(m.bytes instanceof ArrayBuffer)&&!(m.bytes instanceof Uint8Array))throw new Error('Invalid photo data.');
    const bytes=new Uint8Array(m.bytes);if(bytes.length<1||bytes.length>CHUNK_SIZE||m.offset+bytes.length>this.buffers[m.slot].length)throw new Error('Photo chunk is too large.');
    this.buffers[m.slot].set(bytes,m.offset);this.offsets[m.slot]+=bytes.length;
  }
  finish(id){if(id!==this.id||!this.buffers||this.offsets.some((n,i)=>n!==this.buffers[i].length))throw new Error('Both photos must finish uploading.');return this.buffers;}
}
export const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export function pairingURL(base,peer,token){const u=new URL('upload.html',base);u.hash=new URLSearchParams({peer,token}).toString();return u.href;}
export function parsePairing(hash){const p=new URLSearchParams(hash.replace(/^#/,'')),peer=p.get('peer'),token=p.get('token');if(!/^sl-[a-f0-9-]{36}$/.test(peer??'')||!/^[a-f0-9-]{36}$/.test(token??''))throw new Error('Scan the QR code on the demo device to connect.');return {peer,token};}
