import assert from 'node:assert/strict';
import { Scene } from 'three/webgpu';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { loadModel } from './load-model.mjs';
import { TrampolineFacility } from '../src/worlds/main/facilities/trampoline/facility.ts';
import { TRAMPOLINE } from '../src/worlds/main/facilities/trampoline/physics.ts';
import { FaceExpression } from '../src/graphics/character/face-expression.ts';

const body=new SoftBody(loadModel()),facility=new TrampolineFacility(new Scene(),body,{add(){}}),physics=facility.physics;
assert(!facility.interact());
for(let j=0;j<body.x.length;j+=3){body.x[j]+=TRAMPOLINE.x-.11;body.x[j+2]+=TRAMPOLINE.z;}
body.updateCenter();body.grounded=true;assert(facility.interact());assert(!facility.laughing);
let earlyPeak=0,latePeak=0,compression=0,minVolume=Infinity,maxVolume=0,airtime=0,landings=0;
const face=new FaceExpression();let crossedThreshold=false,sawBlink=false,maxMatHeight=0;
for(let i=0;i<240*24;i++) {
  const wasSupported=physics.supported;
  facility.step(PHYS.step);body.step(PHYS.step);facility.afterStep();
  crossedThreshold ||= physics.bounceHeight>=TRAMPOLINE.laughHeight;
  assert.equal(facility.laughing,crossedThreshold,'laughter latches only after a high enough bounce');
  face.update(PHYS.step,false,facility.laughing);
  if(!crossedThreshold){assert.equal(face.laugh,0);sawBlink ||= face.blink>0;}
  assert(body.isFinite());assert(body.lastMinJacobian>=.12);
  if(!physics.supported)airtime+=PHYS.step;
  if(!wasSupported&&physics.supported)landings++;
  if(i<240*3)earlyPeak=Math.max(earlyPeak,physics.bounceHeight);
  if(i>240*20)latePeak=Math.max(latePeak,physics.bounceHeight);
  compression=Math.min(compression,physics.compression);
  maxMatHeight=Math.max(maxMatHeight,physics.compression);
  if(i%240===0){const volume=body.volumeRatio();minVolume=Math.min(minVolume,volume);maxVolume=Math.max(maxVolume,volume);}
}
console.log({earlyPeak,latePeak,compression,minVolume,maxVolume,airtime,landings,laughing:facility.laughing});
assert(latePeak>earlyPeak+.025,'bounce energy builds gradually');
assert(latePeak>.055&&latePeak<TRAMPOLINE.maxBounce+.025,'bounded substantial bounce');
assert(compression>-.038&&compression<-.008,'bed compresses within ground clearance');
assert(landings>8&&airtime>5,'repeated free flights and landings');
assert(minVolume>.8&&maxVolume<1.2,'rider preserves volume');assert(facility.laughing,'height threshold triggers laughter');
assert(sawBlink,'gentle initial bounces retain normal blinking');assert(maxMatHeight<.015,'unloaded recoil stays within the visual envelope');
assert(facility.interact()&&!facility.active&&!facility.laughing);
assert(body.center.x<TRAMPOLINE.x-.13,'dismount clears the frame');
for(let i=0;i<240*3;i++)facility.step(PHYS.step);
assert(Math.abs(physics.compression)<.0001,'empty mat settles');
facility.reset();assert.equal(physics.compression,0);assert(!facility.laughing);
facility.dispose();console.log('Trampoline bounce, deformation, threshold and lifecycle passed');
