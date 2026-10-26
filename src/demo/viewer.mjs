import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
import {makeGlass} from '../glass.mjs';
import cad from '../assets/keychain-v04.json';
import {KEYCHAIN as K,carrierOffset} from './keychain.mjs';
const selection=`
uniform sampler2D encoded;
uniform mat4 worldToAssembly;
uniform float phase,lensIor,encodedWidth;
bool selectedImage(vec3 p,vec3 n,vec3 view,out vec3 color){
  if(p.x<${K.lensMinX}.||p.x>${K.lensMinX+K.lensWidth}.||abs(p.y)>${K.lensHeight/2}.||p.z<${K.lensBottom+K.substrate-.001}||n.z<.04)return false;
  color=vec3(.009);
  float cell=floor(clamp((p.x-(${K.lensMinX}.))/${K.pitch}.,0.,${K.count}.-.00001));
  float center=${K.lensMinX}.+(cell+.5)*${K.pitch}.;
  vec3 inside=refract(-view,n,1./lensIor);
  if(inside.z>=-.0001)return true;
  vec3 maskTop=p+inside*((${K.lensBottom+K.maskThickness}-p.z)/inside.z);
  vec3 bottom=p+inside*((${K.lensBottom}-p.z)/inside.z);
  float edge=max(abs(maskTop.x-center),abs(bottom.x-center));
  float aa=max(fwidth(edge),.002);
  float visible=1.-smoothstep(${K.pitch/4}-aa,${K.pitch/4}+aa,edge);
  if(visible<=0.)return true;
  vec3 exiting=refract(inside,vec3(0.,0.,1.),lensIor);
  if(exiting.z>=-.0001||length(exiting)<.001)return true;
  vec3 hit=bottom+exiting*((${K.paperZ}-bottom.z)/exiting.z);
  float x=hit.x-(phase-.5)*${K.travel};
  vec2 uv=vec2((x-(${K.centerX-K.paperWidth/2}))/${K.paperWidth},(hit.y+${K.paperHeight/2})/${K.paperHeight});
  if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.)return true;
  color=mix(color,texture2D(encoded,uv).rgb,visible);
  return true;
}
`;
export class KeychainViewer{
  constructor(host,onPhase){
    this.phase=0;this.host=host;this.onPhase=onPhase;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#e9edf1');
    this.camera=new THREE.PerspectiveCamera(32,1,.1,600);this.camera.up.set(0,1,0);
    this.renderer=new THREE.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NeutralToneMapping;this.renderer.transmissionResolutionScale=.5;host.append(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.minDistance=35;this.controls.maxDistance=250;this.controls.target.set(0,0,3);
    const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(this.renderer);this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;room.dispose();pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xffffff,0xb4bfba,.7));const light=new THREE.DirectionalLight(0xffffff,1.8);light.position.set(-40,10,80);this.scene.add(light);
    this.root=new THREE.Group();this.carrier=new THREE.Group();this.scene.add(this.root);this.root.add(this.carrier);
    this.glass=makeGlass({imagePreview:true,selectionGLSL:selection,cacheKey:'shiftlens-keychain-v04'});this.glass.ior=1.4;this.glass.uniforms.lensIor.value=1.4;this.glass.thickness=K.radius+K.substrate;
    const materials={TOP_CLEAR:this.glass,TOP_FRAME_AND_RAILS:new THREE.MeshStandardMaterial({color:'#60aae3',roughness:.42}),BOTTOM_IMAGE_CARRIER:new THREE.MeshStandardMaterial({color:'#cfe9fa',roughness:.6}),TOP_BLACK_BLOCKERS:new THREE.MeshStandardMaterial({color:'#111111',roughness:.8}),BRAND_SHIFTLENS:new THREE.MeshStandardMaterial({color:'#a171ee'}),BRAND_UIST:new THREE.MeshStandardMaterial({color:'#cd7d74'}),BRAND_2026:new THREE.MeshStandardMaterial({color:'#3e80bf'})};
    for(const part of cad.parts){
      let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(part.positions,3));g.setIndex(part.indices);
      if(part.name==='TOP_CLEAR'){
        const n=part.positions.length/3;g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(n*2),2));g.setAttribute('surfaceHeight',new THREE.Float32BufferAttribute(Array.from({length:n},(_,i)=>part.positions[i*3+2]-K.lensBottom),1));
        g.setAttribute('surfaceNormal',new THREE.Float32BufferAttribute(Array.from({length:n*3},(_,i)=>i%3===2?1:0),3));g.setAttribute('surfaceTangent',new THREE.Float32BufferAttribute(Array.from({length:n*3},(_,i)=>i%3===0?1:0),3));g.setAttribute('surfacePitch',new THREE.Float32BufferAttribute(new Float32Array(n).fill(K.pitch),1));
      }
      const smooth=toCreasedNormals(g,Math.PI/5);g.dispose();g=smooth;
      const key=Object.keys(materials).find(k=>part.name===k||part.name.startsWith(k+'_')),mesh=new THREE.Mesh(g,materials[key]);mesh.name=part.name;
      (part.name.startsWith('BOTTOM')||part.name.startsWith('BRAND')?this.carrier:this.root).add(mesh);
    }
    this.paper=new THREE.Mesh(new THREE.PlaneGeometry(K.paperWidth,K.paperHeight),new THREE.MeshBasicMaterial({color:'white'}));this.paper.position.set(K.centerX,0,K.paperZ+.005);this.carrier.add(this.paper);
    this.ray=new THREE.Raycaster();this.plane=new THREE.Plane(new THREE.Vector3(0,0,1),-K.paperZ);const el=this.renderer.domElement;
    // Drag the actual model to slide; right-drag (or two-finger drag) orbits.
    el.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.pointer(e);if(!this.ray.intersectObjects(this.root.children,true).length)return;const p=new THREE.Vector3();if(!this.ray.ray.intersectPlane(this.plane,p))return;this.drag={x:p.x,phase:this.phase,id:e.pointerId};this.controls.enabled=false;el.setPointerCapture(e.pointerId);e.stopImmediatePropagation();e.preventDefault();},true);
    el.addEventListener('pointermove',e=>{if(!this.drag)return;this.pointer(e);const p=new THREE.Vector3();if(this.ray.ray.intersectPlane(this.plane,p))this.onPhase(Math.max(0,Math.min(1,this.drag.phase+(p.x-this.drag.x)/K.travel)));});
    const end=e=>{if(!this.drag)return;this.drag=null;this.controls.enabled=true;if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);};for(const name of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(name,end);
    this.controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;this.controls.touches.TWO=THREE.TOUCH.DOLLY_ROTATE;
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resize();this.fit();this.update(0);
    let last=performance.now();this.tick=()=>{};this.renderer.setAnimationLoop(time=>{const dt=Math.min(.1,(time-last)/1000);last=time;this.tick(dt);this.controls.update();this.root.updateMatrixWorld();this.glass.uniforms.worldToAssembly.value.copy(this.root.matrixWorld).invert();this.renderer.render(this.scene,this.camera);});
  }
  pointer(e){const r=this.renderer.domElement.getBoundingClientRect();this.ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);}
  resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  fit(){const distance=Math.max(80,26/(Math.tan(this.camera.fov*Math.PI/360)*this.camera.aspect));this.controls.target.set(0,0,3);this.camera.position.set(0,-distance*.24,distance);this.controls.update();}
  update(phase){this.phase=phase;this.carrier.position.x=carrierOffset(phase);this.glass.uniforms.phase.value=phase;}
  setTexture(canvas){this.texture?.dispose();this.texture=new THREE.CanvasTexture(canvas);this.texture.colorSpace=THREE.SRGBColorSpace;this.texture.minFilter=THREE.LinearFilter;this.texture.magFilter=THREE.LinearFilter;this.texture.generateMipmaps=false;this.paper.material.map=this.texture;this.paper.material.needsUpdate=true;this.glass.uniforms.encoded.value=this.texture;this.glass.uniforms.encodedWidth.value=canvas.width;}
}
