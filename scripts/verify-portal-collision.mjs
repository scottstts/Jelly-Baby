import assert from 'node:assert/strict';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { FacilityCollision } from '../src/facilities/collision.ts';
import { FacilityShadows } from '../src/facilities/shadows.ts';
import { JellyPortal, portalCollisionBoxes } from '../src/facilities/portal/graphics.ts';
import { Vector3 } from 'three/webgpu';

function moveBody(body,x,y,z) {
  const dx=x-body.center.x,dy=y-body.center.y,dz=z-body.center.z;
  for(let i=0;i<body.x.length;i+=3) {
    body.x[i]+=dx;body.x[i+1]+=dy;body.x[i+2]+=dz;
  }
  body.previous.set(body.x);body.updateCenter();body.updateSurface();
}

const boxes=portalCollisionBoxes(0,0);
assert(boxes.length>64,'portal collision keeps a segmented housing and all solid fittings');

{
  const body=new SoftBody(loadModel()),collision=new FacilityCollision(body);
  collision.registerBoxes(boxes);moveBody(body,0,.075,0);
  assert.equal(collision.resolveBoxes(boxes),false,'the membrane aperture remains passable');
  collision.dispose();
}

{
  const body=new SoftBody(loadModel()),collision=new FacilityCollision(body);
  collision.registerBoxes(boxes);moveBody(body,.09,.075,0);
  assert.equal(collision.resolveBoxes(boxes),true,'the solid housing stops a side impact');
  collision.dispose();
}

{
  const body=new SoftBody(loadModel()),collision=new FacilityCollision(body);
  collision.registerBoxes(boxes);moveBody(body,0,.012,.020);
  assert.equal(collision.resolveBoxes(boxes),true,'the mirrored plinth and undertray stop a low impact');
  collision.dispose();
}


{
  const portal=new JellyPortal(0,-.255),causticMeshes=new Set();
  const shadows=new FacilityShadows(new Vector3(.494,-.748,-.443).normalize(),.7,{register(mesh){causticMeshes.add(mesh);}});
  shadows.add(portal.group,portal.lightingEnvelope);
  const meshes=[];portal.group.traverse(object=>{if(object.isMesh)meshes.push(object);});
  assert(meshes.length>0,'portal keeps visible shadow/caustic receiver meshes after batching');
  assert(meshes.every(mesh=>mesh.receiveCaustics),'portal hardware opts into universal caustic reception');
  assert.equal(causticMeshes.size,meshes.length,'portal registers every visible mesh with caustic reception');
  assert.equal(shadows.casters.length,meshes.length,'portal visible geometry casts into the facility ground shadow pass');
  assert.equal(shadows.surfaces.casters.length,meshes.length,'portal visible geometry casts and receives raised-surface shadows');
  shadows.dispose();portal.dispose();
}

console.log('Portal aperture, solid collision, universal shadows and caustic reception verified');
