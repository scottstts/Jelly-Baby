import assert from 'node:assert/strict';
import { SoftBody } from '../src/physics/soft-body.js';
import { loadModel } from './load-model.mjs';
import { SoccerPhysics } from '../src/worlds/soccer/physics.ts';
import { BALL, FIELD } from '../src/worlds/soccer/layout.ts';

const body=new SoftBody(loadModel()),p=new SoccerPhysics(body),h=1/240;
const trials=[];
for(const [x,target,speed] of [[0,0,1.6],[0,-.17,1.6],[0,.17,1.6],[-.45,.16,2],[.45,-.16,2],[.15,-.18,2.6],[-.15,.18,2.6]]) {
  p.reset();p.board();p.player.place(.8,1.3,Math.PI);p.ball.set(x,FIELD.y+BALL.radius,-.65);p.ballVelocity.set((target-x)*speed/.89,0,-speed);
  let saves=0;p.onEvent=kind=>{if(kind==='save')saves++;};
  for(let i=0;i<360;i++){p.step(h);body.step(h);p.afterStep();}
  trials.push({x,target,speed,saves,goals:p.score});
}
console.table(trials);
assert(trials[0].saves>0&&trials[0].goals===0,'keeper blocks a readable central shot');
assert(trials.some(t=>t.goals>0),'finite reaction and speed leave beatable corners');
assert(trials.some(t=>t.saves>0),'keeper makes physical saves');
// Test a local FEM contact in isolation: both bodies receive equal/opposite momentum.
p.reset();p.board();p.player.place(0,0,0);
let sample,furthest=-Infinity;
for(const c of body.contacts){let x=0,y=0,z=0;for(const [id,w] of c.weights){x+=body.x[id*3]*w;y+=body.x[id*3+1]*w;z+=body.x[id*3+2]*w;}if(y<.065&&z>furthest){sample={x,y,z};furthest=z;}}
assert(sample);p.ball.set(sample.x,sample.y,sample.z+BALL.radius-.002);p.ballVelocity.set(0,0,-.5);
const momentum=()=>{let z=p.ballVelocity.z*BALL.mass;for(let i=0;i<body.mass.length;i++)z+=body.velocity[i*3+2]*body.mass[i];return z;};
const before=momentum();p.afterStep();assert(Math.abs(momentum()-before)<1e-10,'contact conserves combined linear momentum');assert(body.velocity.some(v=>Math.abs(v)>0),'ball deforms live player nodes');
console.log('Goalie reaction/coverage balance and equal-opposite FEM contact impulse passed.');
