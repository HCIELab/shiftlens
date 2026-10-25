import {evaluateAssembly} from './optical-section.mjs';
import {zipSync,strToU8} from 'fflate';
import {download} from './images.mjs';
import {frameCoordinates,framePoint} from './actuation.mjs';
import {partMatrix,transformPoint} from './native-actuation.mjs';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const dataBytes=data=>Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));
export function posedPositions(part,a,phase=0){const out=new Float32Array(part.positions),matrix=partMatrix(a,part,phase);for(let i=0;i<out.length;i+=3)out.set(transformPoint(matrix,out.subarray(i,i+3)),i);return out;}
// UVs refer to the SAME padded interleaved image as the viewport. Only the
// carrier's outward image face is textured; pockets, floors and walls keep
// their structural material. No extra, open paper mesh enters manufacturing.
export function carrierTextureUV(a,part){
 const uv=[],top=[];const d=a.derived;
 for(let i=0;i<part.positions.length/3;i++){
  const x=part.positions[i*3],y=part.positions[i*3+1];
  uv.push(part.uv?part.uv[i*2]:(Math.atan2(y,x)-d.a0+d.delta)/(d.sweep+2*d.delta),part.uv?part.uv[i*2+1]:(Math.hypot(x,y)-d.innerRadius)/(d.outerRadius-d.innerRadius));
 }
 if(part.id==='base')for(let i=0;i<part.indices.length;i+=3){
  const ids=Array.from(part.indices.subarray(i,i+3));
  // Generated image-face vertices lie on a sampled offset surface. The UV
  // inverse can incur a small interpolation error on a curved profile.
  if(ids.every(j=>Math.abs((part.surfaceHeight?part.surfaceHeight[j]:part.positions[j*3+2])-d.paperZ)<.025&&uv[j*2]>=1/(d.count+2)-1e-6&&uv[j*2]<=(d.count+1)/(d.count+2)+1e-6&&uv[j*2+1]>=-1e-6&&uv[j*2+1]<=1.000001))top.push(i/3);
 }
 return {uv,top};
}
export function manufacturing3MF(a,texture=null){
 if(a.placement&&!a.placement.valid)throw new Error(a.placement.message);
 const colors={body:'#DBE4DFFF',clear:'#BFE4D488',mask:'#253C32FF',actuator:'#34383BFF'};
 const textureId=a.parts.length+2,groupId=textureId+1;
 const mapping=texture?a.parts.map(p=>carrierTextureUV(a,p)):null;
 const textured=Boolean(texture&&mapping.some(m=>m.top.length));
 const objects=a.parts.map((part,i)=>{
  const p=posedPositions(part,a),verts=[];for(let n=0;n<p.length;n+=3)verts.push(`<vertex x="${p[n]}" y="${p[n+1]}" z="${p[n+2]}"/>`);
  const top=new Set(mapping?.[i].top),faces=[];
  for(let n=0;n<part.indices.length;n+=3){const ids=Array.from(part.indices.subarray(n,n+3));faces.push(`<triangle v1="${ids[0]}" v2="${ids[1]}" v3="${ids[2]}"${textured&&top.has(n/3)?` pid="${groupId}" p1="${ids[0]}" p2="${ids[1]}" p3="${ids[2]}"`:''}/>`);}
  return`<object id="${i+2}" type="model" name="${esc(part.name)}" pid="1" pindex="${i}"><mesh><vertices>${verts.join('')}</vertices><triangles>${faces.join('')}</triangles></mesh></object>`;
 });
 const carrier=mapping?.[a.parts.findIndex(p=>p.id==='base')];
 const textureXML=textured?`<m:texture2d id="${textureId}" path="/3D/Textures/encoded-pattern.png" contenttype="image/png" tilestyleu="clamp" tilestylev="clamp" filter="linear"/><m:texture2dgroup id="${groupId}" texid="${textureId}">${Array.from({length:carrier.uv.length/2},(_,i)=>`<m:tex2coord u="${carrier.uv[i*2]}" v="${carrier.uv[i*2+1]}"/>`).join('')}</m:texture2dgroup>`:'';
 const model=`<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"${textured?' xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02" requiredextensions="m"':''}><metadata name="Application">ShiftLens design workspace</metadata><resources><basematerials id="1">${a.parts.map(p=>`<base name="${esc(p.name)}" displaycolor="${colors[p.material]}"/>`).join('')}</basematerials>${textureXML}${objects.join('')}</resources><build>${a.parts.map((_,i)=>`<item objectid="${i+2}"/>`).join('')}</build></model>`;
 const files={'[Content_Types].xml':strToU8(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>${textured?'<Default Extension="png" ContentType="image/png"/>':''}</Types>`),'_rels/.rels':strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),'3D/3dmodel.model':strToU8(model)};
 if(textured){files['3D/Textures/encoded-pattern.png']=texture;files['3D/_rels/3dmodel.model.rels']=strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/Textures/encoded-pattern.png" Id="texture0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dtexture"/></Relationships>');}
 return zipSync(files);
}
// VRML97 uses meters. Keep every original closed part intact, with independent
// texture-coordinate indices so non-image faces sample a plain atlas border.
export function manufacturingVRML(a,{width,height}={}){
 const colors={body:'0.859 0.894 0.875',clear:'0.75 0.894 0.831',mask:'0.145 0.235 0.196',actuator:'0.204 0.22 0.231'};
 const shapes=a.parts.map(part=>{
  const p=posedPositions(part,a),map=carrierTextureUV(a,part),textured=part.id==='base'&&width&&height&&map.top.length,top=new Set(map.top),n=p.length/3;
  const coords=Array.from({length:n},(_,i)=>Array.from(p.subarray(i*3,i*3+3),x=>x/1000).join(' ')).join(',\n');
  const faces=Array.from({length:part.indices.length/3},(_,i)=>Array.from(part.indices.subarray(i*3,i*3+3)).join(' ')+ ' -1').join(',\n');
  const tex=textured?`texCoord TextureCoordinate { point [ ${Array.from({length:n},(_,i)=>`${(1+map.uv[i*2]*width)/(width+2)} ${(1+map.uv[i*2+1]*height)/(height+2)}`).join(',')}, ${.5/(width+2)} ${.5/(height+2)} ] } texCoordIndex [ ${Array.from({length:part.indices.length/3},(_,i)=> (top.has(i)?Array.from(part.indices.subarray(i*3,i*3+3)):[n,n,n]).join(' ')+' -1').join(',')} ]`:'';
  return`# ${part.name} (${part.material})\nDEF ShiftLens_${part.id} Shape { appearance Appearance { material Material { diffuseColor ${colors[part.material]} ${part.material==='clear'?'transparency 0.9':''} } ${textured?'texture ImageTexture { url ["carrier-texture.png"] repeatS FALSE repeatT FALSE }':''} } geometry IndexedFaceSet { solid TRUE creaseAngle 0.5 coord Coordinate { point [ ${coords} ] } coordIndex [ ${faces} ] ${tex} } }`;
 });
 return '#VRML V2.0 utf8\n# ShiftLens, state 1. Coordinates in meters. Material roles are not J55 recipes.\n'+shapes.join('\n');
}
function carrierAtlas(encoded){const canvas=document.createElement('canvas');canvas.width=encoded.width+2;canvas.height=encoded.height+2;const ctx=canvas.getContext('2d');ctx.fillStyle='#dbe4df';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(encoded,1,1);return dataBytes(canvas.toDataURL());}
export function binarySTL(part,a){const p=posedPositions(part,a),faces=part.indices,n=faces.length/3,buffer=new ArrayBuffer(84+n*50),v=new DataView(buffer);v.setUint32(80,n,true);for(let i=0;i<n;i++){let offset=84+i*50+12;for(let j=0;j<3;j++)for(let k=0;k<3;k++){v.setFloat32(offset,p[faces[i*3+j]*3+k],true);offset+=4;}}return new Uint8Array(buffer);}
export function fanPrint(a,encoded){if(!a.door)throw new Error('The fan print template applies to the planar radial-curve example.');const d=a.derived,a0=d.a0,a1=d.a1,r0=d.innerRadius,r1=d.outerRadius,points=[];for(let i=0;i<=100;i++)for(const r of[r0,r1]){const t=a0+(a1-a0)*i/100;points.push([r*Math.cos(t),r*Math.sin(t)]);}const minX=Math.min(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxX=Math.max(...points.map(p=>p[0])),maxY=Math.max(...points.map(p=>p[1])),width=maxX-minX,height=maxY-minY,scale=12;
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);const ctx=canvas.getContext('2d'),source=encoded.getContext('2d').getImageData(0,0,encoded.width,encoded.height),out=ctx.createImageData(canvas.width,canvas.height);for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const px=minX+(x+.5)/scale,py=maxY-(y+.5)/scale,r=Math.hypot(px,py),t=Math.atan2(py,px);if(r<r0||r>r1||t<a0||t>a1)continue;const hole=a.mechanism?.paperCut;if(hole){const p=frameCoordinates(hole.frame,[px,py,d.paperZ]);if(Math.abs(p[0])<hole.halfX&&Math.abs(p[1])<hole.halfY)continue;}const u=((t-a0)/(a1-a0)*d.count+1)/(d.count+2),v=(r1-r)/(r1-r0),sx=Math.min(encoded.width-1,Math.floor(u*encoded.width)),sy=Math.min(encoded.height-1,Math.floor(v*encoded.height)),q=(sy*encoded.width+sx)*4,p=(y*canvas.width+x)*4;out.data.set(source.data.subarray(q,q+4),p);}ctx.putImageData(out,0,0);
 const path=[];for(let i=0;i<=100;i++){const t=a0+(a1-a0)*i/100;path.push(`${i?'L':'M'}${10+r1*Math.cos(t)-minX},${10+maxY-r1*Math.sin(t)}`);}for(let i=100;i>=0;i--){const t=a0+(a1-a0)*i/100;path.push(`L${10+r0*Math.cos(t)-minX},${10+maxY-r0*Math.sin(t)}`);}path.push('Z');
 const hole=a.mechanism?.paperCut,cutPath=hole?[[ -1,-1],[1,-1],[1,1],[-1,1]].map(([x,y],i)=>{const p=framePoint(hole.frame,[x*hole.halfX,y*hole.halfY,0]);return `${i?'L':'M'}${10+p[0]-minX},${10+maxY-p[1]}`;}).join(' ')+' Z':'';
 return`<svg xmlns="http://www.w3.org/2000/svg" width="${width+20}mm" height="${height+43}mm" viewBox="0 0 ${width+20} ${height+43}"><rect width="100%" height="100%" fill="white"/><image x="10" y="10" width="${width}" height="${height}" href="${canvas.toDataURL()}"/><path d="${path.join(' ')}" fill="none" stroke="#555" stroke-width=".12"/><path d="${cutPath}" fill="none" stroke="#555" stroke-width=".12"/><path d="M10 ${height+25}h10m-10 -1v2m10 -2v2" stroke="black" stroke-width=".2"/><text x="23" y="${height+26}" font-size="2.5" font-family="sans-serif">10 mm scale check</text><text x="10" y="${height+33}" font-size="2.5" font-family="sans-serif">ShiftLens · Print at 100% · Image radius ${r0}–${r1} mm</text><text x="10" y="${height+38}" font-size="2" font-family="sans-serif">Align radial cut edges to the matching backplane edges. Verify lens and printer calibration.</text></svg>`;
}
export function exportBundle(a,project,encoded){if(a.placement&&!a.placement.valid)throw new Error(a.placement.message);if(a.checks.collisions.length)throw new Error('Resolve the detected part intersections before exporting.');const files={'assembly.3mf':manufacturing3MF(a,dataBytes(encoded.toDataURL())),'assembly.wrl':strToU8(manufacturingVRML(a,encoded)),'carrier-texture.png':carrierAtlas(encoded),'project.shiftlens.json':strToU8(JSON.stringify(project,null,2)),'encoded-pattern.png':dataBytes(encoded.toDataURL()),'verification.json':strToU8(JSON.stringify({units:'mm',opticalEvaluation:evaluateAssembly(a),automaticOptimization:a.optimization??null,sourceGeometry:a.sourceGeometry,mechanismSource:a.mechanismSource,mechanism:a.mechanism,parts:a.parts.map(p=>({name:p.name,volume_mm3:p.volume,triangles:p.triangles})),checks:a.checks,physicalCalibration:'Not yet validated with a fabricated sample',preview:'Idealized lens-aperture reconstruction from the encoded pattern; not calibrated optical performance'},null,2))};for(let i=0;i<project.images.length;i++){const ext=project.images[i].startsWith('data:image/jpeg;')?'jpg':project.images[i].startsWith('data:image/webp;')?'webp':'png';files[`state-${i+1}.${ext}`]=dataBytes(project.images[i]);}for(const part of a.parts)files[`parts/${part.id}.stl`]=binarySTL(part,a);if(a.door)files['paper-insert.svg']=strToU8(fanPrint(a,encoded));files['README.txt']=strToU8('ShiftLens geometric development assembly\nUnits: millimeters. Assembly exported in state 1.\nassembly.3mf preserves indexed triangles, component names, material roles, millimeter units and the interleaved PNG on the closed image carrier. Its Materials Extension is required; use a texture-capable importer.\nassembly.wrl is a VRML97 equivalent in meters; keep carrier-texture.png beside it. Individual STL files omit color/texture.\nThe paper insert is a separate 2D print workflow. This bundle does not encode J55 material recipes or claim calibrated optical performance.\nClearances and meshes are computationally checked. Manufacture a sample before selecting process tolerances or scaling production.\n');download('shiftlens-assembly.zip',zipSync(files,{level:6}));}
