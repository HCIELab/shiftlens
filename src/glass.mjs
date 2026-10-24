import * as THREE from 'three';
import {apertureGLSL} from './preview.mjs';

// Use the standard physical material's Fresnel/IBL/specular implementation.
// Only the light received THROUGH the lens is replaced by the image-state
// reconstruction. The housing keeps Three's screen-space volume refraction.
// This avoids alpha sorting and does not require stochastic path tracing.
const selection = `
varying vec2 lensUv;
varying float lensHeight;
varying vec3 lensSurfaceNormal;varying vec3 lensTangent;varying float lensPitch;
uniform sampler2D encoded;
uniform mat4 worldToAssembly;
uniform float radius0,radius1,angle0,sweep,delta,rotation,paperZ,phase,lensCount,encodedWidth,lensTop,lensIor,stateCount;
uniform bool door,rayTrace,circularProfile;
${apertureGLSL}
bool selectedImage(vec3 p,vec3 n,vec3 view,out vec3 color){
  float r=length(p.xy),theta=atan(p.y,p.x);
  vec2 uv=door?vec2((theta-angle0-rotation)/sweep,(r-radius0)/(radius1-radius0)):vec2(lensUv.x*(1.+2./lensCount)-1./lensCount,lensUv.y);
  if(uv.x<0.||uv.x>1.||uv.y<.001||uv.y>.999)return false;
  if(door){if(n.z<.04||p.z<.001||p.z>lensTop+.1)return false;}
  else if(lensHeight<.001||lensHeight>lensTop+.1||dot(n,normalize(lensSurfaceNormal))<.04)return false;
  if(!rayTrace||!door){
    color=texture2D(encoded,vec2(apertureAddress(uv.x),uv.y)).rgb;
    // Trace one segment to the actual underside aperture. Its opaque bands
    // remain visible at steep lens edges; do not paint an image over the mask.
    vec3 inside=refract(-view,n,1./lensIor);
    float edge=0.;
    if(door){
      if(inside.z>=-.0001)edge=1.;
      else {vec3 hit=p+inside*(-p.z/inside.z);edge=abs(fract((atan(hit.y,hit.x)-angle0-rotation)/delta)-.5);}
    }else{
      vec3 ns=normalize(lensSurfaceNormal),ts=normalize(lensTangent);
      float dz=dot(inside,ns);
      if(dz>=-.0001)edge=1.;
      else {
        float x=(fract(uv.x*lensCount)-.5)*lensPitch;
        float hitX=x-lensHeight*dot(inside,ts)/dz;
        edge=abs(hitX)/max(lensPitch,.001);
      }
    }
    float aa=max(fwidth(edge),.003);
    float visible=1.-smoothstep(.5/stateCount-aa,.5/stateCount+aa,edge);
    color=mix(vec3(.009,.013,.012),color,visible);
    return true;
  }
  // Optional geometric two-interface ray. The ideal state reconstruction above
  // remains the default until lens and printer calibration have been measured.
  float local=(fract((theta-angle0-rotation)/delta)-.5)*delta;
  float g=sqrt(max(.0000001,pow(sin(delta*.5),2.)-pow(sin(local),2.)));
  vec2 radial=p.xy/r,tangent=vec2(-radial.y,radial.x);
  vec3 frontNormal=circularProfile?n:normalize(vec3(-g*radial+sin(local)*cos(local)/g*tangent,1.));
  vec3 inside=refract(-view,frontNormal,1./lensIor);
  color=vec3(.012);
  if(inside.z>=-.0001)return true;
  vec3 hit=p+inside*(-p.z/inside.z);
  if(abs(fract((atan(hit.y,hit.x)-angle0-rotation)/delta)-.5)>.5/stateCount)return true;
  vec3 exiting=refract(inside,vec3(0.,0.,1.),lensIor);
  if(length(exiting)<.01||exiting.z>=-.0001)return true;
  vec3 target=hit+exiting*(paperZ/exiting.z);
  uv=vec2((atan(target.y,target.x)-(angle0-delta))/(sweep+2.*delta),(length(target.xy)-radius0)/(radius1-radius0));
  if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.){color=vec3(.93);return true;}
  color=texture2D(encoded,uv).rgb;return true;
}
`;

export function makeGlass({imagePreview=false}={}) {
  const material=new THREE.MeshPhysicalMaterial({
    color:'#ffffff',metalness:0,roughness:.085,transmission:.9,opacity:1,
    transparent:false,ior:1.5,thickness:2,envMapIntensity:1,
    attenuationColor:'#f2f7f6',attenuationDistance:100,
    specularIntensity:1,side:THREE.FrontSide,
  });
  if(!imagePreview)return material;
  material.uniforms={encoded:{value:null},worldToAssembly:{value:new THREE.Matrix4()},radius0:{value:100},radius1:{value:170},angle0:{value:0},sweep:{value:1},delta:{value:.05},rotation:{value:0},lensIor:{value:1.5},paperZ:{value:-.53},phase:{value:0},door:{value:true},rayTrace:{value:false},circularProfile:{value:false},stateCount:{value:2},lensCount:{value:14},encodedWidth:{value:2048},lensTop:{value:6}};
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,material.uniforms);
    shader.vertexShader=`attribute float surfaceHeight;attribute vec3 surfaceNormal;attribute vec3 surfaceTangent;attribute float surfacePitch;varying vec2 lensUv;varying float lensHeight;varying vec3 lensSurfaceNormal;varying vec3 lensTangent;varying float lensPitch;\n`+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      lensUv=uv;lensHeight=surfaceHeight;
      lensSurfaceNormal=mat3(worldToAssembly*modelMatrix)*surfaceNormal;
      lensTangent=mat3(worldToAssembly*modelMatrix)*surfaceTangent;lensPitch=surfacePitch;`);
    // The uniform also appears in the vertex shader for the transformed local
    // surface normal (curves, flipped surfaces and arbitrary motion axes).
    shader.vertexShader='uniform mat4 worldToAssembly;\n'+shader.vertexShader;
    shader.fragmentShader=selection+shader.fragmentShader;
    const transmission=THREE.ShaderChunk.transmission_fragment.replace(
      'material.transmissionAlpha = mix(',
      `vec3 selected;
      vec3 assemblyPoint=(worldToAssembly*vec4(vWorldPosition,1.)).xyz;
      vec3 assemblyNormal=normalize(mat3(worldToAssembly)*n);
      vec3 assemblyView=normalize(mat3(worldToAssembly)*v);
      if(selectedImage(assemblyPoint,assemblyNormal,assemblyView,selected)){
        vec3 F=EnvironmentBRDF(n,v,material.specularColor,material.specularF90,material.roughness);
        transmitted=vec4((1.-F)*selected,1.);
      }
      material.transmissionAlpha = mix(`
    );
    shader.fragmentShader=shader.fragmentShader.replace('#include <transmission_fragment>',transmission);
  };
  material.customProgramCacheKey=()=> 'shiftlens-physical-transmission-v1';
  return material;
}
