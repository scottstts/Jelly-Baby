import assert from 'node:assert/strict';
import { Box3, Group, Quaternion, Scene, Vector3 } from 'three/webgpu';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { Locomotion } from '../src/game/locomotion.ts';
import { HEAD_WEARABLES, WEARABLE_TABLE } from '../src/game/wearable-physics.ts';
import { CarriedWearableFacility, WearableFacility } from '../src/game/wearable-facility.ts';
import { BedFacility } from '../src/game/bed-facility.ts';
import { BED } from '../src/game/bed-physics.ts';

function moveBody(body,x,z) {
  const dx=x-body.center.x,dz=z-body.center.z;
  for(let i=0;i<body.x.length;i+=3){body.x[i]+=dx;body.x[i+2]+=dz;}
  body.updateCenter();body.updateSurface();body.grounded=true;body.wake();
}

function boxPenetration(body,box) {
  const positions=body.surface.positions;let maximum=0;
  for(let i=0;i<positions.length;i+=3) {
    const dx=positions[i]-box.center.x,dy=positions[i+1]-box.center.y,dz=positions[i+2]-box.center.z;
    const qx=dx*box.xAxis.x+dy*box.xAxis.y+dz*box.xAxis.z;
    const qy=dx*box.yAxis.x+dy*box.yAxis.y+dz*box.yAxis.z;
    const qz=dx*box.zAxis.x+dy*box.zAxis.y+dz*box.zAxis.z;
    maximum=Math.max(maximum,Math.min(box.halfSize.x-Math.abs(qx),box.halfSize.y-Math.abs(qy),box.halfSize.z-Math.abs(qz)));
  }
  return maximum;
}

function tiltBody(body,angle) {
  const c=body.center.clone(),q=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),angle),p=new Vector3();
  for(let i=0;i<body.x.length;i+=3) {
    p.set(body.x[i]-c.x,body.x[i+1]-c.y,body.x[i+2]-c.z).applyQuaternion(q);
    body.x[i]=c.x+p.x;body.x[i+1]=c.y+p.y;body.x[i+2]=c.z+p.z;
  }
  body.previous.set(body.x);body.updateCenter();body.surfaceDirty=true;
}

function objectUp(object) {
  return new Vector3(0,1,0).applyQuaternion(object.quaternion).normalize();
}

const scene=new Scene(),babyGroup=new Group(),body=new SoftBody(loadModel()),rig=new Locomotion(body);
scene.add(babyGroup);
let shadowGroup,shadowEnvelope;
const facility=new WearableFacility(scene,body,babyGroup,rig,{add(group,envelope){shadowGroup=group;shadowEnvelope=envelope;}});
assert.equal(shadowGroup,facility.visual.group,'table registers its complete visual group for shadows');
assert(shadowEnvelope.containsBox(new Box3().setFromObject(facility.visual.group)),'shadow envelope contains the table and its wearables');
assert.equal(facility.visual.collisionBoxes.length,5,'table uses a slab plus four fitted leg collision boxes');
const topBoxes=facility.visual.collisionBoxes.filter(box=>box.halfSize.y<.01),legBoxes=facility.visual.collisionBoxes.filter(box=>box.halfSize.y>.02);
assert.equal(topBoxes.length,1,'one tabletop slab collision box');
assert.equal(legBoxes.length,4,'four simple leg collision boxes');
facility.visual.group.traverse(object=>{
  if(!object.isMesh)return;
  assert(object.castShadow&&object.receiveShadow,`${object.name} has full shadow flags`);
  for(const value of object.geometry.attributes.position.array)assert(Number.isFinite(value),`${object.name} has finite geometry`);
});
assert.deepEqual(facility.visual.items.map(item=>item.root.name),['floral-crown','top-hat','baseball-cap']);
assert.deepEqual(HEAD_WEARABLES.map(item=>item.scale),[.016,.0144,.0125],'wearable scales match the tuned fit sizes');
assert.deepEqual(HEAD_WEARABLES.map(item=>item.headLift),[-.0022,-.0003,.0038],'hat and cap use their fitted non-intersecting head heights');
assert.deepEqual(HEAD_WEARABLES.map(item=>item.headForward),[0,0,-.0042],'baseball cap seating accounts for its built-in tilt instead of pushing the rear rim into the head');

moveBody(body,WEARABLE_TABLE.x+HEAD_WEARABLES[0].slotX,WEARABLE_TABLE.z);
assert.equal(facility.physics.availableIndex,0,'nearest slot is the floral crown');
assert(Number.isFinite(facility.interactionDistance));
assert.equal(facility.action,'Wear Floral Crown');assert.equal(facility.mobileAction,'Wear Floral Crown');
assert(facility.interact(),'wear interaction succeeds');
assert.equal(facility.physics.wornIndex,0);assert.equal(facility.visual.items[0].root.parent,babyGroup);
facility.update();babyGroup.updateWorldMatrix(true,true);
let wornBounds=new Box3().setFromObject(facility.visual.items[0].root);
assert(wornBounds.min.toArray().every(Number.isFinite)&&wornBounds.max.toArray().every(Number.isFinite),'worn crown follows a finite head anchor');
assert(wornBounds.min.y<body.center.y+.07,'crown sits down on the head instead of floating high above it');

moveBody(body,WEARABLE_TABLE.x+HEAD_WEARABLES[1].slotX,WEARABLE_TABLE.z);
assert.equal(facility.physics.swapIndex,1,'an equipped item can be swapped for the nearby table item');
assert.equal(facility.action,'Swap to Top Hat');assert.equal(facility.mobileAction,'Swap to Top Hat');
assert(facility.interact(),'swap interaction succeeds');
assert.equal(facility.physics.wornIndex,1);assert.equal(facility.visual.items[1].root.parent,babyGroup,'top hat is now worn');
assert.equal(facility.visual.items[0].root.parent,facility.visual.group,'previous crown returns to the table');
assert.equal(facility.visual.items[0].root.position.x,HEAD_WEARABLES[0].slotX,'swapped-off crown returns to its original slot');

let jumpEvents=0;rig.onJump=()=>{jumpEvents++;facility.jumpFromNormalLocomotion();};
rig.jump();rig.step(PHYS.step);assert.equal(jumpEvents,1,'only the normal locomotion jump emits the accessory event');
let peak=0;for(let i=0;i<240;i++){facility.step(PHYS.step);peak=Math.max(peak,facility.physics.hopOffset);}
assert(peak>.0055&&peak<.0066,`wearable detachment peaks at a few millimetres rather than a self-propelled leap (${peak})`);
assert.equal(facility.physics.hopOffset,0,'wearable lands back on the head');

facility.update();
const beforeTiltUp=objectUp(facility.visual.items[1].root);
tiltBody(body,.45);facility.update();
const afterTiltUp=objectUp(facility.visual.items[1].root);
assert(afterTiltUp.y<beforeTiltUp.y-.04,'worn item rotates in the jelly frame rather than staying world upright');
assert(afterTiltUp.angleTo(new Vector3(0,1,0))>.08,'worn item visibly follows the jelly tilt');

moveBody(body,BED.x,BED.z);
const bed=new BedFacility(scene,body,{add(){}});
assert(bed.interact(),'bed can be entered near the mattress');
facility.syncBedOccupancy(bed.active);
assert.equal(facility.physics.wornIndex,null,'going to bed auto-removes the worn item');
assert.equal(facility.visual.items[1].root.parent,facility.visual.group,'the removed top hat returns to the table');
assert.equal(facility.visual.items[1].root.position.x,HEAD_WEARABLES[1].slotX,'bed removal parks the hat in its home slot');
assert(bed.interact(),'bed can be exited');
assert.equal(facility.physics.wornIndex,null,'getting off bed does not auto-re-equip the item');

// Portal travel must preserve the equipped item while the dressing table stays
// in the playroom. The toy-world proxy is only a fallback take-off interaction.
moveBody(body,WEARABLE_TABLE.x+HEAD_WEARABLES[2].slotX,WEARABLE_TABLE.z);
assert(facility.interact(),'baseball cap can be equipped for travel');
const carried=new CarriedWearableFacility(facility);
assert(facility.persistAcrossTravel&&carried.persistAcrossTravel,'wearable state is explicitly portal-persistent');
moveBody(body,.65,-.55);carried.update();babyGroup.updateWorldMatrix(true,true);
assert.equal(facility.physics.wornIndex,2,'equipped cap remains worn after moving into another world');
assert.equal(facility.visual.items[2].root.parent,babyGroup,'carried cap remains parented to the shared baby root');
assert(Number.isFinite(carried.interactionDistance)&&carried.interactionDistance>1e6,'toy take-off is a fallback behind nearby facilities');
assert.equal(carried.action,'Take off Baseball Cap');
assert(carried.interact(),'carried attire can be taken off with the shared interaction');
assert.equal(facility.physics.wornIndex,null);
assert.equal(facility.visual.items[2].root.parent,facility.visual.group,'toy-world take-off reparents the cap to the hidden dressing table');
assert.equal(facility.visual.items[2].root.position.x,HEAD_WEARABLES[2].slotX,'carried cap returns to its original dressing-table slot');

const collisionBody=new SoftBody(loadModel()),collisionRig=new Locomotion(collisionBody);
const collisionFacility=new WearableFacility(new Scene(),collisionBody,new Group(),collisionRig,{add(){}});
const frontLeg=collisionFacility.visual.collisionBoxes[1];
let forwardExtent=-Infinity;
for(let i=2;i<collisionBody.surface.positions.length;i+=3)forwardExtent=Math.max(forwardExtent,collisionBody.surface.positions[i]-collisionBody.center.z);
moveBody(collisionBody,frontLeg.center.x,frontLeg.center.z-frontLeg.halfSize.z-forwardExtent+.002);
const legBefore=boxPenetration(collisionBody,frontLeg);
collisionFacility.afterStep();collisionBody.updateSurface();
const legAfter=boxPenetration(collisionBody,frontLeg);
assert(legBefore>.001,'front leg test begins with a deliberate shallow surface penetration');
assert(legAfter<legBefore&&legAfter<.001,'fitted table leg resolves the shallow walk-in contact');
collisionFacility.dispose();bed.dispose();facility.reset();facility.dispose();
console.log('Wearable table swapping, portal carry/take-off return, tuned fit, head-frame detachment, bed return, shadows and collision passed',{peak,legBefore,legAfter});
