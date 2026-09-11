import assert from 'node:assert/strict';
import { Scene, Vector3, Box3 } from 'three/webgpu';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { BedFacility } from '../src/worlds/main/facilities/bed/facility.ts';
import { BED } from '../src/worlds/main/facilities/bed/physics.ts';
import { FacilityShadows } from '../src/facilities/shadows.ts';
import { SURFACE_SHADOW_SIZE } from '../src/facilities/surface-shadows.ts';
import { loadModel } from './load-model.mjs';

const body=new SoftBody(loadModel()),scene=new Scene();
const shadows=new FacilityShadows(new Vector3(.494,-.748,-.443).normalize(),.7);
// Match the complete playground footprint, not a tightly cropped bed-only map.
shadows.surfaces.bounds.union(new Box3(new Vector3(-.255,0,-.185),new Vector3(.27,.2,.30)));
const bed=new BedFacility(scene,body,shadows);
for(let j=0;j<body.x.length;j+=3){body.x[j]+=BED.x-.1;body.x[j+2]+=BED.z;}
body.updateCenter();body.grounded=true;assert(bed.interact());
for(let i=0;i<240;i++){bed.step(PHYS.step);body.step(PHYS.step);bed.afterStep();}
body.updateSurface();bed.update();
const surfaces=shadows.surfaces,reference=surfaces.receiverDepths[0];
assert(reference,'blanket opts into a curved receiver depth map');
assert.equal(reference.proxy.geometry,reference.source.geometry);
const size=SURFACE_SHADOW_SIZE,depth=new Float64Array(size*size).fill(1),owner=new Int32Array(size*size).fill(-1);
const p=reference.source.geometry.attributes.position,ix=reference.source.geometry.index.array;
reference.source.updateWorldMatrix(true,false);
const projected=new Float64Array(p.count*3),point=new Vector3();
for(let i=0;i<p.count;i++){
  point.fromBufferAttribute(p,i).applyMatrix4(reference.source.matrixWorld).applyMatrix4(surfaces.matrixNode.value);
  projected[i*3]=(point.x*.5+.5)*size-.5;projected[i*3+1]=(-point.y*.5+.5)*size-.5;projected[i*3+2]=point.z;
}
const gradients=new Float64Array(ix.length/3*2);
for(let t=0;t<ix.length;t+=3){
  const a=ix[t]*3,b=ix[t+1]*3,c=ix[t+2]*3;
  const ax=projected[a],ay=projected[a+1],bx=projected[b]-ax,by=projected[b+1]-ay,cx=projected[c]-ax,cy=projected[c+1]-ay;
  const det=bx*cy-by*cx;if(Math.abs(det)<1e-10)continue;
  const bz=projected[b+2]-projected[a+2],cz=projected[c+2]-projected[a+2];
  gradients[t/3*2]=(bz*cy-cz*by)/det;gradients[t/3*2+1]=(bx*cz-cx*bz)/det;
  for(let y=Math.max(0,Math.ceil(Math.min(ay,projected[b+1],projected[c+1])));y<=Math.min(size-1,Math.floor(Math.max(ay,projected[b+1],projected[c+1])));y++)
    for(let x=Math.max(0,Math.ceil(Math.min(ax,projected[b],projected[c])));x<=Math.min(size-1,Math.floor(Math.max(ax,projected[b],projected[c])));x++){
      const u=((x-ax)*cy-(y-ay)*cx)/det,v=(bx*(y-ay)-by*(x-ax))/det;
      if(u<0||v<0||u+v>1)continue;
      const z=projected[a+2]+u*bz+v*cz,i=y*size+x;
      if(z<depth[i]){depth[i]=z;owner[i]=t/3;}
    }
}
let samples=0,oldAcne=0,newAcne=0,blocked=0,selfBlocked=0;
const bias=surfaces.depthBiasNode.value,fx=surfaces.filterXNode.value,fy=surfaces.filterZNode.value;
for(let y=0;y<size;y+=3)for(let x=0;x<size;x+=3){
  const i=y*size+x;if(owner[i]<0)continue;
  const gx=gradients[owner[i]*2],gy=gradients[owner[i]*2+1];
  for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
    const sx=Math.round(x+(fx.x*ox+fy.x*oy)*size),sy=Math.round(y+(fx.y*ox+fy.y*oy)*size);
    if(sx<0||sx>=size||sy<0||sy>=size)continue;
    const j=sy*size+sx;if(owner[j]<0)continue;
    const tangent=depth[i]+gx*(sx-x)+gy*(sy-y)-bias;
    const corrected=depth[j]-bias;samples++;
    if(tangent>depth[j])oldAcne++;
    if(corrected>depth[j])newAcne++;
    if(corrected>depth[j]-.005)blocked++;
    if(depth[j]+.005-bias>depth[j])selfBlocked++;
  }
}
assert(oldAcne>50,'the actual blanket reproduces false tangent-plane self-shadowing');
assert.equal(newAcne,0);assert.equal(blocked,samples);assert.equal(selfBlocked,samples);
let subpixelSamples=0,nearestAcne=0,envelopeAcne=0;
for(let t=0;t<ix.length;t+=3)for(const weights of [[1/3,1/3,1/3],[.7,.15,.15],[.15,.7,.15],[.15,.15,.7]]){
  let x=0,y=0,z=0;
  for(let k=0;k<3;k++){const j=ix[t+k]*3;x+=projected[j]*weights[k];y+=projected[j+1]*weights[k];z+=projected[j+2]*weights[k];}
  const bx=Math.floor(x),by=Math.floor(y);if(bx<0||by<0||bx+1>=size||by+1>=size)continue;
  const gx=gradients[t/3*2],gy=gradients[t/3*2+1];
  let anchor=-1,visible=true;
  for(let oy=0;oy<2;oy++)for(let ox=0;ox<2;ox++){
    const j=(by+oy)*size+bx+ox;if(owner[j]<0)continue;
    anchor=Math.max(anchor,depth[j]+gx*(x-bx-ox)+gy*(y-by-oy));
    // Reject a genuinely occluded layer using the actual neighboring caster
    // triangle at this subpixel position, not the receiver's tangent plane.
    const q=owner[j]*3,a=ix[q]*3,b=ix[q+1]*3,c=ix[q+2]*3;
    const ax=projected[a],ay=projected[a+1],ex=projected[b]-ax,ey=projected[b+1]-ay,fx=projected[c]-ax,fy=projected[c+1]-ay,det=ex*fy-ey*fx;
    const u=((x-ax)*fy-(y-ay)*fx)/det,v=(ex*(y-ay)-ey*(x-ax))/det;
    if(u>=0&&v>=0&&u+v<=1){const front=projected[a+2]+u*(projected[b+2]-projected[a+2])+v*(projected[c+2]-projected[a+2]);if(front<z-1e-7)visible=false;}
  }
  if(!visible||anchor<0)continue;
  const nx=Math.round(x),ny=Math.round(y),j=ny*size+nx;
  if(owner[j]<0)continue;
  const nearest=depth[j]+gx*(x-nx)+gy*(y-ny);
  if(z-nearest>bias||z-anchor>bias){
    for(let q=0;q<ix.length;q+=3){
      const a=ix[q]*3,b=ix[q+1]*3,c=ix[q+2]*3,ax=projected[a],ay=projected[a+1];
      const ex=projected[b]-ax,ey=projected[b+1]-ay,fx=projected[c]-ax,fy=projected[c+1]-ay,det=ex*fy-ey*fx;
      const u=((x-ax)*fy-(y-ay)*fx)/det,v=(ex*(y-ay)-ey*(x-ax))/det;
      if(u<0||v<0||u+v>1)continue;
      const front=projected[a+2]+u*(projected[b+2]-projected[a+2])+v*(projected[c+2]-projected[a+2]);
      if(front<z-1e-7){visible=false;break;}
    }
  }
  if(!visible)continue;
  subpixelSamples++;if(z-nearest>bias)nearestAcne++;if(z-anchor>bias)envelopeAcne++;
}
assert(nearestAcne>0,'subpixel samples reproduce remaining nearest-anchor acne');
// Finite shadow texels cannot exactly resolve every grazing triangle. Freeze
// the accepted rendering with a small subpixel error budget, not a false claim
// of exact continuous visibility. Texel-center self comparisons above remain exact.
assert(envelopeAcne/subpixelSamples<.001,'subpixel disagreement stays below 0.1%');
assert(envelopeAcne<nearestAcne,'four-texel anchoring improves on nearest-texel anchoring');
let renders=0;const original={},renderer={target:original,autoClear:false,getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},render(){renders++;}};
surfaces.update(renderer);const initial=renders;assert(initial>=3);
surfaces.update(renderer);assert.equal(renders,initial,'idle receiver depths are cached');
bed.step(PHYS.step);body.step(PHYS.step);bed.afterStep();body.updateSurface();bed.update();surfaces.update(renderer);
assert(renders>=initial+2,'fabric deformation updates its caster and curved receiver');
const beforeLight=renders;shadows.setLighting(new Vector3(-.4,-.8,.2).normalize(),.5);surfaces.update(renderer);
assert(renders>=beforeLight+3,'lighting invalidates the reference projection too');
assert.equal(renderer.target,original);assert.equal(renderer.autoClear,false);
console.log({samples,oldAcne,newAcne,blocked,selfBlocked,subpixelSamples,nearestAcne,envelopeAcne});
bed.dispose();shadows.dispose();console.log('Curved blanket shadow reproduction, blocker retention and receiver-depth lifecycle passed');
