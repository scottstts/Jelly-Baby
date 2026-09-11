import assert from 'node:assert/strict';
import { Group } from 'three/webgpu';
import { SoftBody } from '../src/physics/soft-body.js';
import { BabyFace } from '../src/graphics/character/baby-face.ts';
import { FaceExpression } from '../src/graphics/character/face-expression.ts';
import { SurfaceBVH } from '../src/graphics/optics/refractive-light.js';
import { loadModel } from './load-model.mjs';

const body=new SoftBody(loadModel()),group=new Group(),face=new BabyFace(body,group);
face.update(0);
const baseline=group.children.map(mesh=>mesh.geometry.attributes.position.array.slice());
// Compare the resting face to the original ray-projected artwork.
const bvh=new SurfaceBVH(body.surface),out=new Float64Array(6);
for(const detail of face.details) {
  const {rest,cx,cy,depth,mesh}=detail,p=mesh.geometry.attributes.position.array;
  for(let i=0;i<rest.length;i+=3) {
    const hit=bvh.hit([rest[i]+cx,rest[i+1]+cy,.08],[0,0,-1]);
    assert(hit);
    out.fill(0);
    for(let k=0;k<3;k++) {
      const id=body.surface.indices[hit.t*3+k]*3,w=k===0?1-hit.u-hit.v:k===1?hit.u:hit.v;
      for(let axis=0;axis<3;axis++) {
        out[axis]+=body.surface.positions[id+axis]*w;
        out[axis+3]+=body.surface.geometry.attributes.normal.array[id+axis]*w;
      }
    }
    const scale=Math.max(.00008,rest[i+2]+depth)/Math.hypot(out[3],out[4],out[5]);
    for(let axis=0;axis<3;axis++)assert(Math.abs(p[i+axis]-out[axis]-out[axis+3]*scale)<1e-8,'rest artwork is preserved');
  }
}
// Sweep blinks, sobbing, release giggles, interrupted release and multiple grips.
for(let frame=0;frame<600;frame++) {
  body.grabs=frame>=170&&frame<280?[{},{}]:frame>=310&&frame<370?[{}]:[];
  face.update(1/60);
  for(const mesh of group.children) {
    assert(mesh.geometry.attributes.position.array.every(Number.isFinite));
    assert(mesh.geometry.attributes.normal.array.every(Number.isFinite));
  }
}
face.reset();face.update(0);
group.children.forEach((mesh,i)=>assert.deepEqual(mesh.geometry.attributes.position.array,baseline[i]));
// Any expression must move with the skin, including a sleeping body's rigid motion.
body.grabs=[{}];for(let i=0;i<60;i++)face.update(1/60);
const attachedDetails=face.details.map(detail=>detail.mesh);
const before=attachedDetails.map(mesh=>mesh.geometry.attributes.position.array.slice());
for(let i=0;i<body.x.length;i+=3){body.x[i]+=.02;body.x[i+1]+=.01;body.x[i+2]-=.03;}
body.updateSurface();face.update(0);
attachedDetails.forEach((mesh,j)=>{
  const p=mesh.geometry.attributes.position.array;
  for(let i=0;i<p.length;i++)assert(Math.abs(p[i]-before[j][i]-[.02,.01,-.03][i%3])<2e-8,'expression follows skin');
});
// The volumetric bubble follows the nose by object transform, not baked vertices.
body.grabs=[];for(let frame=0;frame<240;frame++)face.update(1/60,false,true);
const bubble=group.children.find(mesh=>mesh.name==='sleep-bubble');assert(bubble.visible);
const noseBefore=bubble.position.clone();
for(let i=0;i<body.x.length;i+=3)body.x[i]+=.01;
body.updateSurface();face.update(0,false,true);
assert(Math.abs(bubble.position.x-noseBefore.x-.01)<2e-8);
for(let frame=0;frame<240;frame++)face.update(1/60);
assert(!bubble.visible,'wake deflates the bubble');
const expression=new FaceExpression();
// Stretch and shear the skin, then exercise every part of the performance on it.
for(let i=0;i<body.x.length;i+=3) {
  body.x[i]=body.rest[i]*1.35+body.rest[i+1]*.2;
  body.x[i+1]=body.rest[i+1]*1.15;
  body.x[i+2]=body.rest[i+2]*.8;
}
body.updateSurface();
for(let frame=0;frame<240;frame++) {
  body.grabs=frame<90?[{},{}]:[];face.update(1/60);
  for(const mesh of group.children)assert(mesh.geometry.attributes.position.array.every(Number.isFinite));
}
for(let i=0;i<60;i++)expression.update(1/60,true);
assert(expression.sob>.99);
for(let i=0;i<45;i++)expression.update(1/60,false);
assert(expression.laugh>.7);
for(let i=0;i<360;i++)expression.update(1/60,false);
assert.equal(expression.sob,0);assert.equal(expression.laugh,0);
console.log('Face checks passed: original pose, animation coverage, multiple grabs, release, reset and deformed attachment.');
