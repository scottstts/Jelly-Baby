import assert from 'node:assert/strict';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { TricyclePhysics } from '../src/worlds/toy-track/facilities/tricycle/physics.ts';
import { box, TRACK_START } from '../src/worlds/toy-track/layout.ts';
import { Locomotion } from '../src/app/locomotion.ts';
import { FaceExpression } from '../src/graphics/character/face-expression.ts';
import { Tricycle } from '../src/worlds/toy-track/facilities/tricycle/graphics.ts';
import { ToyTrack } from '../src/worlds/toy-track/graphics/track.ts';
import { tricycleCircleCollider } from '../src/worlds/toy-track/facilities/tricycle/collision.ts';
import { Vector3, Mesh } from 'three/webgpu';

const body=new SoftBody(loadModel()),rig=new Locomotion(body),obstacles=[];
const bike=new TricyclePhysics(body,obstacles);
assert(!bike.toggle(),'cannot board from a distance');
for(let j=0;j<body.x.length;j+=3){body.x[j]+=TRACK_START.x;body.x[j+2]+=TRACK_START.z;}
body.updateCenter();body.grounded=true;assert(bike.toggle());
bike.yaw=0;bike.throttle=1;
let minVolume=Infinity,maxVolume=0,maxError=0;
for(let i=0;i<240*4;i++) {
  bike.step(PHYS.step);body.step(PHYS.step);
  assert(body.isFinite());assert(body.lastMinJacobian>=.12,'orientation retained under drive');
  if(i%120===0){const volume=body.volumeRatio();minVolume=Math.min(minVolume,volume);maxVolume=Math.max(maxVolume,volume);}
  if(i>240)maxError=Math.max(maxError,Math.hypot(body.center.x-bike.position.x,body.center.z-bike.position.z));
}
assert(bike.speed>.25&&bike.speed<=.34);assert(bike.laughing);
assert(minVolume>.8&&maxVolume<1.2);assert(maxError<.025,'rider remains seated');
const beforeYaw=bike.yaw;bike.turn=1;
for(let i=0;i<240;i++){bike.step(PHYS.step);body.step(PHYS.step);}
assert(bike.yaw>beforeYaw+.5,'steering changes heading');
assert(bike.steering<=.52);
bike.turn=0;bike.throttle=-1;
const beforeBrake=bike.speed;
for(let i=0;i<60;i++){bike.step(PHYS.step);body.step(PHYS.step);}
assert(bike.speed<beforeBrake*.5,'reverse input brakes before reversing');
// Place a broad obstacle in the heading path, then run real soft-body flight and recovery.
bike.yaw=0;bike.steering=0;bike.turn=0;bike.throttle=1;bike.speed=.30;bike.laughing=true;
obstacles.push(box(bike.position.x,.04,bike.position.z+.095,.22,.08,.025));
let impact=false,airborne=false,cryFrames=0,standingTime=0;
const face=new FaceExpression();face.laugh=1;
for(let i=0;i<240*8;i++) {
  const wasRiding=bike.riding;bike.step(PHYS.step);
  if(!bike.riding&&!bike.recovering)rig.step(PHYS.step);
  body.step(PHYS.step);
  face.update(PHYS.step,false,bike.laughing,false,bike.crying);
  if(wasRiding&&!bike.riding){impact=true;assert(bike.crying);assert.equal(face.sob,1);assert.equal(face.laugh,0);}
  if(impact&&!body.grounded)airborne=true;
  if(impact&&bike.crying)cryFrames++;
  if(impact&&!bike.recovering&&body.grounded)standingTime+=PHYS.step;
  if(impact&&!bike.crying)break;
  assert(body.isFinite());assert(body.lastMinJacobian>=.12);
}
assert(impact&&airborne,'hard laughing crash ejects into flight');
assert(cryFrames>480,'cry includes flight plus two seconds standing');
assert(standingTime>=2,'cry timer cannot expire before standing');
assert(!bike.crying,'returns to normal after recovery');
for(let i=0;i<240;i++)face.update(PHYS.step,false,false,false,bike.crying);
assert(face.sob<.002&&face.laugh===0,'no post-grab laughter after crash');
bike.reset();assert(!bike.riding&&!bike.crying&&bike.speed===0);
const sustainedBody=new SoftBody(loadModel()),wall=[box(0,.04,.09,.20,.08,.02)];
const sustainedBike=new TricyclePhysics(sustainedBody,wall);sustainedBike.position.set(0,0,0);sustainedBike.yaw=0;
let sustainedImpacts=0;sustainedBike.onCrash=()=>sustainedImpacts++;
for(let i=0;i<120;i++){sustainedBike.speed=.06;sustainedBike.step(PHYS.step);}
assert.equal(sustainedImpacts,1,'continuous obstacle contact emits one impact event instead of audio-rate repeats');

const glanceBody=new SoftBody(loadModel());
const glanceBike=new TricyclePhysics(glanceBody,[],false,[tricycleCircleCollider(.028,.087,.018)]);
glanceBike.position.set(0,0,0);glanceBike.yaw=0;glanceBike.speed=.24;
const glanceYaw=glanceBike.yaw;let glanceImpacts=0;glanceBike.onCrash=()=>glanceImpacts++;
for(let i=0;i<36;i++)glanceBike.step(PHYS.step);
assert.equal(glanceImpacts,1,'a glancing collision emits one impact event');
assert(Math.abs(glanceBike.yaw-glanceYaw)>.015,'off-centre collision impulse yaws the tricycle');
assert(Math.abs(glanceBike.position.x)>.001,'off-centre collision produces lateral rigid-body response');

const model=new Tricycle();
for(const steer of [-.52,0,.52]) {
  model.update(steer,.2);model.group.updateMatrixWorld(true);
  assert.equal(model.seat.rotation.y,model.fork.rotation.y);
  const seatPin=model.seat.localToWorld(new Vector3(.018,-.009,0));
  const forkPin=model.fork.localToWorld(new Vector3(.018,.054,0));
  assert(Math.abs(seatPin.distanceTo(forkPin)-Math.hypot(.056,.024))<1e-10,'parallel linkage keeps constant rod length');
}
const track=new ToyTrack();let draws=0,upward=false,triangles=0;
track.group.traverse(o=>{if(o instanceof Mesh){draws++;triangles+=o.geometry.attributes.position.count/3;const n=o.geometry.attributes.normal;for(let i=0;i<n.count;i++)if(n.getY(i)>.99)upward=true;}});
assert(upward);assert.equal(draws,14,'all finishes survive batching');
assert(triangles>10000&&triangles<100000,`authored geometry remains complete and bounded: ${triangles} triangles`);
model.dispose();track.dispose();
console.log({minVolume,maxVolume,maxError,cryFrames,standingTime,sustainedImpacts,glanceImpacts,glanceYawDelta:glanceBike.yaw-glanceYaw,draws,triangles});
console.log('Tricycle physics, crash expression, recovery, linkage and geometry checks passed.');
