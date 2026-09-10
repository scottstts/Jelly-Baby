import assert from 'node:assert/strict';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { FacilityCollision } from '../src/physics/facility-collision.ts';
import { collisionHierarchy } from '../src/physics/collision-bounds.ts';
import { BedBlanket } from '../src/game/bed-blanket.ts';
import { PHYS } from '../src/physics/constants.js';

const identity={
  xAxis:{x:1,y:0,z:0},
  yAxis:{x:0,y:1,z:0},
  zAxis:{x:0,y:0,z:1},
};
const snapshot=body=>({
  x:body.x.slice(),previous:body.previous.slice(),velocity:body.velocity.slice(),
  center:body.center.toArray(),meta:body.kernel?.meta.slice(),surface:body.surface.positions.slice(),
  surfaceDirty:body.surfaceDirty,surfaceRevision:body.surfaceRevision,lastMinJacobian:body.lastMinJacobian,
  limitedSteps:body.limitedSteps,guardedSteps:body.guardedSteps,
});
const assertSnapshot=(body,before,label)=>{
  assert.deepEqual(body.x,before.x,`${label}: positions`);
  assert.deepEqual(body.previous,before.previous,`${label}: previous positions`);
  assert.deepEqual(body.velocity,before.velocity,`${label}: velocity`);
  assert.deepEqual(body.center.toArray(),before.center,`${label}: center`);
  if(before.meta)assert.deepEqual(body.kernel.meta,before.meta,`${label}: native metadata`);
  assert.deepEqual(body.surface.positions,before.surface,`${label}: rendered surface`);
  assert.equal(body.surfaceDirty,before.surfaceDirty,`${label}: surface dirty flag`);
  assert.equal(body.surfaceRevision,before.surfaceRevision,`${label}: surface revision`);
  assert.equal(body.lastMinJacobian,before.lastMinJacobian,`${label}: jacobian metadata`);
  assert.equal(body.limitedSteps,before.limitedSteps,`${label}: limited-step count`);
  assert.equal(body.guardedSteps,before.guardedSteps,`${label}: guarded-step count`);
};

{
  const body=new SoftBody(loadModel());
  assert(body.kernel,'warmup coverage requires the native kernel');
  for(let i=0;i<80;i++)body.step(PHYS.step);
  body.updateSurface();
  const collision=new FacilityCollision(body);
  const boxes=[
    {center:{x:.16,y:.04,z:.20},...identity,halfSize:{x:.04,y:.04,z:.04}},
    {center:{x:-.16,y:.05,z:.30},...identity,halfSize:{x:.03,y:.05,z:.025}},
  ];
  const before=snapshot(body);
  const hierarchy=collisionHierarchy(body),builds=hierarchy.boundBuilds;
  hierarchy.warmup();
  assert.equal(hierarchy.boundBuilds,builds,'bounds warmup does not populate hierarchy diagnostics');
  assertSnapshot(body,before,'bounds warmup');
  collision.warmupBoxes(boxes);
  assert(collision.native,'box warmup creates the persistent facility native object');
  assertSnapshot(body,before,'box warmup');

  const cylinder=new FacilityCollision(body),cylinderBefore=snapshot(body);
  cylinder.warmupCylinderBarrier(.25,.25,.08,PHYS.floor,.12);
  assert(cylinder.native,'cylinder warmup creates the persistent facility native object');
  assertSnapshot(body,cylinderBefore,'cylinder warmup');
}

{
  const body=new SoftBody(loadModel()),reference=new SoftBody(loadModel());
  assert(body.kernel&&reference.kernel);
  const warmed=new FacilityCollision(body),cold=new FacilityCollision(reference);
  const box={center:{x:0,y:.045,z:0},...identity,halfSize:{x:.022,y:.030,z:.020}};
  warmed.warmupBoxes([box]);
  assert.equal(warmed.resolveBoxes([box]),cold.resolveBoxes([box]),'warmup does not change the next real box result');
  assert.deepEqual(body.x,reference.x,'warmup does not change post-contact positions');
  assert.deepEqual(body.velocity,reference.velocity,'warmup does not change post-contact velocity');
}

{
  const body=new SoftBody(loadModel());
  assert(body.kernel);
  body.updateSurface();
  const blanket=new BedBlanket(),beforeBody=snapshot(body),positions=blanket.positions.slice();
  const rendered=blanket.renderedPositions.slice(),version=blanket.version,renderVersion=blanket.renderVersion;
  blanket.warmup(body);
  assertSnapshot(body,beforeBody,'blanket warmup');
  assert.deepEqual(blanket.positions,positions,'blanket warmup leaves simulation cloth untouched');
  assert.deepEqual(blanket.renderedPositions,rendered,'blanket warmup leaves rendered cloth untouched');
  assert.equal(blanket.version,version,'blanket warmup leaves cloth version untouched');
  assert.equal(blanket.renderVersion,renderVersion,'blanket warmup leaves render version untouched');
}

console.log('Collision warmup: box, cylinder and blanket native paths initialize without mutating gameplay state');
