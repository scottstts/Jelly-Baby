import assert from 'node:assert/strict';
import { SoftBody } from '../src/physics/soft-body.js';
import { loadModel } from './load-model.mjs';
import { Locomotion } from '../src/app/locomotion.ts';
import { FacilityCollision } from '../src/facilities/collision.ts';
import { SoccerStadium } from '../src/worlds/soccer/stadium.ts';
import { StadiumCollisionGrid } from '../src/worlds/soccer/collision-grid.ts';
import { markStadiumSupport } from '../src/worlds/soccer/walking-support.ts';
import { SoccerPhysics } from '../src/worlds/soccer/physics.ts';
import { ENTRANCE, FIELD, GOAL, RENTAL, SOCCER_PORTAL } from '../src/worlds/soccer/layout.ts';
import { boxBounds, boundsOverlap, bodyCollisionBounds } from '../src/facilities/collision-bounds.ts';

const stadium=new SoccerStadium(true),body=new SoftBody(loadModel()),rig=new Locomotion(body),collision=new FacilityCollision(body),grid=new StadiumCollisionGrid(stadium.boxes,body),h=1/240;
collision.registerBoxes(stadium.boxes);collision.warmupBoxes(stadium.boxes);
function place(x,z,y=0){body.reset();for(let j=0;j<body.x.length;j+=3){body.x[j]+=x;body.x[j+1]+=y;body.x[j+2]+=z;}body.previous.set(body.x);body.updateCenter();body.updateSurface();rig.reset();}
function walkTo(x,z,seconds=6) {
  let maxCandidates=0;
  for(let i=0;i<seconds/h;i++) {
    rig.move.set(x-body.center.x,0,z-body.center.z);const distance=rig.move.length();if(distance<.012){rig.move.set(0,0,0);return {arrived:true,maxCandidates};}rig.move.normalize();
    rig.step(h);body.step(h);const near=grid.near(body);maxCandidates=Math.max(maxCandidates,near.length);collision.resolveBoxes(near);markStadiumSupport(body,near);rig.afterStep();
  }
  return {arrived:false,maxCandidates};
}
place(SOCCER_PORTAL.x,SOCCER_PORTAL.z+.10);
assert(walkTo(RENTAL.x,ENTRANCE.z+.26).arrived,'arrival can reach the rental approach');
assert(walkTo(RENTAL.x,RENTAL.z+.09).arrived,'rental desk can be approached within interaction range');
assert(walkTo(ENTRANCE.x,ENTRANCE.z+.26).arrived,'approach can pass in front of open leaves');
assert(walkTo(ENTRANCE.x,1.36,9).arrived,`open gate and offset field access are actually traversable: ${body.center.toArray()}`);
assert(walkTo(ENTRANCE.x,ENTRANCE.z-.08,9).arrived,'return route remains open');
place(0,1.84);assert(walkTo(.70,1.84,8).arrived,'concourse behind the net is wide enough for the jelly');
place(.93,0,FIELD.y);assert(!walkTo(1.16,0,2).arrived,'side boards block walking into stands');assert(body.center.x<1.01);
place(0,1.79);assert(!walkTo(0,1.61,2).arrived,'back net blocks entry through the mesh');assert(body.center.z>FIELD.length/2+GOAL.depth);
place(GOAL.width/2,1.43,FIELD.y);assert(!walkTo(GOAL.width/2,1.60,2).arrived,'goal post is a physical obstacle');
// A goal mouth must not be replaced by one large collision box.
place(0,1.38,FIELD.y);assert(walkTo(0,1.60,3).arrived,'the goal mouth remains open');
const soccer=new SoccerPhysics(body);soccer.board();
for(let i=0;i<800;i++){soccer.player.move.set(0,0,1);soccer.step(h);body.step(h);collision.resolveBoxes(grid.near(body));soccer.afterStep();if(soccer.canLeave)break;}
assert(soccer.canLeave,'skater can traverse the same field-to-gate route');
// Spatial pruning must retain every overlapping volume, including at corners.
const b=new Float64Array(6),piece=new Float64Array(6);let tested=0,maxCandidates=0;
for(const [x,z] of [[0,0],[1.10,.3],[.60,2.1],[0,-1.6],[-1.35,1.6],[RENTAL.x,RENTAL.z]]) {
  place(x,z);const near=grid.near(body);maxCandidates=Math.max(maxCandidates,near.length);bodyCollisionBounds(body,grid.magnitude,grid.error,b);
  for(const box of stadium.boxes){boxBounds(box,box.margin??.002,piece);if(boundsOverlap(b,piece)){assert(near.includes(box));tested++;}}
}
assert(maxCandidates<stadium.boxes.length/3,'local narrow phase prunes distant seats');
console.log('Soccer routes, boards, goals, nets, rental approach, skating exit and conservative spatial pruning passed.',{boxes:stadium.boxes.length,maxCandidates,tested});
collision.dispose();stadium.dispose();
