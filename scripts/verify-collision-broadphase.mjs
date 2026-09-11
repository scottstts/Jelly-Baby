import assert from 'node:assert/strict';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { FacilityCollision } from '../src/facilities/collision.ts';
import { ExhaustiveFacilityCollision } from './facility-collision-reference.mjs';
import { Swing } from '../src/worlds/main/facilities/swing/graphics.ts';
import { Bed } from '../src/worlds/main/facilities/bed/graphics.ts';
import { WearableTable } from '../src/worlds/main/facilities/wearable/graphics.ts';
import { BedBlanket } from '../src/worlds/main/facilities/bed/blanket.ts';
import { TRAMPOLINE } from '../src/worlds/main/facilities/trampoline/physics.ts';
import { PHYS } from '../src/physics/constants.js';

const body=new SoftBody(loadModel()),referenceBody=new SoftBody(loadModel());
const fast=new FacilityCollision(body),reference=new ExhaustiveFacilityCollision(referenceBody);
const rest=body.x.slice(),swing=new Swing(),bed=new Bed(new BedBlanket()),table=new WearableTable();
let seed=74913;
function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
function place(cx,cy,cz,stretch=1) {
  for(let i=0;i<rest.length;i+=3) {
    body.x[i]=rest[i]*stretch+cx;
    body.x[i+1]=rest[i+1]+cy;
    body.x[i+2]=rest[i+2]+cz;
    for(let k=0;k<3;k++)body.velocity[i+k]=random()-.5;
  }
  body.updateCenter();body.surfaceDirty=false;
  referenceBody.x.set(body.x);referenceBody.velocity.set(body.velocity);
  referenceBody.updateCenter();referenceBody.surfaceDirty=false;
}
function compare(label,resolve) {
  assert.equal(resolve(fast),resolve(reference),`${label}: contact result`);
  assert.deepEqual(body.x,referenceBody.x,`${label}: exact cage positions`);
  assert.deepEqual(body.velocity,referenceBody.velocity,`${label}: exact velocities`);
  assert.deepEqual(body.center,referenceBody.center,`${label}: center`);
  assert.equal(body.surfaceDirty,referenceBody.surfaceDirty,`${label}: dirty state`);
}
let samples=0;
const readSample=fast.readSample.bind(fast);
fast.readSample=sample=>{samples++;readSample(sample);};
for(let trial=0;trial<180;trial++) {
  swing.update((random()-.5)*2);
  const boxes=[swing.collisionBoxes,bed.boxes,table.collisionBoxes][trial%3];
  const target=boxes[trial%boxes.length].center;
  place(target.x+(random()-.5)*.18,target.y+(random()-.5)*.15,target.z+(random()-.5)*.18,.3+random()*4);
  compare(`boxes ${trial}`,solver=>solver.resolveBoxes(boxes));
  place(TRAMPOLINE.x+(random()-.5)*.4,(random()-.5)*.3,TRAMPOLINE.z+(random()-.5)*.4,.3+random()*4);
  compare(`cylinder ${trial}`,solver=>solver.resolveCylinderBarrier(TRAMPOLINE.x,TRAMPOLINE.z,TRAMPOLINE.radius,PHYS.floor,
    TRAMPOLINE.height+TRAMPOLINE.rimCenterOffset+TRAMPOLINE.rimHalfHeight));
}
// Coarse rejection must avoid every surface reconstruction, including above a facility.
for(const offset of [[3,0,3],[0,2,0]]) {
  place(...offset);samples=0;
  compare('distant boxes',solver=>solver.resolveBoxes(swing.collisionBoxes));
  assert.equal(samples,0);
  compare('distant cylinder',solver=>solver.resolveCylinderBarrier(0,0,.1,0,.1));
  assert.equal(samples,0);
}
// A first contact pushes the same sample into an initially rejected second box.
// Also exercise signed weights, partition error, and finite-mass moving contacts.
for(const weights of [[1,0,0,0],[2,-1,0,0],[1.1,0,0,0]]) {
  function fixture(Solver) {
    const fixtureBody={x:new Float64Array([-.01,0,0,0,0,0]),inverseMass:new Float64Array([1,1]),
      velocity:new Float64Array([1,0,0,0,0,0]),surface:{positions:new Float32Array([-.01,0,0]),
        bindingIds:new Uint32Array([0,1,0,1]),bindingWeights:new Float64Array(weights)},
      stabilizeContacts(){},wake(){},updateCenter(){}};
    let speed=-.5;
    const motion={velocityAt(x,y,z,out){out.x=speed;out.y=out.z=0;},inverseMassAt(){return .3;},
      applyImpulse(x,y,z,ix){speed+=ix*.3;}};
    const box=(x,hx)=>({center:{x,y:0,z:0},halfSize:{x:hx,y:1,z:1},
      xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},zAxis:{x:0,y:0,z:1},motion});
    const solver=new Solver(fixtureBody);
    solver.resolveBoxes([box(0,.04),box(-.05,.015)]);
    return {x:fixtureBody.x,velocity:fixtureBody.velocity,speed};
  }
  assert.deepEqual(fixture(FacilityCollision),fixture(ExhaustiveFacilityCollision),'contact chain and signed bindings match');
}

// Warm both paths; report medians without imposing machine-dependent timing assertions.
delete fast.readSample;
const timedFast=new FacilityCollision(body),timedReference=new ExhaustiveFacilityCollision(referenceBody);
function benchmark(label,resolve,reset=false) {
  const initialX=body.x.slice(),initialVelocity=body.velocity.slice();
  const measure=solver=>{
    const run=()=>{
      if(reset){solver.body.x.set(initialX);solver.body.velocity.set(initialVelocity);solver.body.updateCenter();}
      resolve(solver);
    };
    for(let i=0;i<150;i++)run();
    const times=[];
    for(let batch=0;batch<7;batch++) {
      const start=performance.now();
      for(let i=0;i<500;i++)run();
      times.push((performance.now()-start)/500);
    }
    return times.sort((a,b)=>a-b)[3];
  };
  const before=measure(timedReference),after=measure(timedFast);
  console.log(`${label}: exhaustive ${before.toFixed(4)} ms/call, optimized ${after.toFixed(4)} ms/call (${(before/after).toFixed(1)}x)`);
}
place(0,2,0);
benchmark('Above swing',solver=>solver.resolveBoxes(swing.collisionBoxes));
benchmark('Above trampoline',solver=>solver.resolveCylinderBarrier(0,0,.1,0,.1));
// Inside the swing's original proximity gate.
place(swing.collisionBoxes[0].center.x+.12,0,swing.collisionBoxes[0].center.z);
benchmark('Beside swing',solver=>solver.resolveBoxes(swing.collisionBoxes));
const seat=swing.seatBoxes[0].center;
place(seat.x,seat.y,seat.z);
benchmark('Swing contact (identical reset state)',solver=>solver.resolveBoxes(swing.collisionBoxes),true);
swing.dispose();bed.dispose();table.dispose();
console.log('Broad-phase equivalence: 360 deformed-body cases match exactly; distant/elevated cases reconstruct zero samples.');
