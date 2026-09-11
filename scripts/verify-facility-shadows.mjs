import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Mesh, MeshPhysicalNodeMaterial, Vector3, WebGPUCoordinateSystem } from 'three/webgpu';
import { SurfaceShadows, SURFACE_SHADOW_SIZE, SURFACE_SHADOW_BIAS } from '../src/facilities/surface-shadows.ts';
import { FacilityShadows } from '../src/facilities/shadows.ts';
import { Swing } from '../src/worlds/main/facilities/swing/graphics.ts';
import { SWING } from '../src/worlds/main/facilities/swing/physics.ts';
import { Trampoline } from '../src/worlds/main/facilities/trampoline/graphics.ts';
import { TRAMPOLINE } from '../src/worlds/main/facilities/trampoline/physics.ts';

const incoming=new Vector3(.494,-.748,-.443).normalize();
const shadows=new FacilityShadows(incoming,.7),swing=new Swing();
shadows.add(swing.group,new Box3(new Vector3(SWING.x-.10,0,SWING.z-.15),new Vector3(SWING.x+.10,SWING.height+.02,SWING.z+.15)));
const visible=[];swing.group.traverse(object=>{if(object.isMesh)visible.push(object);});
assert(visible.every(mesh=>!mesh.material.transparent),'no coplanar transparent shadow overlays remain');
let renders=0;
let projectionChecks=0,oldMappingError=0;
function verifyTableLookup(scene,camera,sources) {
  // Match Renderer._updateCamera and WebGPU's top-left framebuffer origin.
  camera.coordinateSystem=WebGPUCoordinateSystem;camera.updateProjectionMatrix();
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  assert.equal(scene.children.length,sources.length*2,'every component contributes directional and contact shadows');
  scene.children.forEach((mesh,i)=>{
    const source=sources[Math.floor(i/2)],contact=mesh.name==='facility-contact';
    assert.equal(mesh.geometry,source.geometry,'shadow uses actual visible geometry');
    const positions=mesh.geometry.attributes.position;
    for(let j=0;j<positions.count;j++) {
      const local=new Vector3().fromBufferAttribute(positions,j);
      const world=local.clone().applyMatrix4(source.matrixWorld);
      const projected=local.clone().applyMatrix4(mesh.matrixWorld);
      const t=contact?0:(-.00005-world.y)/incoming.y;
      if(contact)assert(Math.abs(projected.z-world.y)<1e-8,'contact falloff uses real height above the table');
      const tableX=world.x+incoming.x*t,tableZ=world.z+incoming.z*t;
      assert(Math.abs(projected.x-tableX)<1e-8,'X follows measured light direction');
      assert(Math.abs(projected.y-tableZ)<1e-8,'Z follows measured light direction');
      const clip=projected.project(camera);
      assert(Math.abs(clip.x)<1&&Math.abs(clip.y)<1,'full motion envelope fits fixed texture bounds');
      const rasterU=.5+.5*clip.x,rasterV=.5-.5*clip.y;
      // Use the SAME uniform matrix consumed by the table shader. This closes
      // the previous test gap between a correct projection and a mirrored lookup.
      const lookup=new Vector3(tableX,tableZ,1).applyMatrix3(shadows.worldToUVNode.value);
      assert(Math.abs(lookup.x-rasterU)<1e-8&&Math.abs(lookup.y-rasterV)<1e-8,'table lookup reaches the texel written by the shadow rasterizer');
      const oldV=(tableZ-shadows.originNode.value.y)/shadows.spanNode.value.y;
      oldMappingError=Math.max(oldMappingError,Math.abs(oldV-rasterV));projectionChecks++;
    }
  });
}
const originalTarget={},renderer={
  target:originalTarget,autoClear:false,
  getRenderTarget(){return this.target;},setRenderTarget(target){this.target=target;},
  render(scene,camera){
    renders++;verifyTableLookup(scene,camera,visible);
  },
};
shadows.update(renderer);assert.equal(renders,1);
shadows.update(renderer);assert.equal(renders,1,'idle shadow reuses its exact mask');
const origin=shadows.originNode.value.clone(),span=shadows.spanNode.value.clone();
for(const angle of [-SWING.maxAngle,-.4,0,.000001,.4,SWING.maxAngle]) {
  swing.update(angle);shadows.update(renderer);
  assert.deepEqual(shadows.originNode.value,origin);assert.deepEqual(shadows.spanNode.value,span);
}
assert.equal(renders,7,'moving seat invalidates the mask');
assert.equal(renderer.target,originalTarget);assert.equal(renderer.autoClear,false);
swing.update(.1);renderer.render=()=>{throw new Error('simulated GPU failure');};
assert.throws(()=>shadows.update(renderer),/simulated GPU failure/);
assert.equal(renderer.target,originalTarget,'failure restores the render target');assert.equal(renderer.autoClear,false);
const trampoline=new Trampoline();
const cushion=trampoline.group.getObjectByName('trampoline-cushion');
const p=cushion.geometry.attributes.position,ix=cushion.geometry.index.array,edges=new Map();
const vertexKey=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(value=>Math.round(value*1e8)).join(',');
for(let i=0;i<ix.length;i+=3)for(let e=0;e<3;e++) {
  const a=vertexKey(ix[i+e]),b=vertexKey(ix[i+(e+1)%3]),key=[a,b].sort().join('/');
  edges.set(key,(edges.get(key)??0)+1);
}
assert([...edges.values()].every(count=>count===2),'cushion is a closed manifold, including the underside and seam');
const mergedStatic=trampoline.group.children.filter(part=>part.isMesh&&(
  part.name==='trampoline-static'||part.name==='trampoline-leg'||part.name==='trampoline-foot'||part.name==='trampoline-cushion'));
assert.equal(mergedStatic.length,6,'static trampoline geometry is merged once per material');
let triangleCount=0;
for(const mesh of trampoline.group.children.filter(part=>part.isMesh))triangleCount+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
assert.equal(triangleCount,47536,'material merging preserves every trampoline triangle');
for(const foot of trampoline.group.children.filter(part=>part.name==='trampoline-foot')) {
  foot.geometry.computeBoundingBox();
  const low=foot.geometry.boundingBox.min.y+foot.position.y;
  assert(low>=0&&low<.0005,'rubber soles sit flat at the tabletop without sinking');
}
shadows.add(trampoline.group,new Box3(new Vector3(TRAMPOLINE.x-.105,0,TRAMPOLINE.z-.105),new Vector3(TRAMPOLINE.x+.105,.058,TRAMPOLINE.z+.105)));
trampoline.group.traverse(object=>{if(object.isMesh)visible.push(object);});
renderer.render=(scene,camera)=>{
  renders++;verifyTableLookup(scene,camera,visible);
  for(const name of ['trampoline-leg','trampoline-foot']) {
    const parts=trampoline.group.children.filter(part=>part.name===name);
    assert.equal(parts.length,1,'same-material supports are represented by one merged source');
    for(const part of parts) {
      assert.equal(scene.children.filter(mesh=>mesh.geometry===part.geometry&&mesh.name!=='facility-contact').length,1,'merged supports cast one complete directional shadow');
      assert(scene.children.some(mesh=>mesh.geometry===part.geometry&&mesh.name==='facility-contact'),'merged supports also contribute ground contact');
    }
  }
};
shadows.update(renderer);const beforeDeformation=renders;
trampoline.update(-.03);shadows.update(renderer);
assert.equal(renders,beforeDeformation+1,'deforming fabric invalidates shadows even with a stationary object matrix');
shadows.update(renderer);assert.equal(renders,beforeDeformation+1,'unchanged deformation reuses the shadow');
assert(oldMappingError>.25,'this regression detects the previous vertically mirrored lookup');
trampoline.dispose();
shadows.dispose();swing.dispose();
console.log('Full facility projection, WebGPU table lookup, swept bounds, idle caching and render-state restoration passed',{projectionChecks,oldMappingError});

// Raised receivers need depth ordering, not a floor-projected silhouette.
const surfaces=new SurfaceShadows(incoming,.7),group=new Group();
const caster=new Mesh(new BoxGeometry(.01,.01,.01),new MeshPhysicalNodeMaterial());
caster.position.set(0,.15,0);group.add(caster);
const receiver=caster.clone();receiver.material=caster.material.clone();
receiver.position.copy(caster.position).addScaledVector(incoming,.08);group.add(receiver);
surfaces.add(group,new Box3().setFromObject(group));
const jelly=new Mesh(new BoxGeometry(.02,.04,.02),new MeshPhysicalNodeMaterial({transmission:1}));
jelly.position.copy(caster.position).addScaledVector(incoming,.04);surfaces.addBaby(jelly);
surfaces.setGroundFootprint(shadows.spanNode.value);
const centre=new Vector3(0,.05,0).applyMatrix4(surfaces.matrixNode.value);
for(const [axis,span,step] of [[new Vector3(1,0,0),shadows.spanNode.value.x,surfaces.filterXNode.value],
  [new Vector3(0,0,1),shadows.spanNode.value.y,surfaces.filterZNode.value]]) {
  const shifted=new Vector3(0,.05,0).addScaledVector(axis,span*1.5/512).applyMatrix4(surfaces.matrixNode.value);
  assert(Math.abs((shifted.x-centre.x)*.5-step.x)<1e-12);
  assert(Math.abs((shifted.y-centre.y)*-.5-step.y)<1e-12,'surface tent spacing matches the ground filter in world metres');
}
const passes=[];
renderer.render=(scene,camera)=>{
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  passes.push(scene);
  for(const proxy of scene.children) {
    const world=new Vector3().setFromMatrixPosition(proxy.matrixWorld);
    const clip=world.clone().project(camera);
    const lookup=world.clone().applyMatrix4(surfaces.matrixNode.value);
    assert(clip.distanceTo(lookup)<1e-10,'receiver lookup uses the exact depth-raster camera');
    assert(Math.abs(clip.x)<1&&Math.abs(clip.y)<1&&clip.z>0&&clip.z<1,'raised surfaces fit the depth volume');
  }
  const front=caster.position.clone().project(camera),back=receiver.position.clone().project(camera);
  assert(Math.abs(front.x-back.x)<1e-10&&Math.abs(front.y-back.y)<1e-10,'points along incoming light share a shadow texel');
  assert(back.z>front.z+.0003,'the downstream surface receives a shadow with the configured depth bias');
};
surfaces.update(renderer);assert.equal(passes.length,2);
assert(caster.material.aoNode&&receiver.material.aoNode&&jelly.material.aoNode,'all raised materials receive indirect-light occlusion');
for(const mesh of [caster,receiver,jelly])assert.equal(mesh.material.outputNode,null,'shadowing never overrides the final material output');
assert.equal(jelly.material.transmission,1,'jelly transmission remains intact');
surfaces.update(renderer);assert.equal(passes.length,2,'idle raised maps are cached');
jelly.geometry.attributes.position.needsUpdate=true;surfaces.update(renderer);
assert.equal(passes.length,3);assert.equal(passes.at(-1),surfaces.baby,'jelly deformation updates only the jelly depth map');
group.visible=false;surfaces.update(renderer);
assert.equal(passes.length,4);assert(passes.at(-1).children.every(mesh=>!mesh.visible),'hidden parent removes facility casters');
group.visible=true;surfaces.update(renderer);
receiver.position.y+=.001;
renderer.render=()=>{throw new Error('raised shadow failure');};
assert.throws(()=>surfaces.update(renderer),/raised shadow failure/);
assert.equal(renderer.target,originalTarget);assert.equal(renderer.autoClear,false);
surfaces.dispose();caster.geometry.dispose();jelly.geometry.dispose();
for(const mesh of [caster,receiver,jelly])mesh.material.dispose();
console.log('Raised shadow depth ordering, receiver registration, deformation caching, inherited visibility and failure restoration passed');

// Numerical raster regression: the old fixed-depth PCF marks a sloped plane
// as its own blocker. Test subtexel motion, steep slopes, real blockers, and
// continuous filtering across texel boundaries without requiring a dev server.
const size=SURFACE_SHADOW_SIZE,bias=SURFACE_SHADOW_BIAS;
function samplePlane(u,v,slope,blocker=()=>0,corrected=true) {
  const depthAt=(x,y)=>.5+slope[0]*(x-.5)+slope[1]*(y-.5);
  let shadow=0;
  for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++) {
    const pixel=[u*size+x*1.5-.5,v*size+y*1.5-.5],base=pixel.map(Math.floor),fraction=pixel.map((p,i)=>p-base[i]);
    for(let by=0;by<=1;by++)for(let bx=0;bx<=1;bx++) {
    const tu=(base[0]+bx+.5)/size,tv=(base[1]+by+.5)/size;
    const stored=depthAt(tu,tv)-blocker(tu,tv);
    const reference=depthAt(u,v)+(corrected?slope[0]*(tu-u)+slope[1]*(tv-v):0)-bias;
    const weight=(bx?fraction[0]:1-fraction[0])*(by?fraction[1]:1-fraction[1])*(x===0?2:1)*(y===0?2:1)/16;
    shadow+=(reference>stored?1:0)*weight;
    }
  }
  return shadow;
}
let acneSamples=0;
for(const slope of [[0,0],[.4,-.7],[2,1],[-8,3],[12,-9]]) {
  // Receiver-plane derivatives in screen space, including a rotated UV basis.
  const dx=[.0003,.0001],dy=[-.0002,.0005],dz=[slope[0]*dx[0]+slope[1]*dx[1],slope[0]*dy[0]+slope[1]*dy[1]];
  const det=dx[0]*dy[1]-dx[1]*dy[0];
  const gradient=[(dy[1]*dz[0]-dx[1]*dz[1])/det,(dx[0]*dz[1]-dy[0]*dz[0])/det];
  assert(gradient.every((value,i)=>Math.abs(value-slope[i])<1e-10),'receiver-plane solve recovers slopes independently of the viewing angle');
  for(let step=0;step<=100;step++) {
    const u=.5+(step/100-.5)/size,v=.5+(step/137-.5)/size;
    assert.equal(samplePlane(u,v,gradient),0,'an unblocked tilted surface stays completely unshadowed through subtexel motion');
    assert(Math.abs(samplePlane(u,v,gradient,()=>.001)-1)<1e-12,'a separate blocker one millimetre ahead still casts a complete shadow');
    if(samplePlane(u,v,gradient,()=>0,false)>.01)acneSamples++;
  }
}
assert(acneSamples>100,'the regression exposes acne from the previous centre-depth comparison');
let last=0,maxStep=0;
for(let step=0;step<=2000;step++) {
  const shadow=samplePlane(.5+(step/500-2)/size,.5,[0,0],u=>u>=.5?.01:0);
  assert(shadow>=last-1e-12,'a straight shadow edge stays monotonic while crossing texels');
  maxStep=Math.max(maxStep,Math.abs(shadow-last));last=shadow;
}
assert.equal(last,1);assert(maxStep<.002,'bilinear comparison weights remove nearest-texel jumps at shadow edges');
console.log('Sloped-plane acne and continuous shadow-edge regression passed',{acneSamples,maxStep});
