import assert from 'node:assert/strict';
import { Scene } from 'three/webgpu';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { Locomotion } from '../src/app/locomotion.ts';
import { SwingFacility } from '../src/worlds/main/facilities/swing/facility.ts';
import { SWING } from '../src/worlds/main/facilities/swing/physics.ts';
import { TrampolineFacility } from '../src/worlds/main/facilities/trampoline/facility.ts';
import { TRAMPOLINE } from '../src/worlds/main/facilities/trampoline/physics.ts';
import { FacilityCollision, FACILITY_COLLISION_MARGIN } from '../src/facilities/collision.ts';

function settle(body,rig) {
  for(let i=0;i<480;i++){rig.step(PHYS.step);body.step(PHYS.step);rig.afterStep();}
}

function boxPenetration(body,boxes) {
  const p=body.surface.positions;let maximum=0;
  for(let i=0;i<p.length;i+=3)for(const box of boxes) {
    const dx=p[i]-box.center.x,dy=p[i+1]-box.center.y,dz=p[i+2]-box.center.z;
    const qx=dx*box.xAxis.x+dy*box.xAxis.y+dz*box.xAxis.z;
    const qy=dx*box.yAxis.x+dy*box.yAxis.y+dz*box.yAxis.z;
    const qz=dx*box.zAxis.x+dy*box.zAxis.y+dz*box.zAxis.z;
    maximum=Math.max(maximum,Math.min(box.halfSize.x-Math.abs(qx),box.halfSize.y-Math.abs(qy),box.halfSize.z-Math.abs(qz)));
  }
  return maximum;
}

function cylinderPenetration(body) {
  const p=body.surface.positions,top=TRAMPOLINE.height+TRAMPOLINE.rimCenterOffset+TRAMPOLINE.rimHalfHeight;
  let maximum=0;
  for(let i=0;i<p.length;i+=3) {
    if(p[i+1]<=PHYS.floor||p[i+1]>=top)continue;
    maximum=Math.max(maximum,TRAMPOLINE.radius+FACILITY_COLLISION_MARGIN-
      Math.hypot(p[i]-TRAMPOLINE.x,p[i+2]-TRAMPOLINE.z));
  }
  return maximum;
}

function centerVelocity(body) {
  const velocity=[0,0,0];
  for(let i=0;i<body.mass.length;i++) {
    const weight=body.mass[i]/body.totalMass,j=i*3;
    velocity[0]+=body.velocity[j]*weight;velocity[1]+=body.velocity[j+1]*weight;velocity[2]+=body.velocity[j+2]*weight;
  }
  return velocity;
}

{
  const body=new SoftBody(loadModel()),rig=new Locomotion(body);settle(body,rig);
  const facility=new SwingFacility(new Scene(),body,{add(){}});
  let firstHint=-1,firstContact=-1,maxPenetration=0;
  rig.move.set(-1,0,0);
  for(let i=0;i<720;i++) {
    rig.step(PHYS.step);body.step(PHYS.step);body.updateSurface();
    if(firstContact<0&&boxPenetration(body,facility.visual.collisionBoxes)>1e-7)firstContact=i*PHYS.step;
    facility.afterStep();
    if(firstHint<0&&facility.physics.nearby)firstHint=i*PHYS.step;
    if(i%12===0){if(body.surfaceDirty)body.updateSurface();maxPenetration=Math.max(maxPenetration,boxPenetration(body,facility.visual.collisionBoxes));}
  }
  assert(firstHint>=0&&firstContact>=0&&firstHint<firstContact,'swing hint appears before frame contact');
  assert(maxPenetration<.001,'swing frame boxes keep the visible surface out');
  facility.dispose();
}

{
  const body=new SoftBody(loadModel()),rig=new Locomotion(body);settle(body,rig);
  const facility=new SwingFacility(new Scene(),body,{add(){}}),low=Math.min(...Array.from({length:body.x.length/3},(_,i)=>body.x[i*3+1]));
  for(let i=0;i<body.x.length;i+=3){body.x[i]+=SWING.x;body.x[i+2]+=SWING.z+.035;body.x[i+1]+=PHYS.floor+.003-low;}
  body.updateCenter();body.updateSurface();body.grounded=true;
  facility.physics.angle=0;facility.physics.speed=2.5;
  const speedBefore=facility.physics.speed,velocityBefore=centerVelocity(body);
  facility.afterStep();
  const velocityAfter=centerVelocity(body);
  assert(facility.physics.speed<speedBefore-.05,'moving swing seat loses speed on body contact');
  assert(velocityAfter[2]>velocityBefore[2]+.001,'moving swing seat transfers momentum into the body');
  facility.dispose();
}

{
  const body=new SoftBody(loadModel()),rig=new Locomotion(body);settle(body,rig);
  const facility=new SwingFacility(new Scene(),body,{add(){}}),low=Math.min(...Array.from({length:body.x.length/3},(_,i)=>body.x[i*3+1]));
  for(let i=0;i<body.x.length;i+=3){body.x[i]+=SWING.x;body.x[i+2]+=SWING.z;body.x[i+1]+=PHYS.floor+.003-low;}
  body.updateCenter();body.updateSurface();body.grounded=true;
  assert(facility.visual.seatBoxes.length===5,'swing seat exposes three slats and two supports');
  const before=boxPenetration(body,facility.visual.seatBoxes);
  const beforeCenter=body.center.toArray();
  facility.afterStep();body.updateSurface();
  const after=boxPenetration(body,facility.visual.seatBoxes);
  assert(before>.001,'seat collision setup overlaps the moving seat');
  assert(after<before,'moving swing seat reduces the contact penetration');
  assert(Math.hypot(...body.center.toArray().map((value,i)=>value-beforeCenter[i]))>1e-6,'moving swing seat resolves through the deformed body');
  facility.dispose();
}

{
  const body=new SoftBody(loadModel()),rig=new Locomotion(body);settle(body,rig);
  const facility=new TrampolineFacility(new Scene(),body,{add(){}});
  let firstHint=-1,firstContact=-1,maxPenetration=0,minCenterDistance=Infinity;
  rig.move.set(1,0,0);
  for(let i=0;i<720;i++) {
    rig.step(PHYS.step);body.step(PHYS.step);body.updateSurface();
    if(firstContact<0&&cylinderPenetration(body)>1e-7)firstContact=i*PHYS.step;
    facility.afterStep();
    if(firstHint<0&&facility.physics.nearby)firstHint=i*PHYS.step;
    minCenterDistance=Math.min(minCenterDistance,Math.hypot(body.center.x-TRAMPOLINE.x,body.center.z-TRAMPOLINE.z));
    if(i%12===0){if(body.surfaceDirty)body.updateSurface();maxPenetration=Math.max(maxPenetration,cylinderPenetration(body));}
  }
  assert(firstHint>=0&&firstContact>=0&&firstHint<firstContact,'trampoline hint appears before cylinder contact');
  assert(maxPenetration<.001,'trampoline cylinder keeps the visible surface outside');
  assert(minCenterDistance>TRAMPOLINE.radius+.01,'walking body does not enter the trampoline disk');
  facility.dispose();
}

{
  const body=new SoftBody(loadModel()),facility=new SwingFacility(new Scene(),body,{add(){}});
  const box=facility.visual.collisionBoxes[0],collision=new FacilityCollision(body);
  let leading=-Infinity;
  for(let j=0;j<body.x.length;j+=3)leading=Math.max(leading,body.x[j]);
  const dx=box.center.x-box.halfSize.x-.004-leading,dy=box.center.y-body.center.y,dz=box.center.z-body.center.z;
  for(let j=0;j<body.x.length;j+=3){body.x[j]+=dx;body.x[j+1]+=dy;body.x[j+2]+=dz;body.velocity[j]=2;}
  let penetration=0;
  for(let step=0;step<12;step++) {
    body.step(PHYS.step);collision.resolveBoxes([box]);body.updateSurface();
    penetration=Math.max(penetration,boxPenetration(body,[box]));
  }
  assert(penetration<.001,'ordinary hard throw stays clear of the swing beam');
  assert(centerVelocity(body)[0]<0,'hard throw rebounds from the beam');
  facility.dispose();
}

{
  const body=new SoftBody(loadModel()),rig=new Locomotion(body);settle(body,rig);
  const facility=new SwingFacility(new Scene(),body,{add(){}}),box=facility.visual.collisionBoxes[2],collision=new FacilityCollision(body);
  // Regression for a hard, nearly tangential strike on the inclined frame. The
  // old bulk sweep repeatedly found a micrometre-scale re-entry at t~=0,
  // rewound the entire step, and left the body suspended while velocity grew.
  const start=[box.center.x-.0413790483908924,box.center.y+.03417744100270937,box.center.z+.12146645037437766];
  const velocity=[1.0418111791779852,-.06741063597842649,-3.2596108555798913];
  body.updateCenter();
  const dx=start[0]-body.center.x,dy=start[1]-body.center.y,dz=start[2]-body.center.z;
  for(let j=0;j<body.x.length;j+=3) {
    body.x[j]+=dx;body.x[j+1]+=dy;body.x[j+2]+=dz;
    body.velocity[j]=velocity[0];body.velocity[j+1]=velocity[1];body.velocity[j+2]=velocity[2];
  }
  body.previous.set(body.x);body.grounded=false;body.wake();body.updateCenter();
  for(let step=0;step<480;step++) {rig.step(PHYS.step);body.step(PHYS.step);collision.resolveBoxes([box]);}
  assert(body.grounded&&body.center.y<.04,'grazing hard throw slides off the swing frame instead of sweep-locking in mid-air');
  assert(Math.hypot(...centerVelocity(body))<.1,'grazing hard throw does not accumulate hidden velocity while pinned');
  facility.dispose();
}

console.log('Facility collision volumes, deformed-surface clearance, hard throw, grazing release and pre-contact hints verified');
