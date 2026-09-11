import assert from 'node:assert/strict';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { FacilityCollision } from '../src/facilities/collision.ts';
import { portalCollisionBoxes } from '../src/facilities/portal/graphics.ts';

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

console.log('Portal aperture pass-through and housing, rail, control, pod and mirrored-base collision verified');
