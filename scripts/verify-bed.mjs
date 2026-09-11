import assert from 'node:assert/strict';
import { Scene, Group, Mesh, MeshBasicNodeMaterial, DoubleSide, Raycaster, Vector3 } from 'three/webgpu';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { loadModel } from './load-model.mjs';
import { BedFacility } from '../src/worlds/main/facilities/bed/facility.ts';
import { BED } from '../src/worlds/main/facilities/bed/physics.ts';
import { BabyFace } from '../src/graphics/character/baby-face.ts';
import { FaceExpression } from '../src/graphics/character/face-expression.ts';
import { BlanketClearance } from '../src/worlds/main/facilities/bed/clearance.ts';

const body=new SoftBody(loadModel()),scene=new Scene();let registered=false;
const facility=new BedFacility(scene,body,{add(group,bounds){registered=true;group.updateMatrixWorld(true);group.traverse(mesh=>{if(!mesh.isMesh)return;assert(mesh.castShadow&&mesh.receiveShadow);mesh.geometry.computeBoundingBox();assert(bounds.containsBox(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld)));});}});
assert(registered);assert(!facility.interact());
for(let j=0;j<body.x.length;j+=3){body.x[j]+=BED.x-.10;body.x[j+2]+=BED.z;}
body.updateCenter();body.grounded=true;
assert(facility.interact());assert(facility.sleeping);assert.equal(facility.action,'Get Up');assert.equal(facility.mobileAction,'Get up');
const face=new BabyFace(body,new Group()),expression=new FaceExpression();
let low=Infinity,high=-Infinity,clothPeak=0;
let minCoveredGap=Infinity,clearanceMs=0,clearanceFrames=0;
function checkCoveredSurface(){
  const b=facility.blanket,p=body.surface.positions,ix=body.surface.indices,c=b.renderedPositions;
  const sample=(px,py,pz)=>{
    const gx=(px-BED.x+.063)/b.dx,gz=(pz-BED.z+.026)/b.dz,x=Math.floor(gx),z=Math.floor(gz);
    if(x<0||x>=b.columns-1||z<0||z>=b.rows-1)return;
    const a=(z*b.columns+x)*3+1,u=gx-x,v=gz-z;
    const height=u+v<=1?c[a]*(1-u-v)+c[a+3]*u+c[a+b.columns*3]*v:
      c[a+b.columns*3+3]*(u+v-1)+c[a+b.columns*3]*(1-u)+c[a+3]*(1-v);
    minCoveredGap=Math.min(minCoveredGap,height-py);
    assert(height-py>.00044,'entire rendered blanket clears visible skin, including triangle interiors');
  };
  for(let j=0;j<p.length;j+=3)sample(p[j],p[j+1],p[j+2]);
  for(let t=0;t<ix.length;t+=3){
    const a=ix[t]*3,b=ix[t+1]*3,c=ix[t+2]*3;
    sample((p[a]+p[b]+p[c])/3,(p[a+1]+p[b+1]+p[c+1])/3,(p[a+2]+p[b+2]+p[c+2])/3);
    for(const [j,k] of [[a,b],[b,c],[c,a]])sample((p[j]+p[k])/2,(p[j+1]+p[k+1])/2,(p[j+2]+p[k+2])/2);
  }
}
for(let i=0;i<240*10;i++){
  facility.step(PHYS.step);body.step(PHYS.step);facility.afterStep();
  assert(body.isFinite());assert(body.lastMinJacobian>=.12);
  expression.update(PHYS.step,false,false,true);
  if(i%60===0){body.updateSurface();const start=performance.now();facility.update();clearanceMs+=performance.now()-start;clearanceFrames++;checkCoveredSurface();face.update(.05,false,true);const volume=body.volumeRatio();low=Math.min(low,volume);high=Math.max(high,volume);}
  for(let j=1;j<facility.blanket.positions.length;j+=3){const y=facility.blanket.positions[j];assert(Number.isFinite(y)&&y<.115&&y>.015);clothPeak=Math.max(clothPeak,y);}
}
assert(low>.8&&high<1.2);assert(expression.sleep>.99);assert(clothPeak>BED.top+.015);
assert(Math.abs(body.center.x-BED.x)<.002);
// Measure the exposed blanket edge against the full visible skin, independently
// of the lower-resolution contact proxy. This catches inflated contact footprints.
body.updateSurface();
facility.update();checkCoveredSurface();
const contactOnly=facility.blanket.positions.slice(),blanket=facility.blanket;
new BlanketClearance().resolve(body,contactOnly,blanket.columns,blanket.rows,blanket.dx,blanket.dz);
const creaseEnergy=p=>{
  let energy=0;
  for(let z=1;z<blanket.rows-1;z++)for(let x=1;x<blanket.columns-1;x++){
    const j=(z*blanket.columns+x)*3+1;
    const laplacian=p[j-3]+p[j+3]+p[j-blanket.columns*3]+p[j+blanket.columns*3]-4*p[j];
    energy+=laplacian*laplacian;
  }
  return energy;
};
const creaseRatio=creaseEnergy(blanket.renderedPositions)/creaseEnergy(contactOnly);
assert(creaseRatio<.7,'fairing removes at least 30% of discrete crease energy');
const steepestDrop=p=>{
  let drop=0;
  // Leave out the intentionally fitted opening and anchored outer hem.
  for(let z=3;z<blanket.rows-3;z++)for(let x=3;x<blanket.columns-3;x++){
    const j=(z*blanket.columns+x)*3+1;
    drop=Math.max(drop,Math.abs(p[j]-p[j+3]),Math.abs(p[j]-p[j+blanket.columns*3]));
  }
  return drop;
};
const ridgeDropRatio=steepestDrop(blanket.renderedPositions)/steepestDrop(contactOnly);
assert(ridgeDropRatio<.5,'relaxed skirt spreads the ridge drop rather than retaining a tight cliff');
for(let j=1;j<contactOnly.length;j+=3)assert(blanket.renderedPositions[j]>=contactOnly[j],'fairing preserves the contact envelope');
const skinMaterial=new MeshBasicNodeMaterial({side:DoubleSide}),skin=new Mesh(body.surface.geometry,skinMaterial);
const ray=new Raycaster(),edgeGaps=[];
for(let x=0;x<facility.blanket.columns;x++){
  const j=x*3,p=facility.blanket.renderedPositions;
  ray.set(new Vector3(BED.x+p[j],.2,BED.z+p[j+2]),new Vector3(0,-1,0));
  const hit=ray.intersectObject(skin,false)[0];
  if(hit&&hit.point.y>BED.top+.005)edgeGaps.push(p[j+1]-hit.point.y);
}
assert(edgeGaps.length>15);
assert(Math.max(...edgeGaps)<.0012,'blanket opening hugs the visible skin within 1.2 mm');
assert(Math.min(...edgeGaps)>-.0003,'close fit does not penetrate the visible skin');
skinMaterial.dispose();
assert(facility.interact());assert(!facility.sleeping);assert(body.center.x<BED.x-.09);assert.equal(facility.action,'Go to Bed');
for(let i=0;i<240*3;i++){facility.step(PHYS.step);body.step(PHYS.step);facility.afterStep();expression.update(PHYS.step,false);if(i%60===0){body.updateSurface();face.update(.05);}}
assert.equal(expression.sleep,0);
let emptyPeak=0;for(let j=1;j<facility.blanket.positions.length;j+=3)emptyPeak=Math.max(emptyPeak,facility.blanket.positions[j]);
assert(emptyPeak<BED.top+.003,'blanket settles after getting up');
facility.reset();assert(!facility.active);facility.dispose();assert.equal(scene.children.length,0);
console.log({low,high,clothPeak,emptyPeak,minCoveredGap,creaseRatio,ridgeDropRatio,clearanceMsPerFrame:clearanceMs/clearanceFrames,edgeGapRange:[Math.min(...edgeGaps),Math.max(...edgeGaps)]});console.log('Bed support, blanket contact, sleep face, wake and shadow registration passed');
