import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {DEG} from './model.mjs';
import {frameAt, projectSurfaceUV} from './surface.mjs';
import {frameMatrix} from './actuation.mjs';
import {makeGlass} from './glass.mjs';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
import {SwitchPreview} from './switch-preview.mjs';
import {switchPlacement} from './switch-placement.mjs';
import {partMatrix,nativeAt,slideFraction} from './native-actuation.mjs';

export class Viewer{
  constructor(host,onPlace,onHover,onActuate){
    this.host=host;this.onActuate=onActuate;this.onPlace=onPlace;this.onHover=onHover;this.phase=0;this.exploded=false;this.mode='assembly';this.visible={};this.previewFramed=false;this.rayTrace=false;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#e6e7e9');
    this.camera=new THREE.PerspectiveCamera(34,1,.1,3000);this.camera.up.set(0,0,1);this.camera.position.set(0,-140,250);
    this.renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:false});this.renderer.transmissionResolutionScale=.5;this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NeutralToneMapping;this.renderer.toneMappingExposure=1;this.renderer.shadowMap.enabled=false;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.append(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.maxPolarAngle=Math.PI*.48;this.controls.minDistance=30;this.controls.maxDistance=900;
    const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(this.renderer);this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;room.dispose();pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xffffff,0xb4bfba,.7));const light=new THREE.DirectionalLight(0xffffff,1.8);light.position.set(-80,-100,220);light.castShadow=false;light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-250;light.shadow.camera.right=250;light.shadow.camera.top=250;light.shadow.camera.bottom=-250;light.shadow.normalBias=.15;this.scene.add(light);
    this.root=new THREE.Group();this.root.rotation.z=Math.PI/2;this.scene.add(this.root);this.raycaster=new THREE.Raycaster();
    this.switchPreview=new SwitchPreview();this.root.add(this.switchPreview);
    this.materials={body:new THREE.MeshStandardMaterial({color:'#dce5dd',roughness:.65}),mask:new THREE.MeshStandardMaterial({color:'#253c32',roughness:.7}),actuator:new THREE.MeshStandardMaterial({color:'#34383b',roughness:.52}),assembly:makeGlass()};
    this.optical=makeGlass({imagePreview:true});
    new ResizeObserver(()=>this.resize()).observe(host);
    this.renderer.domElement.addEventListener('pointerdown',e=>this.beginActuation(e),true);
    this.renderer.domElement.addEventListener('pointermove',e=>{if(this.actuatorDrag)this.dragActuation(e);else this.pick(e,false);});
    for(const name of ['pointerup','pointercancel'])this.renderer.domElement.addEventListener(name,e=>this.endActuation(e));this.renderer.domElement.addEventListener('pointerdown',e=>{if(e.button===0)this.pick(e,true);});
    this.renderer.domElement.addEventListener('pointerleave',()=>{if(this.placing){this.switchPreview.hide();this.onHover?.({valid:false,message:'Move over the lens to preview the mechanism. Esc to cancel.'});}});
    this.lastTime=performance.now();this.tick=()=>{};
    this.renderer.setAnimationLoop(time=>{const dt=Math.min(.1,(time-this.lastTime)/1000);this.lastTime=time;this.tick(dt);this.controls.update();const near=Math.max(.1,this.camera.position.distanceTo(this.controls.target)/200);if(Math.abs(this.camera.near-near)>.01){this.camera.near=near;this.camera.updateProjectionMatrix();}this.root.updateMatrixWorld(true);this.optical.uniforms.worldToAssembly.value.copy(this.root.matrixWorld).invert();this.renderer.render(this.scene,this.camera);});
  }
  clear(){
    this.setPlacement(false);
    for(const mesh of this.meshes??[]){this.root.remove(mesh);mesh.geometry.dispose();}
    if(this.pattern){this.root.remove(this.pattern);this.pattern.geometry.dispose();this.pattern.material.dispose();this.pattern=null;}
    this.meshes=[];this.assembly=null;this.hasFit=false;this.previewFramed=false;this.setRayTrace(false);this.visible={};this.root.position.set(0,0,0);this.exploded=false;
  }
  resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  geometry(part){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(part.positions,3));g.setIndex(new THREE.BufferAttribute(part.indices,1));if(part.uv)g.setAttribute('uv',new THREE.BufferAttribute(part.uv,2));else{const uv=new Float32Array(part.positions.length/3*2),d=this.assembly.derived;for(let i=0;i<part.positions.length/3;i++){const x=part.positions[i*3],y=part.positions[i*3+1];uv[i*2]=(Math.atan2(y,x)-(d.a0-d.delta))/(d.sweep+2*d.delta);uv[i*2+1]=(Math.hypot(x,y)-d.innerRadius)/(d.outerRadius-d.innerRadius);}g.setAttribute('uv',new THREE.BufferAttribute(uv,2));}if(part.surfaceHeight)g.setAttribute('surfaceHeight',new THREE.BufferAttribute(part.surfaceHeight,1));if(part.surfaceNormal)g.setAttribute('surfaceNormal',new THREE.BufferAttribute(part.surfaceNormal,3));if(part.surfaceTangent)g.setAttribute('surfaceTangent',new THREE.BufferAttribute(part.surfaceTangent,3));if(part.surfacePitch)g.setAttribute('surfacePitch',new THREE.BufferAttribute(part.surfacePitch,1));const smooth=toCreasedNormals(g,Math.PI/5);g.dispose();return smooth;}
  setAssembly(a,refit=false){this.assembly=a;this.placementPending=false;this.switchPreview.hide();if(refit)this.previewFramed=false;for(const mesh of this.meshes??[]){this.root.remove(mesh);mesh.geometry.dispose();}if(this.pattern){this.root.remove(this.pattern);this.pattern.geometry.dispose();this.pattern.material.dispose();}this.meshes=[];
    for(const part of a.parts){const mesh=new THREE.Mesh(this.geometry(part),part.material==='clear'?this.optical:this.materials[part.material]);mesh.name=part.id;mesh.userData=part;mesh.castShadow=false;mesh.receiveShadow=false;mesh.visible=this.visible[part.id]!==false&&!(this.placing&&part.id==='actuator');this.root.add(mesh);this.meshes.push(mesh);}
    const patternPart={positions:new Float32Array(a.patternMesh.positions),indices:new Uint32Array(a.patternMesh.triangles),uv:a.patternMesh.uv};this.pattern=new THREE.Mesh(this.geometry(patternPart),new THREE.MeshBasicMaterial({map:this.texture??null,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));this.root.add(this.pattern);
    if(a.mechanism?.paperCut){
      const hole=a.mechanism.paperCut,material=this.pattern.material;
      material.onBeforeCompile=shader=>{
        shader.uniforms.paperToCut={value:new THREE.Matrix4().fromArray(frameMatrix(hole.frame)).invert()};
        shader.uniforms.paperCutSize={value:new THREE.Vector2(hole.halfX,hole.halfY)};
        shader.vertexShader='uniform mat4 paperToCut;varying vec3 paperCutPoint;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n paperCutPoint=(paperToCut*vec4(position,1.)).xyz;');
        shader.fragmentShader='uniform vec2 paperCutSize;varying vec3 paperCutPoint;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\n if(abs(paperCutPoint.x)<paperCutSize.x&&abs(paperCutPoint.y)<paperCutSize.y)discard;');
      };
      material.customProgramCacheKey=()=>`paper-hole-${hole.halfX}-${hole.halfY}`;
    }

    this.update(this.phase);
    const bbox=new THREE.Box3();for(const mesh of this.meshes)bbox.expandByObject(mesh);const center=bbox.getCenter(new THREE.Vector3());this.root.position.sub(center);this.root.updateMatrixWorld(true);
    const u=this.optical.uniforms,d=a.derived;u.radius0.value=d.innerRadius;u.radius1.value=d.outerRadius;u.angle0.value=d.a0;u.sweep.value=d.sweep;u.delta.value=d.delta;u.lensIor.value=d.ior;this.optical.ior=d.ior;this.materials.assembly.ior=d.ior;this.optical.thickness=this.materials.assembly.thickness=d.substrate+d.maxPitch*.25;u.circularProfile.value=Boolean(d.opticalProfile);u.paperZ.value=d.paperZ;u.door.value=a.door;u.lensCount.value=d.count;u.stateCount.value=d.stateCount;u.lensTop.value=d.topMax;u.rayTrace.value=this.rayTrace&&a.door;
    this.update(this.phase);this.root.updateMatrixWorld(true);this.setMode(this.mode);if(refit||!this.hasFit){this.fit();this.hasFit=true;}
  }
  setTextures(encoded){if(this.texture)this.texture.dispose();this.texture=new THREE.CanvasTexture(encoded);this.texture.colorSpace=THREE.SRGBColorSpace;this.texture.minFilter=THREE.LinearFilter;this.texture.magFilter=THREE.LinearFilter;this.texture.generateMipmaps=false;this.optical.uniforms.encoded.value=this.texture;this.optical.uniforms.encodedWidth.value=encoded.width;
    if(this.pattern){this.pattern.material.map=this.texture;this.pattern.material.needsUpdate=true;}
  }
  update(phase){this.phase=phase;if(!this.assembly)return;const a=this.assembly,d=a.derived;if(this.pattern)this.pattern.position.z=this.exploded?-10:0;
    this.optical.uniforms.phase.value=phase;this.optical.uniforms.rotation.value=d.sweep*slideFraction(d)*phase;
    for(const mesh of this.meshes){
      mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(partMatrix(a,mesh.userData,phase));
      if(this.exploded)mesh.matrix.elements[14]+=mesh.userData.motion==='fixed'?-10:mesh.userData.motion==='native'?42:mesh.name==='mask'?12:27;
      mesh.matrixWorldNeedsUpdate=true;
    }
  }
  pointerRay(event){const rect=this.renderer.domElement.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),this.camera);}
  beginActuation(event){
    if(event.button!==0||this.placing||!this.assembly?.mechanism||this.exploded)return;
    this.pointerRay(event);this.root.updateMatrixWorld(true);
    const actor=this.meshes.find(m=>m.name==='actuator');if(!actor?.visible||!this.raycaster.intersectObject(actor).length)return;
    event.preventDefault();event.stopImmediatePropagation();this.controls.enabled=false;
    const m=this.assembly.mechanism,frame=new THREE.Matrix4().fromArray(partMatrix(this.assembly,{motion:'native'},this.phase));frame.premultiply(this.root.matrixWorld);
    const center=new THREE.Vector3(0,0,m.type==='knob'?9.5+m.capLift:0).applyMatrix4(frame),axis=new THREE.Vector3(m.type==='roller'?1:0,0,m.type==='roller'?0:1).transformDirection(frame);
    const x=new THREE.Vector3(m.type==='roller'?0:1,m.type==='roller'?1:0,0).transformDirection(frame),y=new THREE.Vector3().crossVectors(axis,x).normalize();
    const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(axis,center),hit=new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane,hit);const v=hit.sub(center),angle=Math.atan2(v.dot(y),v.dot(x));
    const canvasRect=this.renderer.domElement.getBoundingClientRect(),c2=center.clone().project(this.camera),end=center.clone().addScaledVector(new THREE.Vector3(0,1,0).transformDirection(frame),m.radius??3).project(this.camera);
    const tangent=new THREE.Vector2((end.x-c2.x)*canvasRect.width/2,-(end.y-c2.y)*canvasRect.height/2),radiusPx=Math.max(3,tangent.length());tangent.normalize();
    this.actuatorDrag={tangent,radiusPx,id:event.pointerId,phase:this.phase,startX:event.clientX,startY:event.clientY,plane,center,x,y,lastAngle:angle,angle:0};
    this.renderer.domElement.setPointerCapture(event.pointerId);this.renderer.domElement.style.cursor='grabbing';
  }
  dragActuation(event){
    const drag=this.actuatorDrag,m=this.assembly.mechanism;if(!drag||m.type==='switch')return;
    if(m.type==='roller'){const pixels=(event.clientX-drag.startX)*drag.tangent.x+(event.clientY-drag.startY)*drag.tangent.y;this.onActuate?.(Math.max(0,Math.min(1,drag.phase-pixels/(drag.radiusPx*m.spin))));return;}
    this.pointerRay(event);const hit=new THREE.Vector3();if(!this.raycaster.ray.intersectPlane(drag.plane,hit))return;
    const v=hit.sub(drag.center),angle=Math.atan2(v.dot(drag.y),v.dot(drag.x));let delta=angle-drag.lastAngle;delta=Math.atan2(Math.sin(delta),Math.cos(delta));drag.angle+=delta;drag.lastAngle=angle;
    this.onActuate?.(Math.max(0,Math.min(1,drag.phase+drag.angle/m.spin)));
  }
  endActuation(event){
    const drag=this.actuatorDrag;if(!drag||event.pointerId!==drag.id)return;
    if(this.assembly.mechanism.type==='switch'&&event.type==='pointerup'&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<8)this.onActuate?.(this.phase<.5?1:0);
    if(event.type==='pointerup'&&this.assembly.mechanism.type==='knob'&&this.assembly.derived.knobMode==='indexed'){const n=this.assembly.derived.stateCount;this.onActuate?.(Math.round(this.phase*(n-1))/(n-1));}
    this.actuatorDrag=null;this.controls.enabled=true;this.renderer.domElement.style.cursor='grab';
    if(this.renderer.domElement.hasPointerCapture(event.pointerId))this.renderer.domElement.releasePointerCapture(event.pointerId);
  }
  setCameraUp(up){
    if(this.camera.up.distanceToSquared(up)<1e-8)return;
    const target=this.controls.target.clone();
    this.controls.dispose();this.camera.up.copy(up);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;this.controls.minDistance=30;this.controls.maxDistance=1500;
    this.controls.maxPolarAngle=Math.PI-.02;this.controls.enableRotate=!this.placing;this.controls.target.copy(target);
  }
  bounds(){
    this.root.updateMatrixWorld(true);const box=new THREE.Box3();
    for(const mesh of this.meshes??[])if(mesh.visible)box.expandByObject(mesh);
    return box;
  }
  fitDistance(box,direction){
    const forward=direction.clone().normalize(),right=new THREE.Vector3().crossVectors(this.camera.up,forward).normalize(),up=new THREE.Vector3().crossVectors(forward,right).normalize();
    const center=box.getCenter(new THREE.Vector3()),tanV=Math.tan(this.camera.fov*Math.PI/360),tanH=tanV*this.camera.aspect;
    let distance=30;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      const p=new THREE.Vector3(x,y,z).sub(center);
      distance=Math.max(distance,p.dot(forward)+Math.max(Math.abs(p.dot(right))/tanH,Math.abs(p.dot(up))/tanV));
    }
    return distance*1.12;
  }
  fitPreview(front=false){
    if(!this.assembly)return;this.resize();this.update(this.phase);const box=this.bounds();if(box.isEmpty())return;
    const a=this.assembly,f=frameAt(a.surface,a.door?0:.5,.5),matrix=this.root.matrixWorld;
    const normal=new THREE.Vector3(...f.normal).transformDirection(matrix);
    const up=new THREE.Vector3(...f.across).transformDirection(matrix);
    const tangent=new THREE.Vector3(...f.tangent).transformDirection(matrix);
    this.setCameraUp(up);
    const center=box.getCenter(new THREE.Vector3()),direction=normal.clone();
    if(!front)direction.addScaledVector(up,-.28).addScaledVector(tangent,.04);
    this.controls.target.copy(center);this.camera.position.copy(center).addScaledVector(direction.normalize(),this.fitDistance(box,direction));
    this.controls.update();this.previewFramed=true;
  }
  fit(){
    if(this.mode==='appearance'){this.fitPreview();return;}
    if(!this.assembly)return;this.resize();this.update(this.phase);const box=this.bounds();if(box.isEmpty())return;
    this.setCameraUp(new THREE.Vector3(0,0,1));
    const center=box.getCenter(new THREE.Vector3()),direction=this.assembly.door?new THREE.Vector3(.12,-.65,1.8):new THREE.Vector3(1.2,-1.5,1.);
    this.controls.target.copy(center);this.camera.position.copy(center).addScaledVector(direction.normalize(),this.fitDistance(box,direction));this.controls.update();
  }
  top(){
    if(this.mode==='appearance'){this.fitPreview(true);return;}
    const center=this.controls.target.clone(),distance=this.camera.position.distanceTo(center);
    this.setCameraUp(new THREE.Vector3(0,1,0));this.camera.position.copy(center).add(new THREE.Vector3(0,0,distance));this.controls.update();
  }
  setRayTrace(enabled){this.rayTrace=enabled;this.optical.uniforms.rayTrace.value=enabled&&this.assembly?.door===true;}
  setMode(mode){
    this.mode=mode;
    for(const mesh of this.meshes??[])if(mesh.userData.material==='clear'){
      mesh.material=mode==='assembly'?this.materials.assembly:this.optical;
      mesh.castShadow=false;mesh.receiveShadow=false;
    }
    if(mode==='appearance'&&!this.previewFramed)this.fitPreview();
  }
  toggleLayer(id,visible){this.visible[id]=visible;const m=this.meshes?.find(m=>m.name===id);if(m)m.visible=visible;}
  setPlacement(enabled,{keepPreview=false,type=this.assembly?.derived.mechanismType}={}){
    this.placementType=type;
    this.placing=enabled;this.placementPending=!enabled&&keepPreview&&this.switchPreview.visible;
    this.controls.enableRotate=!enabled;
    if(!this.placementPending)this.switchPreview.hide();
    const rocker=this.meshes?.find(m=>m.name==='actuator');
    if(rocker)rocker.visible=this.visible.actuator!==false&&!enabled&&!this.placementPending;
    this.renderer.domElement.style.cursor=enabled?'crosshair':'grab';
  }
  pick(event,commit){
    if(!this.placing||!this.assembly)return;
    if(!this.pattern)return;
    const rect=this.renderer.domElement.getBoundingClientRect(),p=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    this.raycaster.setFromCamera(p,this.camera);
    // Pick the uncut, stationary design surface so an existing switch opening,
    // raised follower or lens ribs cannot make the ghost jump or disappear.
    this.root.updateMatrixWorld(true);
    const hits=this.raycaster.intersectObject(this.pattern);
    if(!hits.length){this.switchPreview.hide();this.onHover?.({valid:false,message:'Move over the lens to preview the mechanism. Esc to cancel.'});return;}
    const local=this.root.worldToLocal(hits[0].point.clone()),a=this.assembly;
    let point;
    if(a.door){
      const radius=Math.hypot(local.x,local.y),angle=Math.atan2(local.y,local.x);
      point={radius,angle:angle/DEG};
    }else{
      const seed=hits[0].uv?[hits[0].uv.x*(1+2/a.derived.count)-1/a.derived.count,hits[0].uv.y]:[.5,.5];
      const [u,v]=projectSurfaceUV(a.surface,local.toArray(),seed);
      point={u,v};
    }
    try{
      const candidate=switchPlacement(a,point,this.phase,this.placementType);
      this.switchPreview.show(candidate,a.surface);this.onHover?.(candidate);
      if(commit){if(candidate.valid)this.onPlace(point);else this.onHover?.(candidate,true);}
    }catch(error){this.switchPreview.hide();this.onHover?.({valid:false,message:error.message},commit);}
  }
}
