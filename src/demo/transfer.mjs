import Peer from 'peerjs';
import {PhotoReceiver,sha256,CHUNK_SIZE,SESSION_MS,MAX_PHOTO_BYTES} from './protocol.mjs';
// Use signaling only. Venue setups may provide their own PeerServer and ICE
// configuration at build time; no private, permanent TURN credentials in Git.
function peerOptions(){const result={debug:0,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'}]}};if(import.meta.env.VITE_DEMO_PEER_HOST)Object.assign(result,{host:import.meta.env.VITE_DEMO_PEER_HOST,port:Number(import.meta.env.VITE_DEMO_PEER_PORT||443),path:import.meta.env.VITE_DEMO_PEER_PATH||'/',secure:true});if(import.meta.env.VITE_DEMO_ICE_SERVERS)result.config.iceServers=JSON.parse(import.meta.env.VITE_DEMO_ICE_SERVERS);return result;}
const problem=()=> 'Phone connection unavailable. Try the same Wi-Fi or a hotspot, or choose photos on the demo device.';
export function receivePhotos({onReady,onStatus,onPair,onComplete}){
  const peer=new Peer('sl-'+crypto.randomUUID(),peerOptions()),token=crypto.randomUUID(),connections=new Set();let active=null,closed=false,accepted=false;
  const expiry=setTimeout(()=>{onStatus('QR code expired. Choose “New QR code” to reconnect.');close();},SESSION_MS);
  const readyTimeout=setTimeout(()=>onStatus(problem()),20000);
  peer.on('open',id=>{clearTimeout(readyTimeout);onReady({peer:id,token,expiresAt:Date.now()+SESSION_MS});});
  peer.on('error',()=>onStatus(problem()));peer.on('disconnected',()=>{if(!closed&&!accepted)onStatus('Connection interrupted. Choose “New QR code” to reconnect.');});
  peer.on('connection',conn=>{
    connections.add(conn);const receiver=new PhotoReceiver();let authorized=false,processing=false,chain=Promise.resolve();
    let idle=setTimeout(()=>conn.close(),15000);const touch=()=>{clearTimeout(idle);idle=setTimeout(()=>conn.close(),120000);};
    conn.on('close',()=>{clearTimeout(idle);connections.delete(conn);receiver.reset();if(active===conn&&!accepted){active=null;onStatus('Phone disconnected. Scan again, or choose photos here.');}});
    conn.on('error',()=>conn.close());
    conn.on('data',message=>{chain=chain.then(async()=>{
      if(closed)return;const m=message;
      if(!m||typeof m!=='object')throw new Error('Invalid transfer message.');
      if(!authorized){if(m.type!=='hello'||m.token!==token||accepted||(active&&active!==conn)){conn.send({type:'error',message:accepted?'This session already received photos. Ask the host for the next QR code.':'This QR code is unavailable. Ask the host for a new one.'});conn.close();return;}authorized=true;active=conn;touch();conn.send({type:'ready'});onStatus('Phone connected. Choose two photos on your phone.');return;}
      touch();if(processing||accepted)return;
      if(m.type==='begin'){receiver.begin(m);conn.send({type:'ack',id:m.id,step:'begin'});onStatus('Receiving two photos…');}
      else if(m.type==='chunk'){receiver.chunk(m);conn.send({type:'ack',id:m.id,slot:m.slot,offset:receiver.offsets[m.slot]});}
      else if(m.type==='finish'){
        processing=true;const buffers=receiver.finish(m.id),hashes=await Promise.all(buffers.map(sha256));if(hashes.some((h,i)=>h!==receiver.hashes[i]))throw new Error('Photo transfer was incomplete. Please send again.');
        await onPair(buffers);if(closed)return;accepted=true;clearTimeout(expiry);receiver.reset();conn.send({type:'complete',id:m.id});onStatus('Both photos received. Your keychain is ready to preview.');onComplete?.();
      }else throw new Error('Unknown transfer message.');
    }).catch(error=>{if(conn.open)conn.send({type:'error',message:error.message});receiver.reset();processing=false;onStatus('Photo transfer failed. Retry from your phone or upload here.');});});
  });
  function close(){closed=true;clearTimeout(expiry);clearTimeout(readyTimeout);for(const c of connections)c.close();peer.destroy();}
  return {close};
}
export function sendPhotos({peer:host,token,onStatus}){
  const peer=new Peer(undefined,peerOptions());let conn=null,waiter=null,ready=false,closed=false;
  const reject=error=>{if(waiter){clearTimeout(waiter.timer);waiter.reject(error);waiter=null;}};
  const timeout=setTimeout(()=>onStatus(problem(),false),25000);
  peer.on('error',()=>{ready=false;reject(new Error(problem()));onStatus(problem(),false);});
  peer.on('open',()=>{
    conn=peer.connect(host,{reliable:true,serialization:'binary'});
    conn.on('open',()=>conn.send({type:'hello',token}));
    conn.on('data',m=>{
      if(m?.type==='ready'){ready=true;clearTimeout(timeout);onStatus('Connected to the demo device.',true);}
      else if(m?.type==='error'){reject(new Error(m.message));onStatus(m.message,false);ready=false;}
      else if(waiter&&waiter.match(m)){clearTimeout(waiter.timer);waiter.resolve(m);waiter=null;}
    });
    conn.on('close',()=>{ready=false;reject(new Error('Connection closed. Scan the QR code again.'));if(!closed)onStatus('Connection closed. Scan the QR code again.',false);});
    conn.on('error',()=>{ready=false;reject(new Error(problem()));onStatus(problem(),false);});
  });
  const request=(message,match)=>new Promise((resolve,rejectPromise)=>{if(!ready||!conn?.open)return rejectPromise(new Error('Reconnect to the demo device before sending.'));const timer=setTimeout(()=>{waiter=null;rejectPromise(new Error('Transfer timed out. Retry or use the demo device upload.'));},30000);waiter={resolve,reject:rejectPromise,match,timer};conn.send(message);});
  return {async send(buffers,onProgress){
    if(buffers.length!==2||buffers.some(b=>b.length>MAX_PHOTO_BYTES))throw new Error('Choose two smaller photos.');
    const id=crypto.randomUUID(),hashes=await Promise.all(buffers.map(sha256)),total=buffers.reduce((n,b)=>n+b.length,0);let done=0;
    await request({type:'begin',id,sizes:buffers.map(b=>b.length),hashes},m=>m.type==='ack'&&m.id===id&&m.step==='begin');
    for(let slot=0;slot<2;slot++)for(let offset=0;offset<buffers[slot].length;offset+=CHUNK_SIZE){const bytes=buffers[slot].slice(offset,offset+CHUNK_SIZE);await request({type:'chunk',id,slot,offset,bytes:bytes.buffer},m=>m.type==='ack'&&m.id===id&&m.slot===slot&&m.offset===offset+bytes.length);done+=bytes.length;onProgress(Math.round(done/total*100));}
    await request({type:'finish',id},m=>m.type==='complete'&&m.id===id);
  },close(){closed=true;clearTimeout(timeout);reject(new Error('Connection closed.'));conn?.close();peer.destroy();}};
}
