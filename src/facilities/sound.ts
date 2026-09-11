export type FacilitySoundKind='swing-creak'|'swing-air'|'trampoline-land'|'trampoline-spring';
export type FacilitySoundEvent={kind:FacilitySoundKind;strength:number;x:number;y:number;z:number};
export type FacilitySoundSink=(event:FacilitySoundEvent)=>void;

const SWING_MOTION_THRESHOLD=.03;
const SWING_IDLE_RESET=.28;
const SWING_CENTER_EPSILON=.004;

/** Event timing comes from fixed physics steps; no free-running audio loop. */
export class FacilityMotionSound {
  private time=0;
  private readonly lastSound=new Map<FacilitySoundKind,number>();
  private swingCenterSide=0;
  private swingDirection=0;
  private swingPeakSpeed=0;
  private swingIdleTime=0;
  private supported=true;
  private compression=0;
  private recovering=false;
  readonly emit:FacilitySoundSink;
  readonly position:{x:number;y:number;z:number};
  constructor(emit:FacilitySoundSink,position:{x:number;y:number;z:number}) {this.emit=emit;this.position=position;}
  private play(kind:FacilitySoundKind,strength:number) {
    if(strength<.035||this.time-(this.lastSound.get(kind)??-1)<.16)return;
    this.lastSound.set(kind,this.time);this.emit({kind,strength:Math.min(1,strength),...this.position});
  }
  swing(h:number,angle:number,speed:number,loaded:boolean) {
    this.time+=h;
    const weight=loaded?1:.45,magnitude=Math.abs(speed);
    if(magnitude>SWING_MOTION_THRESHOLD) {
      const direction=Math.sign(speed);this.swingIdleTime=0;
      if(this.swingDirection===0) {
        this.swingDirection=direction;this.swingPeakSpeed=magnitude;
      } else if(direction!==this.swingDirection) {
        // A creak is caused by the speed that is actually being arrested at
        // the reversal, not by how high the seat happens to be.
        this.play('swing-creak',this.swingPeakSpeed/3.6*weight);
        this.swingDirection=direction;this.swingPeakSpeed=magnitude;
      } else this.swingPeakSpeed=Math.max(this.swingPeakSpeed,magnitude);
    } else {
      this.swingIdleTime+=h;
      if(this.swingIdleTime>SWING_IDLE_RESET) {
        this.swingDirection=0;this.swingPeakSpeed=0;
      }
    }
    let centerSide=this.swingCenterSide;
    if(angle>SWING_CENTER_EPSILON)centerSide=1;
    else if(angle<-SWING_CENTER_EPSILON)centerSide=-1;
    const crossedCenter=centerSide!==0&&this.swingCenterSide!==0&&centerSide!==this.swingCenterSide;
    if(crossedCenter&&magnitude>.18)this.play('swing-air',magnitude/3.6*weight);
    this.swingCenterSide=centerSide;
  }
  trampoline(h:number,supported:boolean,speed:number,compression:number,active:boolean) {
    this.time+=h;
    if(active) {
      if(supported&&!this.supported&&speed<-.065)this.play('trampoline-land',-speed/.72);
      const recovering=supported&&compression>this.compression+.000001;
      if(recovering&&!this.recovering&&compression<-.007)this.play('trampoline-spring',-compression/.034*.7);
      this.recovering=recovering;
    } else this.recovering=false;
    this.supported=supported;this.compression=compression;
  }
  reset() {this.time=0;this.lastSound.clear();this.swingCenterSide=0;this.swingDirection=0;this.swingPeakSpeed=0;this.swingIdleTime=0;this.supported=true;this.compression=0;this.recovering=false;}
}

/** Short physical textures: friction-excited resonances and damped fabric/steel.
 * Cached PCM avoids oscillator allocation or random-buffer work on each bounce.
 */
export function makeFacilitySample(kind:FacilitySoundKind,variant:number,sampleRate:number) {
  const duration=kind==='swing-creak'?.34:kind==='swing-air'?.32:kind==='trampoline-land'?.26:.38;
  const samples=new Float32Array(Math.ceil(duration*sampleRate));
  let seed=0x713c4+variant*7919,low=0,slow=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
  const detune=1+(variant-1)*.035;
  const modes=kind==='trampoline-land'?[79,127,193]:kind==='trampoline-spring'?[237,391,617]:[183,307,479];
  const states=modes.map(f=>({a:2*Math.exp(-1/(sampleRate*.045))*Math.cos(2*Math.PI*f*detune/sampleRate),b:Math.exp(-2/(sampleRate*.045)),u:0,v:0}));
  for(let i=0;i<samples.length;i++) {
    const t=i/sampleRate,noise=random();low+=.15*(noise-low);slow+=.025*(noise-slow);
    const attack=1-Math.exp(-t/(kind==='swing-air'?.06:.005));
    let value=0;
    if(kind==='swing-air')value=(low-slow)*Math.sin(Math.PI*t/duration)**2*.36;
    else if(kind==='swing-creak') {
      const friction=(low-slow)*(.55+.45*Math.sin(2*Math.PI*(32+variant*4)*t)**2);
      for(const state of states) {
        const next=friction*.012+state.a*state.u-state.b*state.v;state.v=state.u;state.u=next;value+=next*.045;
      }
      value=(value+friction*.12)*attack*Math.max(0,Math.sin(Math.PI*t/duration))**1.5;
    } else {
      const landing=kind==='trampoline-land';
      value=(low-slow)*Math.exp(-t/(landing?.024:.055))*(landing?.45:.12);
      for(let j=0;j<modes.length;j++) {
        // Inharmonic partials have no cartoon pitch slide or musical interval.
        value+=Math.sin(2*Math.PI*modes[j]*detune*t)*Math.exp(-t/((landing?.055:.095)/(1+j*.4)))*(landing?.12:.034)/(j+1);
      }
      value*=attack;
    }
    const tail=Math.max(0,Math.min(1,(duration-t)/.02));
    samples[i]=Math.max(-.65,Math.min(.65,value))*tail;
  }
  samples[0]=samples[samples.length-1]=0;
  return samples;
}

export class FacilityAudio {
  private readonly buffers=new Map<string,AudioBuffer>();
  private readonly voices=new Set<AudioBufferSourceNode>();
  private readonly lastPlayed=new Map<FacilitySoundKind,number>();
  private variant=0;
  readonly context:AudioContext;
  readonly output:AudioNode;
  constructor(context:AudioContext,output:AudioNode) {this.context=context;this.output=output;}
  play(event:FacilitySoundEvent,distance:number,pan:number) {
    const ctx=this.context;
    if(ctx.state!=='running'||distance>.9||this.voices.size>=6)return;
    const now=ctx.currentTime;
    // Catch-up substeps can cross several events at one audio-clock instant.
    if(now-(this.lastPlayed.get(event.kind)??-1)<.10)return;
    this.lastPlayed.set(event.kind,now);
    const key=`${event.kind}:${this.variant++%3}`;
    let buffer=this.buffers.get(key);
    if(!buffer) {
      const data=makeFacilitySample(event.kind,(this.variant-1)%3,ctx.sampleRate);
      buffer=ctx.createBuffer(1,data.length,ctx.sampleRate);buffer.copyToChannel(data,0);this.buffers.set(key,buffer);
    }
    const source=ctx.createBufferSource(),gain=ctx.createGain(),panner=ctx.createStereoPanner();
    source.buffer=buffer;
    const level=event.kind==='trampoline-land'?.38:event.kind==='swing-creak'?.28:.22;
    gain.gain.value=level*Math.max(0,Math.min(1,event.strength))/(1+(distance/.35)**2);
    panner.pan.value=Math.max(-.7,Math.min(.7,pan));
    source.connect(gain).connect(panner).connect(this.output);this.voices.add(source);
    source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();panner.disconnect();};
    source.start(now);
  }
  stop() {
    for(const source of this.voices){source.stop();source.disconnect();}
    this.voices.clear();this.lastPlayed.clear();
  }
  dispose() {this.stop();this.buffers.clear();}
}
