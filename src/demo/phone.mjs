import './style.css';
import {wirePhotoCards,canvasBytes} from './photos.mjs';
import {parsePairing} from './protocol.mjs';
import {sendPhotos} from './transfer.mjs';
const $=id=>document.getElementById(id);let pair,connection,canvases=[null,null],connected=false,sending=false,sent=false;
const update=()=>{$('send').disabled=!connected||sending||sent||canvases.some(c=>!c);};
wirePhotoCards($('photos'),c=>{canvases=c;update();});$('photos').addEventListener('photoerror',e=>$('photo-error').textContent=e.detail);
function connect(){connection?.close();connected=false;sent=false;update();$('connection-status').textContent='Connecting to the demo device…';$('reconnect').hidden=true;connection=sendPhotos({...pair,onStatus:(message,ok)=>{$('connection-status').textContent=message;connected=ok;$('reconnect').hidden=ok;update();}});}
try{pair=parsePairing(location.hash);connect();}catch(error){$('connection-status').textContent=error.message;}
$('reconnect').onclick=()=>{if(pair)connect();};
$('send').onclick=async()=>{if(!connected||canvases.some(c=>!c))return;sending=true;update();$('photos').inert=true;$('progress').hidden=false;$('send-status').textContent='Preparing your photos…';try{const bytes=await Promise.all(canvases.map(canvasBytes));await connection.send(bytes,n=>{$('progress').value=n;$('send-status').textContent=`Sending photos… ${n}%`;});sent=true;$('send-status').textContent='Both photos arrived! Look at the demo device to slide and print your keychain.';$('send').textContent='Sent ✓';$('reconnect').hidden=true;connection.close();}catch(error){$('send-status').textContent=error.message;$('reconnect').hidden=false;}finally{sending=false;$('photos').inert=sent;update();}};
window.addEventListener('pagehide',()=>connection?.close());
