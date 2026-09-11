import assert from "node:assert/strict";
import { loadModel } from "./load-model.mjs";
import { SoftBody } from "../src/physics/soft-body.js";
import { FacilityCollision } from "../src/facilities/collision.ts";
import { stopFacilityThrow } from "../src/facilities/throw.ts";
import { Swing } from "../src/worlds/main/facilities/swing/graphics.ts";
import { SwingPhysics } from "../src/worlds/main/facilities/swing/physics.ts";
import { BlanketContact } from "../src/worlds/main/facilities/bed/contact.ts";
import { BlanketClearance } from "../src/worlds/main/facilities/bed/clearance.ts";
import { BedPhysics, BED } from "../src/worlds/main/facilities/bed/physics.ts";
import { BedBlanket } from "../src/worlds/main/facilities/bed/blanket.ts";
import { PHYS } from "../src/physics/constants.js";

const body=new SoftBody(loadModel()),reference=new SoftBody(loadModel());
assert(body.kernel&&reference.kernel);
const native=new FacilityCollision(body),js=new FacilityCollision(reference);
js.nativeKernel=()=>null; // Same JS broad phase and throw sweep, native orientation on both.
const swing=new Swing(),refSwing=new Swing(),motion=new SwingPhysics(body),refMotion=new SwingPhysics(reference);
const rest=body.rest.slice();
let seed=73491,contacts=0,throws=0,movingContacts=0;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let trial=0;trial<90;trial++){
  body.reset();reference.reset();
  const angle=(random()-.5)*1.7;swing.update(angle,motion.seatCollisionMotion);refSwing.update(angle,refMotion.seatCollisionMotion);
  motion.speed=refMotion.speed=(random()-.5)*8;
  const target=swing.collisionBoxes[trial%swing.collisionBoxes.length].center;
  const tx=target.x+(random()-.5)*.1,ty=target.y+(random()-.5)*.1,tz=target.z+(random()-.5)*.1;
  const speed=trial%3===0?3:.2;
  for(let j=0;j<body.x.length;j+=3){
    body.x[j]=rest[j]+tx;body.x[j+1]=rest[j+1]+ty;body.x[j+2]=rest[j+2]+tz;
    body.velocity[j]=speed;body.velocity[j+1]=-.1;body.velocity[j+2]=speed*.3;
    for(let k=0;k<3;k++)body.previous[j+k]=body.x[j+k]-body.velocity[j+k]*PHYS.step;
  }
  reference.x.set(body.x);reference.previous.set(body.previous);reference.velocity.set(body.velocity);
  body.updateCenter();reference.updateCenter();
  js.findCandidates(refSwing.collisionBoxes,.002);
  const swept=stopFacilityThrow({...reference,x:reference.x.slice(),velocity:reference.velocity.slice()},js.vertices,js.candidates,.002);
  throws+=swept;
  const speedBefore=motion.speed;
  const changed=native.resolveBoxes(swing.collisionBoxes);contacts+=changed;
  movingContacts+=motion.speed!==speedBefore;
  assert.equal(changed,js.resolveBoxes(refSwing.collisionBoxes),`boxes ${trial}`);
  assert.deepEqual(body.x,reference.x,`positions ${trial}`);
  assert.deepEqual(body.velocity,reference.velocity,`velocity ${trial}`);
  assert.equal(motion.speed,refMotion.speed,`pendulum ${trial}`);
  assert.equal(body.lastMinJacobian,reference.lastMinJacobian);
  assert.equal(body.limitedSteps,reference.limitedSteps);
  assert.equal(body.guardedSteps,reference.guardedSteps);
  assert.equal(native.resolveCylinderBarrier(tx,tz,.045,ty-.1,ty+.1),js.resolveCylinderBarrier(tx,tz,.045,ty-.1,ty+.1));
  assert.deepEqual(body.x,reference.x,`cylinder positions ${trial}`);
  assert.deepEqual(body.velocity,reference.velocity,`cylinder velocity ${trial}`);
}
assert(contacts>10&&throws>0&&movingContacts>0,"exercise contacts, throw sweeps and pendulum impulses");
// A custom callback motion must fall back for the whole pass, even after native use.
const custom=boxes=>boxes.map(box=>({...box,motion:box.motion?{
  velocityAt:box.motion.velocityAt,inverseMassAt:box.motion.inverseMassAt,applyImpulse:box.motion.applyImpulse,
}:undefined}));
const customBoxes=custom(swing.collisionBoxes),refCustomBoxes=custom(refSwing.collisionBoxes);
assert.equal(native.native.resolveBoxes(customBoxes,.002),null);
assert.equal(native.resolveBoxes(customBoxes),js.resolveBoxes(refCustomBoxes));
assert.deepEqual(body.x,reference.x);assert.deepEqual(body.velocity,reference.velocity);assert.equal(motion.speed,refMotion.speed);
console.log(`Exact facility parity: ${contacts} contacting poses, ${throws} throw sweeps, ${movingContacts} pendulum impulses, 90 cylinder passes, custom-motion fallback`);

const blanket=new BedBlanket(),bed=new BedPhysics(body),sample=new BlanketContact(),clearance=new BlanketClearance();
body.reset();for(let j=0;j<body.x.length;j+=3){body.x[j]+=BED.x;body.x[j+2]+=BED.z;}
body.updateCenter();body.grounded=true;assert(bed.toggle());
const grid=[blanket.columns,blanket.rows,blanket.dx,blanket.dz];
const heights=new Float64Array(blanket.columns*blanket.rows),refHeights=heights.slice();
const cloth=blanket.positions.slice(),refCloth=cloth.slice();
const withJS=fn=>{const kernel=body.kernel;body.kernel=null;try{return fn();}finally{body.kernel=kernel;}};
for(let pose=0;pose<6;pose++){
  for(let step=0;step<40;step++){bed.step(PHYS.step);body.step(PHYS.step);}
  body.updateSurface();
  heights.fill(BED.top);refHeights.set(heights);
  sample.sample(body,heights,...grid);withJS(()=>sample.sample(body,refHeights,...grid));
  assert.deepEqual(heights,refHeights,`blanket contact ${pose}`);
  cloth.set(blanket.positions);refCloth.set(cloth);
  assert.equal(clearance.resolve(body,cloth,...grid),withJS(()=>clearance.resolve(body,refCloth,...grid)));
  assert.deepEqual(cloth,refCloth,`exact Float32 clearance ${pose}`);
}
// Reuse the same kernel with smaller and larger grids; no stale tail may leak.
for(const [columns,rows] of [[17,13],[65,57],[17,13]]){
  const dimensions=[columns,rows,.126/(columns-1),.098/(rows-1)];
  const h=new Float64Array(columns*rows).fill(BED.top),rh=h.slice();
  sample.sample(body,h,...dimensions);withJS(()=>sample.sample(body,rh,...dimensions));assert.deepEqual(h,rh);
  const c=new Float32Array(columns*rows*3).fill(BED.top),rc=c.slice();
  assert.equal(clearance.resolve(body,c,...dimensions),withJS(()=>clearance.resolve(body,rc,...dimensions)));assert.deepEqual(c,rc);
}
// Empty overlap and already-clear cloth.
for(let j=0;j<body.x.length;j+=3)body.x[j]+=2;
body.updateSurface();heights.fill(BED.top);refHeights.set(heights);
sample.sample(body,heights,...grid);withJS(()=>sample.sample(body,refHeights,...grid));assert.deepEqual(heights,refHeights);
assert.equal(clearance.resolve(body,cloth,...grid),false);
console.log("Exact blanket parity: six deformed bed poses plus no-overlap rejection");

// Simple medians, including JS/WASM boundary and small grid copies. No timing threshold.
function time(fn,iterations){
  for(let i=0;i<12;i++)fn();
  const batches=[];
  for(let batch=0;batch<5;batch++){const start=performance.now();for(let i=0;i<iterations;i++)fn();batches.push((performance.now()-start)/iterations);}
  return batches.sort((a,b)=>a-b)[2];
}
function benchmark(label,nativeRun,jsRun,iterations=40){
  const jsMs=time(jsRun,iterations),nativeMs=time(nativeRun,iterations);
  console.log(`${label}: JS ${jsMs.toFixed(3)} ms, WASM ${nativeMs.toFixed(3)} ms, ${(jsMs/nativeMs).toFixed(2)}x`);
}
// Keep orientation history identical across repetitions by restoring rest first.
const prepare=b=>{
  b.x.set(rest);b.previous.set(rest);b.velocity.fill(0);b.stabilizeContacts();
  for(let j=0;j<b.x.length;j+=3){b.x[j]+=-.155;b.x[j+1]+=.015;b.x[j+2]+=-.035;}
  b.previous.set(b.x);b.updateCenter();
};
swing.update(0);refSwing.update(0);
benchmark("Swing contact (including pose reset)",()=>{prepare(body);native.resolveBoxes(swing.collisionBoxes);},()=>{prepare(reference);js.resolveBoxes(refSwing.collisionBoxes);});
bed.active=false;body.reset();for(let j=0;j<body.x.length;j+=3){body.x[j]+=BED.x;body.x[j+2]+=BED.z;}
body.updateCenter();body.grounded=true;bed.toggle();
for(let i=0;i<120;i++){bed.step(PHYS.step);body.step(PHYS.step);}body.updateSurface();
benchmark("Blanket contact",()=>{heights.fill(BED.top);sample.sample(body,heights,...grid);},()=>{heights.fill(BED.top);withJS(()=>sample.sample(body,heights,...grid));});
benchmark("Exact blanket clearance",()=>{cloth.set(blanket.positions);clearance.resolve(body,cloth,...grid);},()=>{cloth.set(blanket.positions);withJS(()=>clearance.resolve(body,cloth,...grid));},5);
