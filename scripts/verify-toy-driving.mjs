import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3, EventDispatcher } from 'three/webgpu';
import { SoftBody } from '../src/physics/soft-body.js';
import { loadModel } from './load-model.mjs';
import { TricyclePhysics } from '../src/game/tricycle-physics.ts';
import { ToyTrack } from '../src/graphics/toy-track.ts';
import { TRACK_START, TRACK_WIDTH, ROAD_HEIGHT, trackCurve, trackPoint, obstacles, roadLocation } from '../src/game/toy-track-layout.ts';
import { WHEEL_CONTACTS, constrainToRoad, wheelHeight } from '../src/game/tricycle-road-contact.ts';
import { TricycleCamera } from '../src/game/tricycle-camera.ts';
import { PHYS } from '../src/physics/constants.js';

const tangent=trackCurve.getTangentAt(0);
assert(Math.sin(TRACK_START.yaw)*tangent.x+Math.cos(TRACK_START.yaw)*tangent.z<-.999,'counterclockwise starting heading');
const samples=Array.from({length:512},(_,i)=>trackPoint(i/512));
const width=Math.max(...samples.map(p=>p.x))-Math.min(...samples.map(p=>p.x));
assert(width>.95&&width<1.05,'one metre centerline diameter');
for(let i=0;i<128;i++)for(const side of [-1,1]) {
  const p=trackPoint(i/128,side*.12),yaw=i*.31;constrainToRoad(p,yaw);
  for(const w of WHEEL_CONTACTS) {
    const x=p.x+Math.cos(yaw)*w.x+Math.sin(yaw)*w.z,z=p.z-Math.sin(yaw)*w.x+Math.cos(yaw)*w.z;
    assert(roadLocation(x,z).distance<TRACK_WIDTH/2-.005,'all wheel centres remain within raised curbs');
  }
}
const track=new ToyTrack(),pen=obstacles.find(o=>o.kind==='pen');
const penBox=track.obstacleBoxes[1];
assert(wheelHeight(pen.x,pen.z,.023,[penBox])>ROAD_HEIGHT+.011,'pen lifts a front wheel by its real height');
assert.equal(wheelHeight(pen.x+.1,pen.z+.1,.023,[penBox]),ROAD_HEIGHT);
const body=new SoftBody(loadModel()),bike=new TricyclePhysics(body,track.obstacleBoxes,true);
const approach=trackPoint(.385),heading=trackCurve.getTangentAt(.385).negate();
bike.position.copy(approach).setY(ROAD_HEIGHT);bike.yaw=Math.atan2(heading.x,heading.z);
for(let j=0;j<body.x.length;j+=3){body.x[j]+=approach.x;body.x[j+2]+=approach.z;}
body.updateCenter();body.grounded=true;assert(bike.toggle());bike.speed=.22;bike.throttle=1;
let peakHeight=0,peakPitch=0,minJ=1;
for(let i=0;i<240*2;i++) {
  bike.step(PHYS.step);body.step(PHYS.step);peakHeight=Math.max(peakHeight,bike.position.y);peakPitch=Math.max(peakPitch,Math.abs(bike.pitch));minJ=Math.min(minJ,body.lastMinJacobian);
  assert(body.isFinite());
}
assert(peakHeight>ROAD_HEIGHT+.003,'actual bicycle climbs low obstacle');
assert(peakPitch>.03,'front/rear contacts pitch the frame');
assert(bike.position.distanceTo(approach)>.16,'pen does not block passage');
assert(minJ>.12,'bump forces preserve cage orientation');

class Controls extends EventDispatcher {target=new Vector3();enableDamping=true;update(){}}
const controls=new Controls(),camera=new PerspectiveCamera(),chase=new TricycleCamera(controls);
camera.position.set(.2,.15,.2);chase.update(camera,0,1/60);
assert(camera.position.z<0,'mount places camera behind forward +Z');
controls.dispatchEvent({type:'start'});camera.position.set(.2,.12,0);chase.update(camera,0,.1);assert.equal(camera.position.x,.2,'manual orbit has priority');
controls.dispatchEvent({type:'end'});
for(let i=0;i<60;i++)chase.update(camera,0,1/60);
assert(Math.abs(camera.position.x)<.001&&camera.position.z<0,'release returns smoothly in under a second');
const before=camera.position.clone();chase.update(camera,undefined,.1);assert(camera.position.equals(before),'walking camera unchanged');assert(controls.enableDamping);chase.dispose();
track.dispose();console.log({width,peakHeight,peakPitch,minJ});console.log('Counterclockwise layout, curbs, rolling pen contact, soft rider and chase/orbit handoff passed.');
