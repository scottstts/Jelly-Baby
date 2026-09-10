import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3, EventDispatcher } from 'three/webgpu';
import { SoftBody } from '../src/physics/soft-body.js';
import { loadModel } from './load-model.mjs';
import { TricyclePhysics } from '../src/game/tricycle-physics.ts';
import { ToyTrack } from '../src/graphics/toy-track.ts';
import { TRACK_START, TRACK_WIDTH, ROAD_HEIGHT, CURB_HEIGHT, TRACK_RADIUS_SCALE, TRACK_SCENERY_SCALE, trackCurve, trackPoint, obstacles, roadLocation } from '../src/game/toy-track-layout.ts';
import { PORTAL_ARRIVAL_DISTANCE, TRACK_PORTAL } from '../src/game/toy-world-layout.ts';
import { WHEEL_CONTACTS, constrainToRoad, wheelHeight } from '../src/game/tricycle-road-contact.ts';
import { TricycleCamera } from '../src/game/tricycle-camera.ts';
import { tricycleCircleCollider, tricycleCircleContact } from '../src/game/tricycle-collision.ts';
import { PHYS } from '../src/physics/constants.js';
import { FacilityCollision } from '../src/physics/facility-collision.ts';

const tangent=trackCurve.getTangentAt(0);
assert(Math.sin(TRACK_START.yaw)*tangent.x+Math.cos(TRACK_START.yaw)*tangent.z<-.999,'counterclockwise starting heading');
const portalClearance=roadLocation(TRACK_PORTAL.x,TRACK_PORTAL.z).distance-TRACK_WIDTH/2-.079;
const arrivalClearance=roadLocation(TRACK_PORTAL.x,TRACK_PORTAL.z+PORTAL_ARRIVAL_DISTANCE).distance-TRACK_WIDTH/2;
assert(portalClearance>.175,'toy portal housing keeps the authored 18 cm road clearance');
assert(arrivalClearance>.25,'toy-world arrival starts well clear of the enlarged road');
assert(Math.hypot(TRACK_PORTAL.x-TRACK_START.x,TRACK_PORTAL.z-TRACK_START.z)>.55,'portal is separated from the parked tricycle');

const samples=Array.from({length:512},(_,i)=>trackPoint(i/512));
const width=Math.max(...samples.map(p=>p.x))-Math.min(...samples.map(p=>p.x));
assert.equal(TRACK_RADIUS_SCALE,2);assert.equal(TRACK_SCENERY_SCALE,2);assert.equal(TRACK_WIDTH,.30);
assert(width>1.9&&width<2.1,'two metre centerline diameter');
for(let i=0;i<128;i++)for(const side of [-1,1]) {
  const p=trackPoint(i/128,side*.12),yaw=i*.31;constrainToRoad(p,yaw);
  for(const w of WHEEL_CONTACTS) {
    const x=p.x+Math.cos(yaw)*w.x+Math.sin(yaw)*w.z,z=p.z-Math.sin(yaw)*w.x+Math.cos(yaw)*w.z;
    assert(roadLocation(x,z).distance<TRACK_WIDTH/2-.005,'all wheel centres remain within raised curbs');
  }
}
const track=new ToyTrack(),pen=obstacles.find(o=>o.kind==='pen');
assert.equal(track.boxes.length,track.obstacleBoxes.length,'walking scenery collision remains separate from the road slab and curbs');
assert(track.boxes.every((box,index)=>box===track.obstacleBoxes[index]),'road slab remains absent from jelly collision');
assert.equal(track.curbBoxes.length,512,'both visible curb loops have finite walking collision segments');
assert(track.curbBoxes.every(curb=>Math.abs(curb.center.y-curb.halfSize.y)<1e-12&&curb.center.y+curb.halfSize.y<=CURB_HEIGHT+1e-12),'curb collision stops at the visible curb top instead of forming an invisible wall');
const curbPoint=trackPoint(.08,TRACK_WIDTH/2),localCurbs=[...track.curbsNear(curbPoint.x,curbPoint.z)];
assert.equal(localCurbs.length,track.curbActiveBoxCount,'only nearby curb segments enter the 240 Hz narrow phase');
const curbBody=new SoftBody(loadModel()),curbCollision=new FacilityCollision(curbBody);curbCollision.registerBoxes(localCurbs);
const moveBody=(targetX,targetY,targetZ)=>{const dx=targetX-curbBody.center.x,dy=targetY-curbBody.center.y,dz=targetZ-curbBody.center.z;for(let j=0;j<curbBody.x.length;j+=3){curbBody.x[j]+=dx;curbBody.x[j+1]+=dy;curbBody.x[j+2]+=dz;}curbBody.previous.set(curbBody.x);curbBody.updateCenter();};
moveBody(curbPoint.x,curbBody.center.y,curbPoint.z);assert(curbCollision.resolveBoxes(localCurbs),'grounded baby is blocked by the visible curb');
curbBody.reset();moveBody(curbPoint.x,curbBody.center.y+CURB_HEIGHT+.035,curbPoint.z);assert.equal(curbCollision.resolveBoxes(localCurbs),false,'a jumped-clear baby has no curb collision above the finite top');curbCollision.dispose();
assert.equal(track.vehicleColliders.length,8,'four tall props and four houses block the tricycle');
assert(Math.abs(track.obstacleBoxes[0].halfSize.x-.026)<1e-12&&Math.abs(track.obstacleBoxes[0].halfSize.z-.0135)<1e-12,'track obstacles keep their original physical size');
assert(Math.abs(track.obstacleBoxes[5].halfSize.x-.083)<1e-12&&Math.abs(track.obstacleBoxes[5].halfSize.y-.082)<1e-12,'infield houses scale twofold with the enlarged world');
const expectedOffsets=[.060*1.5,0,.063*1.5,.064*1.5,.064*1.5];for(let i=0;i<obstacles.length;i++)assert(Math.abs(roadLocation(obstacles[i].x,obstacles[i].z).distance-Math.abs(expectedOffsets[i]))<.002,'obstacle lane placement scales with the wider road without scaling the prop');
assert.equal(track.vehicleColliders.filter(collider=>collider.kind==='circle').length,2,'round bottle and spool use circular footprints');
const round=tricycleCircleCollider(0,0,.0215);
assert.equal(tricycleCircleContact(.0205,.0205,.002,round),null,'circular prop corners do not inherit a square bounding box');
assert(tricycleCircleContact(.022,0,.002,round),'circular prop face still collides at its visible radius');
const penBox=track.obstacleBoxes[1];
assert(wheelHeight(pen.x,pen.z,.023,[penBox])>ROAD_HEIGHT+.011,'pen lifts a front wheel by its real height');
assert.equal(wheelHeight(pen.x+.1,pen.z+.1,.023,[penBox]),ROAD_HEIGHT);
const body=new SoftBody(loadModel()),bike=new TricyclePhysics(body,track.obstacleBoxes,true,track.vehicleColliders);
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
track.dispose();console.log({width,portalClearance,arrivalClearance,peakHeight,peakPitch,minJ});console.log('Twofold track layout, finite jumpable curbs, deliberate prop placement, rolling pen contact, soft rider and chase/orbit handoff passed.');
