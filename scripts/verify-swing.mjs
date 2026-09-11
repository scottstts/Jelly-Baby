import assert from 'node:assert/strict';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { SWING } from '../src/worlds/main/facilities/swing/physics.ts';
import { SwingFacility } from '../src/worlds/main/facilities/swing/facility.ts';
import { Scene } from 'three/webgpu';
import { FaceExpression } from '../src/graphics/character/face-expression.ts';
import { Facilities } from '../src/facilities/manager.ts';

const body=new SoftBody(loadModel()),facility=new SwingFacility(new Scene(),body,{add(){}}),swing=facility.physics;
assert(!facility.interact(),'cannot board from spawn outside the approach radius');
for(let j=0;j<body.x.length;j+=3){body.x[j]+=SWING.x;body.x[j+2]+=SWING.z+.07;}
body.updateCenter();body.grounded=true;
assert(facility.interact(),'board from the nearby ground');
assert(!facility.laughing,'boarding starts with the normal expression');
const ridingFace=new FaceExpression();let crossedThreshold=false,sawBlink=false;
let earlyPeak=0,latePeak=0,minimumVolume=Infinity,maximumVolume=0,maxFootError=0;
for(let i=0;i<240*24;i++) {
  facility.step(PHYS.step);body.step(PHYS.step);
  crossedThreshold ||= Math.abs(swing.angle)>=15*Math.PI/180;
  assert.equal(facility.laughing,crossedThreshold,'laughter begins at the first threshold crossing and persists');
  ridingFace.update(PHYS.step,false,facility.laughing);
  if(!crossedThreshold){assert.equal(ridingFace.laugh,0);sawBlink ||= ridingFace.blink>0;}
  assert(body.isFinite(),'finite rider state');
  assert(body.lastMinJacobian>=.12,'rider elements retain their orientation');
  assert(Math.abs(swing.angle)<=SWING.maxAngle+.002,'bounded turning height');
  if(i<240*3)earlyPeak=Math.max(earlyPeak,Math.abs(swing.angle));
  if(i>240*20)latePeak=Math.max(latePeak,Math.abs(swing.angle));
  if(i%240===0) {
    const volume=body.volumeRatio();minimumVolume=Math.min(minimumVolume,volume);maximumVolume=Math.max(maximumVolume,volume);
    const c=Math.cos(swing.angle),s=Math.sin(swing.angle);
    for(let n=0;n<body.mass.length;n++)if(body.rest[n*3+1]<.012) {
      const j=n*3,y=body.x[j+1]-SWING.height,z=body.x[j+2]-SWING.z;
      maxFootError=Math.max(maxFootError,Math.abs(c*y-s*z+SWING.length-.004-body.rest[j+1]));
    }
  }
}
assert(latePeak>earlyPeak+.3,'pumping builds gradually');
assert(latePeak>.7,'reaches a substantial, bounded arc');
assert(minimumVolume>.8&&maximumVolume<1.2,'soft-body volume remains plausible');
assert(maxFootError<.008,'feet stay supported by the seat');
assert(sawBlink,'normal blinking continues during the gentle initial motion');
assert(crossedThreshold&&ridingFace.laugh>.99,'large arcs transition to sustained laughter');
assert(facility.interact()&&!swing.riding,'same action dismounts');
assert(!facility.laughing,'dismount clears the laughter trigger');
assert(body.center.x>SWING.x+.10,'dismount clears the swept seat');
// Boarding must not inherit laughter just because an empty swing was already
// moving beyond the expression threshold.
body.grounded=true;body.grab=null;
swing.angle=.5;swing.speed=.7;facility.step(PHYS.step);
assert(facility.interact(),'board a swing that was already moving');
assert(!facility.laughing,'moving-swing boarding starts with the normal expression');
const movingRideFace=new FaceExpression();let returnedInside=false,laughedAfterCrossing=false;
for(let i=0;i<240*8;i++) {
  facility.step(PHYS.step);body.step(PHYS.step);
  const beyond=Math.abs(swing.angle)>=15*Math.PI/180;
  returnedInside ||= !beyond;
  if(returnedInside&&facility.laughing)laughedAfterCrossing=true;
  movingRideFace.update(PHYS.step,false,facility.laughing);
  if(!facility.laughing)assert.equal(movingRideFace.laugh,0,'normal expression remains normal before a threshold crossing');
  if(laughedAfterCrossing)break;
}
assert(returnedInside,'moving swing returns to the normal-expression range');
assert(laughedAfterCrossing,'moving-swing ride laughs only after crossing the threshold');
assert(facility.interact()&&!facility.laughing,'second ride dismount clears the laughter trigger');
const energy=()=>.5*swing.speed**2+PHYS.gravity/SWING.length*(1-Math.cos(swing.angle));
const before=energy();for(let i=0;i<240*8;i++)swing.step(PHYS.step);
assert(energy()<before*.4,'empty swing coasts and dissipates energy');
body.grab={};body.grounded=true;assert(!swing.nearby,'grabbing blocks boarding');body.grab=null;
facility.reset();assert.equal(swing.angle,0);assert.equal(swing.speed,0);assert(!swing.riding);assert(!facility.laughing);
facility.dispose();
const face=new FaceExpression();for(let i=0;i<120;i++)face.update(1/60,false,true);
assert(face.laugh>.99,'laugh is sustained throughout play');
for(let i=0;i<120;i++)face.update(1/60,false,false);
assert(face.laugh<.001,'laugh returns to rest after dismount');
console.log('Swing physics verified',{earlyPeak,latePeak,minimumVolume,maximumVolume,maxFootError});

// Exercise shared interaction routing without a browser or GPU.
const elements=[];
globalThis.document={
  createElement(){
    const element=new globalThis.EventTarget();
    element.setAttribute=()=>{};element.append=()=>{};element.remove=()=>{element.removed=true;};
    elements.push(element);return element;
  },
  querySelector:()=>({append(){}}),
};
globalThis.window=new globalThis.EventTarget();globalThis.window.closest=()=>null;
const facilities=new Facilities(),[prompt,hint,button]=elements;
const makeFacility=(id,distance)=>({
  id,label:id,active:false,interactionDistance:distance,steps:0,disposed:false,
  interact(){this.active=!this.active;return true;},
  step(){this.steps++;},update(){},reset(){this.active=false;},dispose(){this.disposed=true;},
});
const far=facilities.add(makeFacility('Far',.08)),near=facilities.add(makeFacility('Near',.03));
assert.throws(()=>facilities.add(makeFacility('Near',0)),/Duplicate/);
facilities.update();assert.equal(hint.textContent,'Press E to Play Near');assert.equal(button.textContent,'Play Near');
button.dispatchEvent(new globalThis.Event('click'));assert.equal(facilities.active,near);
far.interactionDistance=0;facilities.update();assert.equal(button.textContent,'Get Off Near','active facility retains ownership');
const key=repeat=>{
  const event=new globalThis.Event('keydown',{cancelable:true});event.code='KeyE';event.repeat=repeat;
  globalThis.window.dispatchEvent(event);
};
key(true);assert(near.active,'key repeat cannot accidentally dismount');
key(false);assert(!facilities.active,'desktop key and touch action share the same interaction');
facilities.step(PHYS.step);assert.equal(near.steps,1);assert.equal(far.steps,1,'inactive facilities continue simulation');
near.interactionDistance=far.interactionDistance=Infinity;facilities.update();assert(prompt.hidden);
near.interactionDistance=0;key(false);assert(near.active);facilities.reset();assert(!facilities.active);
facilities.dispose();key(false);assert(!near.active,'disposal removes keyboard listeners');
assert(prompt.removed&&near.disposed&&far.disposed,'facility UI and resources are disposed');
console.log('Facility selection, shared controls, exclusive ownership, reset and disposal verified');
