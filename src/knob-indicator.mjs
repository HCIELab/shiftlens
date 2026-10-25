import * as THREE from 'three';
import {nativePart} from './native-actuation.mjs';

const capTop = Math.max(...nativePart(77).positions.filter((_,i)=>i%3===2));

// Paint the existing cap surface in its local coordinates. The actor's normal
// CAD transform carries the line through rotation, translation and capLift.
// No overlay geometry, new picking target, or motion correction is needed.
export function makeActuatorMaterial(){
  const material=new THREE.MeshStandardMaterial({color:'#34383b',roughness:.52});
  material.userData.knobIndicator={enabled:{value:0},top:{value:capTop},color:{value:new THREE.Color('#f2e9ce')}};
  material.onBeforeCompile=shader=>{
    const u=material.userData.knobIndicator;
    Object.assign(shader.uniforms,{knobIndicatorEnabled:u.enabled,knobCapTop:u.top,knobIndicatorColor:u.color});
    shader.vertexShader='varying vec3 knobLocalPoint;varying vec3 knobLocalNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nknobLocalPoint=position;knobLocalNormal=normal;');
    shader.fragmentShader='varying vec3 knobLocalPoint;varying vec3 knobLocalNormal;uniform float knobIndicatorEnabled;uniform float knobCapTop;uniform vec3 knobIndicatorColor;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float indicatorDistance=length(vec2(knobLocalPoint.x-clamp(knobLocalPoint.x,.6,4.05),knobLocalPoint.y));
      float indicatorAA=max(fwidth(indicatorDistance),.025);
      float indicatorLine=1.-smoothstep(.4-indicatorAA,.4+indicatorAA,indicatorDistance);
      float indicatorCap=smoothstep(knobCapTop-3.8,knobCapTop-3.5,knobLocalPoint.z)*smoothstep(.35,.55,normalize(knobLocalNormal).z);
      diffuseColor.rgb=mix(diffuseColor.rgb,knobIndicatorColor,knobIndicatorEnabled*indicatorCap*indicatorLine);
    `);
  };
  material.customProgramCacheKey=()=> 'shiftlens-knob-cap-indicator-v1';
  return material;
}

export function setKnobIndicator(material,mechanism){
  const u=material.userData.knobIndicator;
  u.enabled.value=mechanism?.type==='knob'?1:0;
  u.top.value=capTop+(mechanism?.capLift??0);
}
