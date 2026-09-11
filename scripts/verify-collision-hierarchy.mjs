import assert from "node:assert/strict";
import { loadModel } from "./load-model.mjs";
import { SoftBody } from "../src/physics/soft-body.js";
import { FacilityCollision } from "../src/facilities/collision.ts";
import { collisionHierarchy, bodyCollisionBounds, boxBounds, facilityBoxBounds } from "../src/facilities/collision-bounds.ts";
import { Swing } from "../src/worlds/main/facilities/swing/graphics.ts";
import { SwingPhysics } from "../src/worlds/main/facilities/swing/physics.ts";
import { Bed } from "../src/worlds/main/facilities/bed/graphics.ts";
import { WearableTable } from "../src/worlds/main/facilities/wearable/graphics.ts";
import { BedBlanket } from "../src/worlds/main/facilities/bed/blanket.ts";
import { TRAMPOLINE } from "../src/worlds/main/facilities/trampoline/physics.ts";
import { PHYS } from "../src/physics/constants.js";

const body=new SoftBody(loadModel()),reference=new SoftBody(loadModel());
assert(body.kernel&&reference.kernel);
const world=collisionHierarchy(body),swing=new Swing(),refSwing=new Swing();
const motion=new SwingPhysics(body),refMotion=new SwingPhysics(reference);
swing.update(0,motion.seatCollisionMotion);refSwing.update(0,refMotion.seatCollisionMotion);
const bed=new Bed(new BedBlanket()),table=new WearableTable();
const cylinder=[TRAMPOLINE.x,TRAMPOLINE.z,TRAMPOLINE.radius,PHYS.floor,
  TRAMPOLINE.height+TRAMPOLINE.rimCenterOffset+TRAMPOLINE.rimHalfHeight];
const grouped=Array.from({length:4},()=>new FacilityCollision(body));
const direct=Array.from({length:4},()=>new FacilityCollision(reference));
grouped[0].registerBoxes(table.collisionBoxes);grouped[1].registerBoxes(swing.collisionBoxes);
grouped[2].registerCylinder(...cylinder);grouped[3].registerBoxes(bed.boxes);
const boxes=[table.collisionBoxes,swing.collisionBoxes,null,bed.boxes];
const refBoxes=[table.collisionBoxes,refSwing.collisionBoxes,null,bed.boxes];
const resolve=(solver,index,volumes)=>index===2?solver.resolveCylinderBarrier(...cylinder):solver.resolveBoxes(volumes[index]);
let seed=15083;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function place(cx,cy,cz,scale=1){
  body.reset();reference.reset();
  for(let j=0;j<body.x.length;j+=3){body.x[j]=body.rest[j]*scale+cx;body.x[j+1]=body.rest[j+1]+cy;body.x[j+2]=body.rest[j+2]*scale+cz;}
  body.previous.set(body.x);body.velocity.fill(.05);
  reference.x.set(body.x);reference.previous.set(body.previous);reference.velocity.set(body.velocity);
  body.updateCenter();reference.updateCenter();
}
let contacts=0;
for(let trial=0;trial<80;trial++){
  const angle=(random()-.5)*2;swing.update(angle,motion.seatCollisionMotion);refSwing.update(angle,refMotion.seatCollisionMotion);
  motion.speed=refMotion.speed=(random()-.5)*6;
  place((random()-.5)*.6,(random()-.3)*.16,(random()-.2)*.55,.3+random()*3);
  const computed=new Float64Array(6);bodyCollisionBounds(body,world.magnitude,world.error,computed);
  assert.deepEqual(body.kernel.collisionBounds(world.magnitude,world.error),computed,"JS/native enclosure");
  world.begin();
  try{for(let i=0;i<4;i++){
    const changed=resolve(grouped[i],i,boxes);contacts+=changed;
    assert.equal(changed,resolve(direct[i],i,refBoxes));
    assert.deepEqual(body.x,reference.x,`positions ${trial}/${i}`);
    assert.deepEqual(body.velocity,reference.velocity,`velocities ${trial}/${i}`);
    assert.equal(body.guardedSteps,reference.guardedSteps);assert.equal(body.limitedSteps,reference.limitedSteps);
  }}finally{world.end();}
  assert.equal(motion.speed,refMotion.speed);
}
assert(contacts>10);
// Outside the world and between facilities: zero kernel dispatches, one enclosure.
for(const [x,y,z,level] of [[3,0,3,"world"],[0,0,.1,"facility"]]){
  place(x,y,z);
  const saved=grouped.map(solver=>solver.nativeKernel);
  for(const solver of grouped)solver.nativeKernel=()=>{throw new Error("Rejected group dispatched a contact kernel");};
  const builds=world.boundBuilds,rejections=level==="world"?world.worldRejects:world.facilityRejects;
  world.begin();try{for(let i=0;i<4;i++)assert.equal(resolve(grouped[i],i,boxes),false);}finally{world.end();}
  assert.equal(world.boundBuilds-builds,1,"one cage enclosure for the entire pass");
  assert.equal((level==="world"?world.worldRejects:world.facilityRejects)-rejections,4,`${level} rejection`);
  grouped.forEach((solver,i)=>{solver.nativeKernel=saved[i];});
}
// Cache is not retained across direct calls or batches.
place(3,0,3);assert.equal(grouped[1].mayCollide(),false);
for(let j=0;j<body.x.length;j+=3){body.x[j]-=3.155;body.x[j+2]-=3.035;}
assert.equal(grouped[1].mayCollide(),true);

const box=(x,hx)=>({center:{x,y:.04,z:0},halfSize:{x:hx,y:.2,z:.2},
  xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},zAxis:{x:0,y:0,z:1}});
// A fast throw fully crosses a thin piece: the current AABB alone misses it.
for(const fallback of [false,true]){
  const b=new SoftBody(loadModel());if(fallback)b.kernel=null;
  b.previous.set(b.rest);
  for(let j=0;j<b.x.length;j+=3){b.previous[j]=b.rest[j]-.2;b.x[j]=b.rest[j]+.2;b.velocity[j]=96;}
  const solver=new FacilityCollision(b),wall=[box(0,.001)];solver.registerBoxes(wall);
  assert(solver.resolveBoxes(wall),"swept gate admits a fully crossed obstacle");
  assert(b.center.x<0,"throw stopped on the approach side");solver.dispose();
}
// A contact in one facility moves a sample into another: rebuild the enclosure.
for(const weights of [[1,0,0,0],[2,-1,0,0],[1.1,0,0,0]]){
  const b={x:new Float64Array([-.01,.04,0,0,.04,0]),inverseMass:new Float64Array([1,1]),velocity:new Float64Array(6),
    surface:{positions:new Float32Array([-.01,.04,0]),bindingIds:new Uint32Array([0,1,0,1]),bindingWeights:new Float64Array(weights)},
    stabilizeContacts(){},wake(){},updateCenter(){}};
  const first=new FacilityCollision(b),second=new FacilityCollision(b),w=collisionHierarchy(b);
  const one=[box(0,.04)],two=[box(-.05,.015)];first.registerBoxes(one);second.registerBoxes(two);
  w.begin();assert(first.resolveBoxes(one));const count=w.boundBuilds;assert(second.resolveBoxes(two));assert(w.boundBuilds>count);w.end();
  first.dispose();second.dispose();
}
// Full pendulum orbit remains inside its registered envelope, including all corners.
const envelope=facilityBoxBounds(swing.collisionBoxes,.002);
for(let i=0;i<=64;i++){
  swing.update(i*Math.PI*2/64,motion.seatCollisionMotion);
  for(const part of swing.collisionBoxes){
    const bounds=new Float64Array(6);boxBounds(part,.002,bounds);
    for(let a=0;a<3;a++)assert(bounds[a]>=envelope[a]-1e-9&&bounds[a+3]<=envelope[a+3]+1e-9);
  }
}
// Non-orthogonal axes: use inverse slabs, not the orthonormal shortcut.
const skew=box(0,.04);skew.xAxis={x:1,y:.6,z:.1};skew.yAxis={x:.2,y:1,z:.3};
const bounds=new Float64Array(6);boxBounds(skew,.002,bounds);
// Independently verify projected points from the inverse of the three axis rows.
import { Matrix3, Vector3 } from "three/webgpu";
const a=skew.xAxis,b=skew.yAxis,c=skew.zAxis,matrix=new Matrix3().set(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z).invert();
for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
  const p=new Vector3(x*(skew.halfSize.x+.002),y*(skew.halfSize.y+.002),z*(skew.halfSize.z+.002)).applyMatrix3(matrix).add(new Vector3(0,.04,0));
  for(let axis=0;axis<3;axis++)assert(p.getComponent(axis)>=bounds[axis]&&p.getComponent(axis)<=bounds[axis+3]);
}

// The baseline bypasses group gates, retaining the same native contact kernel.
place(0,0,.1);swing.update(0);refSwing.update(0);
function measure(run){for(let i=0;i<100;i++)run();const times=[];for(let batch=0;batch<5;batch++){const start=performance.now();for(let i=0;i<1000;i++)run();times.push((performance.now()-start)/1000);}return times.sort((a,b)=>a-b)[2];}
for(const [label,x,z] of [["Outside all facilities",3,3],["Clear between facilities",0,.1]]){
  place(x,0,z);
  const before=measure(()=>{for(let i=0;i<4;i++)resolve(direct[i],i,refBoxes);});
  const after=measure(()=>{world.begin();for(let i=0;i<4;i++)resolve(grouped[i],i,boxes);world.end();});
  console.log(`${label}: per-piece only ${before.toFixed(4)} ms, hierarchy ${after.toFixed(4)} ms (${(before/after).toFixed(2)}x)`);
}
for(const solver of grouped)solver.dispose();assert.equal(world.groups.size,0);
swing.dispose();refSwing.dispose();bed.dispose();table.dispose();
console.log(`PASS: ${contacts} contacts in 320 facility comparisons; world/group rejection, swept throws, cache invalidation, signed weights, pendulum envelope and skew axes`);
