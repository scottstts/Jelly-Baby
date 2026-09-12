import assert from 'node:assert/strict';
import { Vector3 } from 'three/webgpu';
import { SoftBody } from '../src/physics/soft-body.js';
import { loadModel } from './load-model.mjs';
import { surfaceGrab } from '../src/physics/grab.ts';
import { Locomotion } from '../src/app/locomotion.ts';
import { FacilityCollision } from '../src/facilities/collision.ts';
import { SoccerStadium } from '../src/worlds/soccer/stadium.ts';
import { StadiumCollisionGrid } from '../src/worlds/soccer/collision-grid.ts';
import { markStadiumSupport } from '../src/worlds/soccer/walking-support.ts';
import { ENTRANCE, FIELD, FIELD_RAMP, GOAL, WELCOME_DESK, SOCCER_PORTAL, SOCCER_RUN_CADENCE_SCALE, SOCCER_RUN_SPEED_SCALE, onSoccerField } from '../src/worlds/soccer/layout.ts';
import { boxBounds, boundsOverlap, bodyCollisionBounds } from '../src/facilities/collision-bounds.ts';

const stadium=new SoccerStadium(true),body=new SoftBody(loadModel()),rig=new Locomotion(body),collision=new FacilityCollision(body),grid=new StadiumCollisionGrid(stadium.boxes,body),h=1/240;
collision.registerBoxes(stadium.boxes);collision.warmupBoxes(stadium.boxes);
function place(x,z,y=0){body.reset();for(let j=0;j<body.x.length;j+=3){body.x[j]+=x;body.x[j+1]+=y;body.x[j+2]+=z;}body.previous.set(body.x);body.updateCenter();body.updateSurface();rig.reset();}
function walkTo(x,z,seconds=6) {
  let maxCandidates=0;
  for(let i=0;i<seconds/h;i++) {
    const field=onSoccerField(body.center.x,body.center.z);rig.speedScale=field?SOCCER_RUN_SPEED_SCALE:1;rig.cadenceScale=field?SOCCER_RUN_CADENCE_SCALE:1;
    rig.move.set(x-body.center.x,0,z-body.center.z);const distance=rig.move.length();if(distance<.012){rig.move.set(0,0,0);return {arrived:true,maxCandidates};}rig.move.normalize();
    rig.step(h);body.step(h);const near=grid.near(body);maxCandidates=Math.max(maxCandidates,near.length);collision.resolveBoxes(near);markStadiumSupport(body,near);rig.afterStep();
  }
  return {arrived:false,maxCandidates};
}
place(SOCCER_PORTAL.x,SOCCER_PORTAL.z+.10);
assert(walkTo(WELCOME_DESK.x,ENTRANCE.z+.26).arrived,'arrival can reach the welcome-desk approach');
assert(walkTo(ENTRANCE.x,ENTRANCE.z+.26).arrived,'approach can pass in front of open leaves');
assert(walkTo(ENTRANCE.x,1.36,9).arrived,'player can run directly through the open gate and ramp onto the pitch');
assert(onSoccerField(body.center.x,body.center.z),'direct route ends on the soccer field without an equipment interaction');
assert(walkTo(ENTRANCE.x,ENTRANCE.z-.08,9).arrived,'the same ordinary locomotion can leave the pitch again');
place(0,1.84);assert(walkTo(.70,1.84,8).arrived,'concourse behind the net is wide enough for the jelly');
place(.93,0,FIELD.y);assert(!walkTo(1.16,0,2).arrived,'side boards block walking into stands');assert(body.center.x<1.01);
place(0,1.79);assert(!walkTo(0,1.61,2).arrived,'back net blocks entry through the mesh');assert(body.center.z>FIELD.length/2+GOAL.depth);
place(GOAL.width/2,1.43,FIELD.y);assert(!walkTo(GOAL.width/2,1.60,2).arrived,'goal post is a physical obstacle');
place(0,1.38,FIELD.y);assert(walkTo(0,1.60,3).arrived,'the goal mouth remains open');
const rampBoxes=stadium.boxes.filter(box=>box.center.x===FIELD_RAMP.x&&box.center.z>FIELD_RAMP.start&&box.center.z<FIELD_RAMP.end);
assert.equal(rampBoxes.length,12,'ramp keeps twelve thin support contacts');
assert(rampBoxes.every(box=>box.skipThrowSweep),'ramp support contacts never bulk-stop a grabbed body');
body.reset();
for(let j=0;j<body.x.length;j+=3){body.x[j]+=FIELD_RAMP.x;body.previous[j]+=FIELD_RAMP.x;body.x[j+2]+=FIELD_RAMP.end+.02;body.previous[j+2]+=FIELD_RAMP.end+.02;}
body.updateCenter();body.updateSurface();
const indices=body.surface.indices,[ia,ib,ic]=[indices[0],indices[1],indices[2]],grabPoint=new Vector3().fromArray(body.surface.positions,ia*3).add(new Vector3().fromArray(body.surface.positions,ib*3)).add(new Vector3().fromArray(body.surface.positions,ic*3)).multiplyScalar(1/3),grab=surfaceGrab(body,{a:ia,b:ib,c:ic},grabPoint);
assert(grab,'surface grab binds before ramp traversal');body.grabs.push(grab);
const grabAnchor=grab.target.clone(),grabSteps=Math.ceil(.35/h);
for(let i=0;i<grabSteps;i++){grab.target.copy(grabAnchor).add(new Vector3(0,0,-.36*(i+1)/grabSteps));body.step(h);const near=grid.near(body);collision.resolveBoxes(near);markStadiumSupport(body,near);}
const grabbedRampZ=body.center.z;body.grabs.length=0;assert(grabbedRampZ<FIELD_RAMP.start,'a grabbed jelly can cross the ramp and turf threshold');
const b=new Float64Array(6),piece=new Float64Array(6);let tested=0,maxCandidates=0;
for(const [x,z] of [[0,0],[1.10,.3],[.60,2.1],[0,-1.6],[-1.35,1.6],[WELCOME_DESK.x,WELCOME_DESK.z]]) {
  place(x,z);const near=grid.near(body);maxCandidates=Math.max(maxCandidates,near.length);bodyCollisionBounds(body,grid.magnitude,grid.error,b);
  for(const box of stadium.boxes){boxBounds(box,box.margin??.002,piece);if(boundsOverlap(b,piece)){assert(near.includes(box));tested++;}}
}
assert(maxCandidates<stadium.boxes.length/3,'local narrow phase prunes distant seats');
console.log('Soccer routes, direct field access, boards, goals, nets, welcome desk and conservative spatial pruning passed.',{boxes:stadium.boxes.length,maxCandidates,tested});
collision.dispose();stadium.dispose();
