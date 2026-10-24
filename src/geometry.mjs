import {capHeight,capSag} from './optics.mjs';
import {derive, DEG} from './model.mjs';
import {surfaceAt, frameAt, add, scale, doorSurface, surfaceMetrics, projectSurfaceUV, motionPoint, dot, sub} from './surface.mjs';
import originalDoor from './assets/original-door.mjs';
import {usesOriginalRails} from './original-door-profile.mjs';
import {nativePlacement,nativeAt,partMatrix} from './native-actuation.mjs';
import {fitNative} from './native-fitting.mjs';

export function meshFromGrid(nu,nv,point) {
  const positions=[],triangles=[];
  for(let layer=0;layer<2;layer++)for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++) positions.push(...point(i/nu,j/nv,layer));
  const n=(nu+1)*(nv+1),idx=(i,j)=>i*(nv+1)+j;
  for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){
    const a=idx(i,j),b=idx(i+1,j),c=idx(i+1,j+1),d=idx(i,j+1);
    triangles.push(a,b,c,a,c,d,a+n,c+n,b+n,a+n,d+n,c+n);
  }
  const boundary=[];
  for(let i=0;i<=nu;i++)boundary.push(idx(i,0));
  for(let j=1;j<=nv;j++)boundary.push(idx(nu,j));
  for(let i=nu-1;i>=0;i--)boundary.push(idx(i,nv));
  for(let j=nv-1;j>0;j--)boundary.push(idx(0,j));
  for(let i=0;i<boundary.length;i++){const a=boundary[i],b=boundary[(i+1)%boundary.length];triangles.push(a,a+n,b+n,a,b+n,b);}
  return orient({positions,triangles});
}
function orient(mesh){
  let volume=0; const p=mesh.positions,t=mesh.triangles;
  for(let i=0;i<t.length;i+=3){const a=t[i]*3,b=t[i+1]*3,c=t[i+2]*3;volume+=p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])+p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]);}
  if(volume<0)for(let i=0;i<t.length;i+=3)[t[i+1],t[i+2]]=[t[i+2],t[i+1]];
  return mesh;
}
function surfaceBand(s,u0,u1,v0,v1,bottom,top,nu=24,nv=20){
  return meshFromGrid(nu,nv,(a,b,layer)=>{const u=u0+(u1-u0)*a,v=v0+(v1-v0)*b,f=frameAt(s,u,v);return add(f.position,scale(f.normal,layer?bottom:top(a,b,u,v)));});
}
function polarBand(r0,r1,a0,a1,z0,z1,nu=48,nv=2){return meshFromGrid(nu,nv,(a,b,layer)=>{const r=r0+(r1-r0)*b,t=a0+(a1-a0)*a;return[r*Math.cos(t),r*Math.sin(t),layer?z0:z1];});}
function sweepMesh(lib,s,v,profile,u0,u1,steps=48){
  let area=0;for(let j=0;j<profile.length;j++){const a=profile[j],b=profile[(j+1)%profile.length];area+=a[0]*b[1]-b[0]*a[1];}if(area<0)profile=[...profile].reverse();
  const p=[],t=[],n=profile.length;
  for(let i=0;i<=steps;i++){const f=frameAt(s,u0+(u1-u0)*i/steps,v);for(const[a,b]of profile)p.push(...add(add(f.position,scale(f.across,a)),scale(f.normal,b)));}
  for(let i=0;i<steps;i++)for(let j=0;j<n;j++){const a=i*n+j,b=(i+1)*n+j,c=(i+1)*n+(j+1)%n,d=i*n+(j+1)%n;t.push(a,d,c,a,c,b);}
  const cap=lib.triangulate([profile]);for(const[a,b,c]of cap){t.push(c,b,a,steps*n+a,steps*n+b,steps*n+c);}
  return orient({positions:p,triangles:t});
}

function paperMesh(s,u0,u1,height,nu,nv){
  const positions=[],triangles=[];
  for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){
    const f=frameAt(s,u0+(u1-u0)*i/nu,j/nv);positions.push(...add(f.position,scale(f.normal,height)));
  }
  for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){
    const a=i*(nv+1)+j,b=a+nv+1;triangles.push(a,b,b+1,a,b+1,a+1);
  }
  return {positions,triangles};
}

export function buildAssembly(lib,parameters,{collisionSamples=9,surface=null}={}){
  const d=derive(parameters),s=surface??doorSurface(d),door=surface===null;

  const resources=[],own=x=>(resources.push(x),x),M=lib.Manifold;
  const solid=mesh=>own(new M(new lib.Mesh({numProp:3,vertProperties:new Float32Array(mesh.positions),triVerts:new Uint32Array(mesh.triangles)})));
  const union=xs=>own(M.union(xs));
  const box=(size,pos)=>own(own(M.cube(size,true)).translate(pos));
  const cylinder=(h,r,pos,axis='z')=>{let c=own(M.cylinder(h,r,r,24,true));if(axis==='x')c=own(c.rotate([0,90,0]));return own(c.translate(pos));};
  const cut=(a,b)=>own(a.subtract(b));
  const toPart=(id,name,material,motion,body)=>{if(body.status()!=='NoError'||body.volume()<=0)throw new Error(`${name}: invalid solid (${body.status()}).`);const mesh=body.getMesh();return{id,name,material,motion,positions:new Float32Array(mesh.vertProperties),indices:new Uint32Array(mesh.triVerts),volume:body.volume(),triangles:mesh.triVerts.length/3};};
  try{
    const metrics=door?{count:d.count,minPitch:d.innerRadius*d.delta,maxPitch:d.outerRadius*d.delta}:surfaceMetrics(s,d.pitch),count=metrics.count;
    const uStart=door?-0.5:0,uEnd=uStart+1,extra=1/count,lensStart=uStart-extra;
    const nativeLens=door&&d.nativeProfile,nativeRails=nativeLens&&usesOriginalRails(d);
    const topMax=d.opticalProfile?d.substrate+capSag(metrics.maxPitch,d.lensRadiusRatio)+.5:(door?d.rimHeight:d.substrate+metrics.maxPitch/2+0.5);
    const paper=door?d.paperZ:-d.gap-d.maskThickness, bottom=paper-d.baseThickness;
    const baseParts=[solid(surfaceBand(s,uStart,uEnd,0,1,bottom,()=>paper,Math.max(32,count*3),32))];
    const lensParts=[],maskParts=[];
    for(let k=-1;k<count;k++){
      const u0=uStart+k/count,u1=uStart+(k+1)/count;
      if(nativeLens){
        const cell=originalDoor.parts.find(p=>p.role==='lensCell');
        lensParts.push(own(solid({positions:cell.positions,triangles:cell.indices}).rotate([0,0,k*d.delta/DEG])));
      }else lensParts.push(solid(surfaceBand(s,u0,u1,0,1,0,(a,b,u,v)=>{
        let width;
        if(door){const r=d.innerRadius+(d.outerRadius-d.innerRadius)*v;const x=r*Math.sin((a-0.5)*d.delta),R=r*Math.sin(d.delta/2);return d.opticalProfile?capHeight(2*R,x,d.substrate,d.lensRadiusRatio):d.substrate+Math.sqrt(Math.max(0,R*R-x*x));}
        const left=surfaceAt(s,u0,v),right=surfaceAt(s,u1,v);width=Math.hypot(...left.map((x,i)=>x-right[i]));return d.opticalProfile?capHeight(width,width*(a-.5),d.substrate,d.lensRadiusRatio):d.substrate+width*Math.sqrt(Math.max(0,0.25-(a-0.5)**2));
      },20,Math.max(12,s.curve.points.length*8))));
      for(const[a,b]of[[0,.5-.5/d.stateCount],[.5+.5/d.stateCount,1]])maskParts.push(solid(surfaceBand(s,u0+(u1-u0)*a,u0+(u1-u0)*b,0,1,nativeLens?0:-d.maskThickness,()=>nativeLens?d.maskThickness:0,2,32)));
    }
    if(nativeRails&&d.rails){
      for(const part of originalDoor.parts.filter(p=>p.role!=='lensCell')){
        const rail=solid({positions:part.positions,triangles:part.indices});
        lensParts.push(rail,own(rail.rotate([0,0,-d.delta/DEG])));
      }
    }
    if(!nativeRails)for(const[v,sign]of[[0,1],[1,-1]]){
      lensParts.push(solid(sweepMesh(lib,s,v,[[-4*sign,0],[0.12*sign,0],[0.12*sign,topMax],[-4*sign,topMax]],lensStart,uEnd)));
      if(d.rails){const c=d.clearance,t=d.railThickness;
        // The CLEAR lens housing wraps down around the image carrier and has
        // an underside retaining lip. The carrier does not wrap over the lens.
        const profile=[[-c-t,.12],[-c-t,bottom-c-t],[1.8,bottom-c-t],[1.8,bottom-c],[-c,bottom-c],[-c,.12]].map(([x,z])=>[x*sign,z]);
        lensParts.push(solid(sweepMesh(lib,s,v,profile,lensStart,uEnd)));
      }
    }
    if(door && d.rails){
      // Only narrow mechanical stop tabs extend past the carrier. There is no
      // full-width exposed print padding outside the lens array.
      for(const[r0,r1]of[[d.innerRadius-5,d.innerRadius+.1],[d.outerRadius-.1,d.outerRadius+5]]){
        for(const[a,b]of[[d.a0-d.delta-(.9+d.clearance)/r0,d.a0-d.delta-d.clearance/r0],[d.a1+d.travel+d.clearance/r0,d.a1+d.travel+(.9+d.clearance)/r0]])baseParts.push(solid(polarBand(r0,r1,a,b,bottom,topMax+d.clearance,2)));
      }
      for(const[r0,r1]of[[d.innerRadius,d.innerRadius+2],[d.outerRadius-2,d.outerRadius]]){
        baseParts.push(solid(polarBand(r0,r1,d.a0-d.delta-(1+d.clearance)/r0,d.a1+d.travel+(1+d.clearance)/r0,bottom,paper,Math.max(32,count*3),2)));
      }
    }
    let base=union(baseParts),lens=union(lensParts),mask=union(maskParts),actor=null;
    const derived={...d,...metrics,topMax,paperZ:paper,physicalLensCount:count+1};
    let mechanism=null,placement=null;
    if(d.switchEnabled){
      const point=door?{radius:d.switchRadius,angle:d.switchAngleDeg}:{u:d.switchU,v:d.switchV};
      placement=nativePlacement(s,derived,point,d.mechanismType);
      if(placement.valid){
        mechanism=placement.mechanism;
        ({base,lens,mask,actor}=fitNative({own,solid,union,cut,box,cylinder,lib},s,derived,mechanism,{base,lens,mask}));
      }
    }
    const parts=[toPart('base','Image carrier and travel stops','body','fixed',base),toPart('lens','Lens housing and retaining rails','clear','lens',lens),toPart('mask','Opaque aperture bands','mask','lens',mask)];
    if(actor)parts.push(toPart('actuator',`Original CAD ${mechanism.type}`,'actuator','native',actor));
    const collisions=[];let maxCollision=0,maxResidual=0;
    const a={surface:s,derived,mechanism};
    for(let i=0;i<collisionSamples;i++){
      const phase=collisionSamples===1?0:i/(collisionSamples-1),moving=own(lens.transform(partMatrix(a,{motion:'lens'},phase)));
      const pairs=[[base,moving,['base','lens']]];
      if(actor){const rotor=own(actor.transform(nativeAt(s,mechanism,phase).matrix));pairs.push([base,rotor,['base','actuator']],[moving,rotor,['lens','actuator']]);maxResidual=Math.max(maxResidual,nativeAt(s,mechanism,phase).residual);}
      for(const[x,y,ids]of pairs){const volume=own(x.intersect(y)).volume();maxCollision=Math.max(maxCollision,volume);if(volume>.02)collisions.push({phase,parts:ids,volume});}
    }
    return{parts,derived,surface:s,door,mechanism,placement,mechanismSource:mechanism?{file:mechanism.source,sha256:mechanism.sha256,parts:mechanism.sourceParts,rack:mechanism.rack,capLift:mechanism.capLift??0}:null,retainingRailOwner:'lens',sourceGeometry:nativeLens?{file:originalDoor.source,sha256:originalDoor.sourceSha256,parts:nativeRails?['lens','rails']:['lens']}:null,checks:{collisionSamples,collisions,maxCollision,maxResidual,solids:parts.length},patternMesh:paperMesh(s,uStart,uEnd,paper+.08,Math.max(40,count*4),40)};
  }finally{for(const resource of resources.reverse())try{resource.delete();}catch{}}
}

export function addSurfaceUVs(assembly){
  if(assembly.door)return assembly;
  const s=assembly.surface,count=assembly.derived.count,samples=[];
  for(let i=0;i<=100;i++)for(let j=0;j<=40;j++)samples.push({p:surfaceAt(s,-1/count+(1+2/count)*i/100,j/40),uv:[i/100,j/40]});
  function tree(points,depth=0){if(!points.length)return null;const axis=depth%3;points.sort((a,b)=>a.p[axis]-b.p[axis]);const i=points.length>>1;return{sample:points[i],axis,left:tree(points.slice(0,i),depth+1),right:tree(points.slice(i+1),depth+1)};}
  const root=tree(samples);
  function nearest(point){let best=null,bestD=Infinity;function visit(n){if(!n)return;const q=n.sample.p,dist=(q[0]-point[0])**2+(q[1]-point[1])**2+(q[2]-point[2])**2;if(dist<bestD){bestD=dist;best=n.sample;}const delta=point[n.axis]-q[n.axis];visit(delta<0?n.left:n.right);if(delta*delta<bestD)visit(delta<0?n.right:n.left);}visit(root);return best.uv;}
  for(const part of assembly.parts){part.uv=new Float32Array(part.positions.length/3*2);part.surfaceHeight=new Float32Array(part.positions.length/3);part.surfaceNormal=new Float32Array(part.positions.length);part.surfaceTangent=new Float32Array(part.positions.length);part.surfacePitch=new Float32Array(part.positions.length/3);for(let i=0;i<part.positions.length/3;i++){
    const point=part.positions.subarray(i*3,i*3+3),seed=nearest(point);
    const result=projectSurfaceUV(s,point,[seed[0]*(1+2/count)-1/count,seed[1]],[-1/count,1+1/count]);
    part.uv.set([(result[0]+1/count)/(1+2/count),result[1]],i*2);
    const f=frameAt(s,result[0],Math.max(0,Math.min(1,result[1])));part.surfaceHeight[i]=dot(sub(point,f.position),f.normal);part.surfaceNormal.set(f.normal,i*3);part.surfaceTangent.set(f.tangent,i*3);
    const cell=Math.floor(result[0]*count),v=Math.max(0,Math.min(1,result[1]));
    part.surfacePitch[i]=Math.hypot(...sub(surfaceAt(s,(cell+1)/count,v),surfaceAt(s,cell/count,v)));
  }}
  const nu=Math.max(40,count*4),nv=40,uv=new Float32Array(assembly.patternMesh.positions.length/3*2);for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){const k=i*(nv+1)+j;uv[k*2]=(i/nu*count+1)/(count+2);uv[k*2+1]=j/nv;}assembly.patternMesh.uv=uv;
  return assembly;
}
