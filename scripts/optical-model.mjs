import * as THREE from 'three/webgpu';
import { SurfaceBVH } from '../src/graphics/optics/refractive-light.js';
import { inverse3 } from '../src/physics/soft-body.js';

/** A lower sampling of the same implicit surface, used only for light transport. */
export function buildOpticalModel(definitions,scale,bottom,full) {
  const reduced=definitions.replace('const NX = 104, NY = 96, NZ = 88;','const NX = 40, NY = 36, NZ = 34;');
  if(reduced===definitions)throw new Error('Reference polygonizer dimensions changed');
  const raw=new Function('THREE',reduced+'\nreturn buildJellyGeometry();')(THREE);
  raw.translate(0,-bottom,0);raw.scale(scale,scale,scale);
  const p=raw.attributes.position.array,n=raw.attributes.normal.array,vertices=new Map(),positions=[],normals=[],indices=[];
  for(let i=0;i<p.length;i+=3) {
    const key=`${p[i]},${p[i+1]},${p[i+2]}`;let id=vertices.get(key);
    if(id===undefined){id=positions.length/3;vertices.set(key,id);positions.push(p[i],p[i+1],p[i+2]);normals.push(n[i],n[i+1],n[i+2]);}
    indices.push(id);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setIndex(indices);
  const surface={geometry,positions:geometry.attributes.position.array,indices:geometry.index.array};
  const bvh=new SurfaceBVH(surface),mappingIds=[],mappingWeights=[];
  let maxDistance=0;
  for(let i=0;i<full.positions.length;i+=3) {
    const origin=[0,1,2].map(k=>full.positions[i+k]+full.normals[i+k]*.004);
    const dir=[-full.normals[i],-full.normals[i+1],-full.normals[i+2]];
    const hit=bvh.hit(origin,dir,.008);if(!hit)throw new Error(`No optical surface at vertex ${i/3}`);
    maxDistance=Math.max(maxDistance,Math.abs(hit.distance-.004));
    mappingIds.push(...indices.slice(hit.t*3,hit.t*3+3));mappingWeights.push(1-hit.u-hit.v,hit.u,hit.v);
  }
  const tets=[];
  for(let i=0;i<full.tets.length;i+=4) {
    const ids=Array.from(full.tets.slice(i,i+4)),p=full.particles,[a,b,c,d]=ids.map(id=>id*3);
    const inv=inverse3([p[b]-p[a],p[c]-p[a],p[d]-p[a],p[b+1]-p[a+1],p[c+1]-p[a+1],p[d+1]-p[a+1],p[b+2]-p[a+2],p[c+2]-p[a+2],p[d+2]-p[a+2]]);
    const lo=[0,1,2].map(k=>Math.min(...ids.map(id=>p[id*3+k]))),hi=[0,1,2].map(k=>Math.max(...ids.map(id=>p[id*3+k])));
    tets.push({ids,inv,lo,hi});
  }
  const bindingIds=[],bindingWeights=[];
  for(let i=0;i<positions.length;i+=3) {
    let found=false;
    for(const t of tets) {
      if([0,1,2].some(k=>positions[i+k]<t.lo[k]-1e-7||positions[i+k]>t.hi[k]+1e-7))continue;
      const at=t.ids[0]*3,m=t.inv,dx=positions[i]-full.particles[at],dy=positions[i+1]-full.particles[at+1],dz=positions[i+2]-full.particles[at+2];
      const b=m[0]*dx+m[1]*dy+m[2]*dz,c=m[3]*dx+m[4]*dy+m[5]*dz,d=m[6]*dx+m[7]*dy+m[8]*dz;
      const weights=[1-b-c-d,b,c,d];if(weights.some(w=>w< -1e-7))continue;
      bindingIds.push(...t.ids);bindingWeights.push(...weights);found=true;break;
    }
    if(!found)throw new Error(`Could not embed optical vertex ${i/3}`);
  }
  console.log({opticalVertices:positions.length/3,opticalTriangles:indices.length/3,maxSurfaceErrorMm:maxDistance*1000});
  return {opticalPositions:new Float32Array(positions),opticalNormals:new Float32Array(normals),opticalIndices:new Uint32Array(indices),
    opticalBindingIds:new Uint32Array(bindingIds),opticalBindingWeights:new Float64Array(bindingWeights),
    thicknessIds:new Uint32Array(mappingIds),thicknessWeights:new Float32Array(mappingWeights)};
}
