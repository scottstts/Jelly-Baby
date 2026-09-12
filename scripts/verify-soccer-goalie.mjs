import assert from 'node:assert/strict';
import { SoftBody } from '../src/physics/soft-body.js';
import { loadModel } from './load-model.mjs';
import { SoccerPhysics } from '../src/worlds/soccer/physics.ts';
import { BALL, FIELD } from '../src/worlds/soccer/layout.ts';

const body=new SoftBody(loadModel()),p=new SoccerPhysics(body),h=1/240;
function placePlayer(x,z,y=FIELD.y) {
  body.reset();for(let j=0;j<body.x.length;j+=3){body.x[j]+=x;body.x[j+1]+=y;body.x[j+2]+=z;}body.previous.set(body.x);body.velocity.fill(0);body.updateCenter();body.updateSurface();
}
const trials=[];
for(const [x,target,speed] of [[0,0,1.6],[0,-.17,1.6],[0,.17,1.6],[-.45,.16,2],[.45,-.16,2],[.15,-.18,2.6],[-.15,.18,2.6]]) {
  p.reset();placePlayer(.8,1.3);p.ball.set(x,FIELD.y+BALL.radius,-.65);p.ballVelocity.set((target-x)*speed/.89,0,-speed);
  let saves=0,bestForward=-Infinity;p.onEvent=kind=>{if(kind==='save')saves++;};
  for(let i=0;i<360;i++){p.step(h);body.step(h);p.afterStep();if(saves)bestForward=Math.max(bestForward,p.ballVelocity.z);}
  trials.push({x,target,speed,saves,goals:p.score,bestForward});
}
console.table(trials);
assert(trials[0].saves>0&&trials[0].goals===0,'keeper blocks a readable central shot');
assert(trials[0].bestForward>.10,'a clean save is deliberately parried back toward the field');
assert(trials.some(t=>t.goals>0),'finite reaction, prediction error and run speed leave beatable corners');
assert(trials.some(t=>t.saves>0),'keeper makes physical saves');
assert(trials.filter(t=>t.saves>0).length>=2,'keeper covers more than only the center lane');

for(const trappedX of [0,.045]) {
  p.reset();placePlayer(.8,1.3);p.ball.set(trappedX,FIELD.y+BALL.radius,-1.485);p.ballVelocity.set(0,0,0);
  let rearMost=p.goalie.body.center.z,rescuedZ=p.ball.z;
  for(let i=0;i<600;i++){p.step(h);body.step(h);p.afterStep();rearMost=Math.min(rearMost,p.goalie.body.center.z);rescuedZ=Math.max(rescuedZ,p.ball.z);}
  assert.equal(p.score,0,'keeper does not abandon a live ball between itself and the goal');
  assert(rearMost< -1.48,'keeper actively recovers when the ball gets behind it');
  assert(rescuedZ> -1.43,'keeper recovers and clears a trapped ball back out of the goal mouth');
}

p.reset();placePlayer(.8,1.3);p.ball.set(.08,FIELD.y+BALL.radius,-1.24);p.ballVelocity.set(0,0,0);
let furthestChallenge=p.goalie.body.center.z,looseBallAdvance=p.ball.z;
for(let i=0;i<420;i++){p.step(h);body.step(h);p.afterStep();furthestChallenge=Math.max(furthestChallenge,p.goalie.body.center.z);looseBallAdvance=Math.max(looseBallAdvance,p.ball.z);}
assert(furthestChallenge> -1.39,'keeper steps out to own a reachable loose ball instead of waiting on its line');
assert(looseBallAdvance> -1.20,'close-ball challenge follows through and moves the ball away from goal');

p.reset();placePlayer(0,0);
let sample,furthest=-Infinity;
for(const c of body.contacts){let x=0,y=0,z=0;for(const [id,w] of c.weights){x+=body.x[id*3]*w;y+=body.x[id*3+1]*w;z+=body.x[id*3+2]*w;}if(y<.065&&z>furthest){sample={x,y,z};furthest=z;}}
assert(sample);p.ball.set(sample.x,sample.y,sample.z+BALL.radius-.002);p.ballVelocity.set(0,0,-.5);
const momentum=()=>{let z=p.ballVelocity.z*BALL.mass;for(let i=0;i<body.mass.length;i++)z+=body.velocity[i*3+2]*body.mass[i];return z;};
const before=momentum();p.afterStep();assert(Math.abs(momentum()-before)<1e-10,'contact conserves combined linear momentum');assert(body.velocity.some(v=>Math.abs(v)>0),'ball deforms live player nodes');
console.log('Goalie shot anticipation, active parries, behind-goal rescue, loose-ball challenges, balanced coverage and equal-opposite FEM contact impulse passed.');
