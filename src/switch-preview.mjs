import * as THREE from 'three';
import {NATIVE,nativeAt,sourcePartMesh} from './native-actuation.mjs';
import {frameMatrix,motionMatrix} from './actuation.mjs';

export class SwitchPreview extends THREE.Group{
  constructor(){super();this.name='mechanism-placement-preview';this.visible=false;this.type=null;this.material=new THREE.MeshBasicMaterial({color:'#25b46c',transparent:true,opacity:.5,depthWrite:false,depthTest:false,side:THREE.DoubleSide});}
  show(candidate,surface){
    const m=candidate.mechanism;
    // Refit the native knob shaft/flange for this lens height. Each candidate
    // uses the same source meshes and transforms as the generated assembly.
    const key=`${m.type}:${m.capLift??0}`;
    if(this.type!==key){
      for(const mesh of [...this.children]){mesh.geometry.dispose();this.remove(mesh);}
      for(const index of NATIVE[m.type].parts){const p=sourcePartMesh(index,m),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p.positions,3));g.setIndex(p.triangles);const mesh=new THREE.Mesh(g,this.material);mesh.userData.index=index;mesh.matrixAutoUpdate=false;mesh.renderOrder=30;this.add(mesh);}
      this.type=key;
    }
    for(const mesh of this.children){const index=mesh.userData.index;let matrix=nativeAt(surface,m,candidate.phase).matrix;
      if(index===46)matrix=frameMatrix(m.frame);
      if(index===45)matrix=new THREE.Matrix4().fromArray(motionMatrix(surface,m.travel*candidate.phase)).multiply(new THREE.Matrix4().fromArray(frameMatrix(m.upperFrame))).elements;
      if(index===72)matrix=new THREE.Matrix4().fromArray(motionMatrix(surface,m.travel*candidate.phase)).multiply(new THREE.Matrix4().fromArray(frameMatrix(m.frame))).elements;
      mesh.matrix.fromArray(matrix);mesh.matrixWorldNeedsUpdate=true;
    }
    this.material.color.set(candidate.valid?'#25b46c':'#ed4545');this.visible=true;
  }
  hide(){this.visible=false;}
  dispose(){this.traverse(child=>child.geometry?.dispose());this.material.dispose();}
}
