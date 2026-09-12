import assert from 'node:assert/strict';
import { SoftBody } from '../src/physics/soft-body.js';
import { loadModel } from './load-model.mjs';
import { Locomotion } from '../src/app/locomotion.ts';
import { SoccerPhysics } from '../src/worlds/soccer/physics.ts';
import { FacilityCollision } from '../src/facilities/collision.ts';
import { markStadiumSupport } from '../src/worlds/soccer/walking-support.ts';
import { FIELD, BALL, SOCCER_RUN_CADENCE_SCALE, SOCCER_RUN_SPEED_SCALE, soccerBox } from '../src/worlds/soccer/layout.ts';
import { soccerSample } from '../src/worlds/soccer/sound.ts';

const h=1/240;
function placeBody(body,x,z,y=0,yaw=0) {
  body.reset();const cx=body.center.x,cz=body.center.z,c=Math.cos(yaw),s=Math.sin(yaw);
  for(let j=0;j<body.x.length;j+=3){const rx=body.x[j]-cx,rz=body.x[j+2]-cz;body.x[j]=x+rx*c+rz*s;body.x[j+1]+=y;body.x[j+2]=z+rz*c-rx*s;}
  body.previous.set(body.x);body.velocity.fill(0);body.updateCenter();body.updateSurface();body.wake();
}
function locomotionSample(speedScale,cadenceScale) {
  const body=new SoftBody(loadModel()),rig=new Locomotion(body);rig.speedScale=speedScale;rig.cadenceScale=cadenceScale;rig.move.set(0,0,-1);
  for(let i=0;i<600;i++){rig.step(h);body.step(h);rig.afterStep();}
  return {speed:Math.hypot(rig.velocity.x,rig.velocity.z),phase:rig.phase};
}
const normal=locomotionSample(1,1),fieldRun=locomotionSample(SOCCER_RUN_SPEED_SCALE,SOCCER_RUN_CADENCE_SCALE);
assert(fieldRun.speed>normal.speed*2.90&&fieldRun.speed<normal.speed*3.10,'field locomotion settles at the canonical 3x movement speed');
assert(fieldRun.phase>normal.phase*2.55,'field gait cadence increases with the 3x run profile');

const body=new SoftBody(loadModel()),soccer=new SoccerPhysics(body);
assert.notEqual(body.surface.positions,soccer.goalie.body.surface.positions);
assert.notEqual(body.surface.geometry,soccer.goalie.body.surface.geometry);
assert(!('shoot' in soccer),'soccer physics exposes no player shooting action');
const step=seconds=>{for(let i=0;i<Math.round(seconds/h);i++){soccer.step(h);body.step(h);soccer.afterStep();assert(body.isFinite()&&soccer.goalie.body.isFinite());}};
placeBody(body,0,1.70,FIELD.y);assert(!soccer.onField,'off-pitch placement remains outside the field bounds');
placeBody(body,-.038,.056,FIELD.y,Math.PI);soccer.centerBall();assert(soccer.onField);
const events=[];soccer.onEvent=kind=>events.push(kind);
assert(!events.length&&!soccer.crying,'soccer has no player shooting action');

function landingShake(releaseSpeed) {
  const landingBody=new SoftBody(loadModel()),rig=new Locomotion(landingBody),turf=soccerBox(0,.007,0,FIELD.width,.010,FIELD.length);
  turf.skipThrowSweep=true;const collision=new FacilityCollision(landingBody);collision.registerBoxes([turf]);
  placeBody(landingBody,-.038,.056,FIELD.y);rig.speedScale=SOCCER_RUN_SPEED_SCALE;rig.cadenceScale=SOCCER_RUN_CADENCE_SCALE;
  for(let i=0;i<80;i++){rig.step(h);landingBody.step(h);collision.resolveBoxes([turf]);markStadiumSupport(landingBody,[turf]);rig.afterStep();}
  for(let i=0;i<landingBody.velocity.length;i+=3)landingBody.velocity[i+1]=releaseSpeed;landingBody.wake();
  let restCenterY=0;for(let i=0;i<landingBody.mass.length;i++)restCenterY+=landingBody.rest[i*3+1]*landingBody.mass[i]/landingBody.totalMass;
  let leftSupport=false,landingFrame=-1,peakShape=0;
  for(let frame=0;frame<360;frame++) {
    rig.step(h);landingBody.step(h);collision.resolveBoxes([turf]);markStadiumSupport(landingBody,[turf]);rig.afterStep();
    if(!landingBody.grounded)leftSupport=true;
    if(leftSupport&&landingBody.grounded&&landingFrame<0)landingFrame=frame;
    if(landingFrame>=0&&frame-landingFrame<96)for(let i=0;i<landingBody.x.length;i+=3)peakShape=Math.max(peakShape,Math.abs((landingBody.x[i+1]-landingBody.center.y)-(landingBody.rest[i+1]-restCenterY)));
  }
  collision.dispose();assert(landingFrame>=0,'thrown baby returns to the turf support');return peakShape;
}
const lowLandingShake=landingShake(.35),highLandingShake=landingShake(1.05);
assert(highLandingShake>lowLandingShake*1.25,'high turf landings retain stronger soft-body deformation');

placeBody(body,.4,.3,FIELD.y);soccer.centerBall();soccer.ball.set(.13,FIELD.y+BALL.radius,-1.56);soccer.ballVelocity.set(0,0,-.5);
step(.05);assert.equal(soccer.score,1,'whole-ball crossing scores once');assert(soccer.laughing);step(.6);assert.equal(soccer.score,1);step(2.45);assert(!soccer.laughing,'three second celebration expires');
assert(Math.abs(soccer.ball.x)<1e-6&&Math.abs(soccer.ball.z)<1e-6,'restart returns ball to centre');
soccer.ball.set(.95,FIELD.y+BALL.radius,0);soccer.ballVelocity.set(1,0,0);step(.1);assert(soccer.ballVelocity.x<0,'side board rebounds');
soccer.goalie.place(0,-1.43,0);soccer.ball.set(0,.20,-.98);soccer.ballVelocity.set(0,.15,-1.6);step(.20);assert(soccer.goalie.jumpHeight>0,'keeper launches a physical jump for a high shot');
soccer.reset();assert.equal(soccer.score,0);assert.equal(soccer.ball.lengthSq()>0,true);
for(const kind of ['save','post','bump','goal']) {const pcm=soccerSample(kind,24000);assert(pcm.every(Number.isFinite));assert(Math.max(...pcm)<.7);assert(pcm.some(v=>Math.abs(v)>.001));}
console.log('Soccer: direct 3x field running, ordinary on-foot movement, deformable turf landings, scoring/restart, boards, keeper jump and artificial-turf audio passed.',{normal,fieldRun,lowLandingShake,highLandingShake});
