import assert from 'node:assert/strict';
import { FacilityAudio, FacilityMotionSound, makeFacilitySample } from '../src/facilities/sound.ts';
import { makeTricycleRollSample, makeTricycleSqueakSample, TricycleRollAudio } from '../src/worlds/toy-track/facilities/tricycle/sound.ts';

const events=[],motion=new FacilityMotionSound(event=>events.push(event),{x:0,y:0,z:0});
for(let i=0;i<240;i++)motion.swing(1/240,0,0,false);
assert.equal(events.length,0,'stationary equipment is silent');
motion.reset();events.length=0;
for(let i=0;i<240*2;i++)motion.swing(1/240,.8,.018*Math.sin(i/240*8),false);
assert.equal(events.length,0,'a high seat held against the swing does not creak from speed jitter');
for(let i=0;i<240*6;i++) {
  const t=i/240;
  motion.swing(1/240,.7*Math.sin(4*t),2.8*Math.cos(4*t),true);
  const event=events.at(-1);
  if(event&&events.length!==motion.lastCount) {
    if(event.kind==='swing-creak')assert(Math.abs(Math.cos(4*t))<.025,'hinge sound coincides with a reversal');
    if(event.kind==='swing-air')assert(Math.abs(Math.sin(4*t))<.025,'air sound coincides with the fast bottom crossing');
    motion.lastCount=events.length;
  }
}
assert(events.filter(event=>event.kind==='swing-creak').length>=6);
assert(events.filter(event=>event.kind==='swing-air').length>=6);
assert(events.length<20,'no per-frame sound flood');
motion.reset();events.length=0;
motion.trampoline(.1,false,-.5,0,true);
motion.trampoline(.1,true,-.6,-.001,true);
motion.trampoline(.04,true,-.2,-.020,true);
motion.trampoline(.04,true,.1,-.018,true);
assert.deepEqual(events.map(event=>event.kind),['trampoline-land','trampoline-spring']);
for(let i=0;i<50;i++)motion.trampoline(1/240,true,0,-.01,false);
assert.equal(events.length,2,'empty trampoline does not generate landing sounds');

for(const kind of ['swing-creak','swing-air','trampoline-land','trampoline-spring']) {
  for(const sampleRate of [44100,48000]) {
    const data=makeFacilitySample(kind,0,sampleRate);
    assert(data.every(Number.isFinite));assert.equal(data[0],0);
    assert(Math.abs(data.at(-1))<.001,'tail fades without a click');
    assert.deepEqual(data,makeFacilitySample(kind,0,sampleRate),'samples are reproducible');
    assert.notDeepEqual(data,makeFacilitySample(kind,1,sampleRate),'variants avoid identical repetition');
    const peak=data.reduce((max,value)=>Math.max(max,Math.abs(value)),0);
    const mean=data.reduce((sum,value)=>sum+value,0)/data.length;
    assert(peak>.001&&peak<=.65,'bounded audible sample');assert(Math.abs(mean)<.01,'no significant DC offset');
  }
}

let starts=0,stops=0,buffers=0;
const node=()=>({connect(){return this;},disconnect(){},gain:{value:0},pan:{value:0}});
const ctx={state:'running',currentTime:0,sampleRate:48000,
  createBuffer(_channels,length){buffers++;return {length,copyToChannel(){}};},
  createBufferSource(){return {...node(),start(){starts++;},stop(){stops++;this.onended?.();}};},
  createGain:node,createStereoPanner:node,
};
const audio=new FacilityAudio(ctx,node()),event={kind:'trampoline-land',strength:.8,x:0,y:0,z:0};
audio.play(event,.2,0);audio.play(event,.2,0);assert.equal(starts,1,'catch-up substeps cannot stack the same sound');
audio.play({...event,kind:'swing-creak'},2,0);assert.equal(starts,1,'distant facilities are silent');
ctx.state='suspended';ctx.currentTime+=1;audio.play(event,.2,0);assert.equal(starts,1,'suspended audio does not queue stale sounds');
ctx.state='running';
for(let i=0;i<20;i++){ctx.currentTime+=.2;audio.play(event,.2,0);}
assert.equal(starts,6,'voice count is bounded');assert.equal(buffers,3,'PCM variants are cached');
audio.stop();assert.equal(stops,6,'mute/reset cleanup stops every active voice');
audio.dispose();

for(const sampleRate of [44100,48000]) {
  const data=makeTricycleRollSample(sampleRate),again=makeTricycleRollSample(sampleRate);
  assert.deepEqual(data,again,'tricycle rolling texture is deterministic');
  assert(data.every(Number.isFinite));
  const peak=data.reduce((max,value)=>Math.max(max,Math.abs(value)),0),mean=data.reduce((sum,value)=>sum+value,0)/data.length;
  assert(peak>.05&&peak<.4,'rolling source stays bounded before its quiet output gain');
  assert(Math.abs(mean)<.01,'rolling source has no meaningful DC offset');
  const squeak=makeTricycleSqueakSample(sampleRate);
  assert.equal(squeak.length,data.length);
  assert(squeak.every(Number.isFinite));
  assert(squeak.some(value=>Math.abs(value)>.01),'squeak has an audible source signal');
  assert(squeak.every(value=>Math.abs(value)<.19),'squeak source remains bounded before its quiet output gain');
  assert.equal(squeak[0],0);assert.equal(squeak.at(-1),0);
  assert(squeak.filter(value=>value===0).length>squeak.length*.75,'chirps leave generous silent gaps');
}

const param=value=>({value,setTargetAtTime(next){this.value=next;}});
let rollStarts=0,rollStops=0,rollBuffers=0,sourceCalls=0,filterCalls=0,gainCalls=0,lastGain,lastSqueakGain,lastFilter,lastSqueakFilter,lastPanner,lastSource,lastSqueakSource;
const connectable=()=>({connect(target){return target;},disconnect(){}});
const rollCtx={state:'running',currentTime:0,sampleRate:48000,
  createBuffer(_channels,length){rollBuffers++;return {length,copyToChannel(){}};},
  createBufferSource(){sourceCalls++;const source={...connectable(),buffer:null,loop:false,playbackRate:param(1),start(){rollStarts++;},stop(){rollStops++;}};if(sourceCalls%2===1)lastSource=source;else lastSqueakSource=source;return source;},
  createBiquadFilter(){filterCalls++;const filter={...connectable(),type:'lowpass',frequency:param(0),Q:{value:0}};if(filterCalls%2===1)lastFilter=filter;else lastSqueakFilter=filter;return filter;},
  createGain(){gainCalls++;const gain={...connectable(),gain:param(0)};if(gainCalls%2===1)lastGain=gain;else lastSqueakGain=gain;return gain;},
  createStereoPanner(){lastPanner={...connectable(),pan:param(0)};return lastPanner;},
};
const roll=new TricycleRollAudio(rollCtx,connectable());
roll.update(0,.2,0);assert.equal(rollStarts,0,'stationary tricycle does not start a loop');
roll.update(.17,.2,.4);assert.equal(rollStarts,2,'meaningful tricycle motion starts rolling and squeak loops together');
assert(lastGain.gain.value>0&&lastGain.gain.value<.05,'rolling layer remains intentionally quiet');
assert(lastSqueakGain.gain.value>0&&lastSqueakGain.gain.value<.10,'squeak layer is audible but subordinate');
const midRate=lastSource.playbackRate.value,midFrequency=lastFilter.frequency.value;
const midSqueakRate=lastSqueakSource.playbackRate.value,midSqueakFrequency=lastSqueakFilter.frequency.value;
rollCtx.currentTime+=.1;roll.update(.34,.2,2);
assert(lastSource.playbackRate.value>midRate&&lastFilter.frequency.value>midFrequency,'speed raises rolling rate and spectral center');
assert(lastSqueakSource.playbackRate.value>midSqueakRate&&lastSqueakFilter.frequency.value>midSqueakFrequency,'speed raises squeak rate and spectral center');
assert.equal(lastPanner.pan.value,.65,'rolling pan stays within its nonintrusive stereo bound');
roll.update(0,.2,0);assert.equal(lastGain.gain.value,0,'stopped tricycle fades the persistent loop to silence');
assert.equal(lastSqueakGain.gain.value,0,'stopped tricycle fades the squeak loop to silence');
roll.stop();assert.equal(rollStops,2);roll.update(.1,.2,0);assert.equal(rollStarts,4,'rolling and squeak loops can restart after reset/world cleanup');assert.equal(rollBuffers,2,'restart reuses both cached PCM layers');
roll.dispose();assert.equal(rollStops,4);
console.log('Motion timing, silence at rest, sample bounds, tricycle rolling loop, audio caching, voice limits and cleanup passed');
