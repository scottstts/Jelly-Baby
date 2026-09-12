import type { SoccerEvent } from './physics.ts';

export type GrassContactType='step'|'takeoff'|'land';

const GRASS_PRESENCE=.82;
const GRASS_SOFTNESS=.78;
const GRASS_MOISTURE=.58;
const GRASS_DRAG=.72;
const GRASS_RUN_CADENCE=3.55;
const GRASS_VOLUME=.60;

/** The soccer-ball event texture; grass movement uses the sound-lab graph below. */
export function soccerSample(kind:SoccerEvent,sampleRate:number) {
  const duration=kind==='goal'?.75:.20,data=new Float32Array(Math.ceil(duration*sampleRate));
  let seed=53817,low=0;
  for(let i=0;i<data.length;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1,t=i/sampleRate;low+=(noise-low)*.075;
    if(kind==='goal') {
      for(const [start,pitch] of [[0,523],[.10,659],[.20,784]]){const age=t-start;if(age>=0)data[i]+=.09*Math.sin(2*Math.PI*pitch*age)*(1-Math.exp(-age*150))*Math.exp(-age*9);}
    } else {
      const pitch=kind==='post'?710:kind==='save'?125:240;data[i]=(.23*Math.sin(t*pitch*Math.PI*2)*Math.exp(-t*35)+low*.4*Math.exp(-t*65))*(1-Math.exp(-t*800));
    }
  }
  data[0]=data[data.length-1]=0;
  return data;
}

type GrassVoice={source:AudioBufferSourceNode;nodes:AudioNode[]};

export class SoccerAudio {
  private readonly context:AudioContext;
  private readonly output:AudioNode;
  private readonly buffers=new Map<string,AudioBuffer>();
  private readonly voices=new Set<AudioBufferSourceNode>();
  private readonly grassVoices=new Set<GrassVoice>();
  private runSource:AudioBufferSourceNode|null=null;
  private runBus:GainNode|null=null;
  private runNodes:AudioNode[]=[];
  private stepTimer:ReturnType<typeof setTimeout>|null=null;
  private foot=false;
  private lastEvent=-1;
  constructor(context:AudioContext,output:AudioNode){this.context=context;this.output=output;}
  private buffer(kind:SoccerEvent) {
    let buffer=this.buffers.get(kind);if(!buffer){const data=soccerSample(kind,this.context.sampleRate);buffer=this.context.createBuffer(1,data.length,this.context.sampleRate);buffer.copyToChannel(data,0);this.buffers.set(kind,buffer);}return buffer;
  }
  private noiseBuffer(seconds:number) {
    const n=Math.ceil(this.context.sampleRate*seconds),buffer=this.context.createBuffer(1,n,this.context.sampleRate),data=buffer.getChannelData(0);
    let brown=0,last=0;
    for(let i=0;i<n;i++) {
      const white=Math.random()*2-1;brown=brown*.985+white*.015;
      const smooth=white*.63+last*.37;last=smooth;data[i]=smooth*.78+brown*.9;
    }
    return buffer;
  }
  private connectGrass(node:AudioNode,stereo:number) {
    const panner=this.context.createStereoPanner();panner.pan.value=Math.max(-1,Math.min(1,stereo));node.connect(panner).connect(this.output);return panner;
  }
  private scheduleGrassVoice(source:AudioBufferSourceNode,nodes:AudioNode[],start:number,stop:number) {
    const voice={source,nodes};this.grassVoices.add(voice);
    source.onended=()=>{if(!this.grassVoices.delete(voice))return;source.disconnect();for(const node of nodes)node.disconnect();};
    source.start(start);source.stop(stop);
  }
  /** The broad friction-like contact from grass_movement_sound_lab_v2.html. */
  private grassContact(type:GrassContactType,strength:number,stereo:number) {
    const ctx=this.context;if(ctx.state!=='running'||this.grassVoices.size>=24)return;
    const t=ctx.currentTime+.008,grass=GRASS_PRESENCE,soft=GRASS_SOFTNESS,moist=GRASS_MOISTURE,drag=GRASS_DRAG;
    let dur=.16,peak=.12,attack=.012,release=.13;
    if(type==='takeoff'){dur=.24;peak=.105;attack=.025;release=.19;}
    if(type==='land'){dur=.38;peak=.165;attack=.018;release=.32;}

    const source=ctx.createBufferSource();source.buffer=this.noiseBuffer(dur);
    const highpass=ctx.createBiquadFilter();highpass.type='highpass';highpass.frequency.value=260+soft*160;
    const body=ctx.createBiquadFilter();body.type='bandpass';body.frequency.value=820+(1-moist)*520+drag*260;body.Q.value=.42+soft*.18;
    const air=ctx.createBiquadFilter();air.type='highshelf';air.frequency.value=2300;air.gain.value=-7+grass*5-moist*3;
    const gain=ctx.createGain(),amount=peak*strength*(.55+grass*.55)*GRASS_VOLUME;
    gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(amount,t+attack);
    gain.gain.setValueAtTime(amount*(.86+Math.random()*.08),t+attack+dur*.24);gain.gain.exponentialRampToValueAtTime(.0001,t+release);
    body.frequency.setValueAtTime(body.frequency.value*.82,t);body.frequency.exponentialRampToValueAtTime(body.frequency.value*1.08,t+dur*.45);body.frequency.exponentialRampToValueAtTime(body.frequency.value*.72,t+dur);
    const panner=this.connectGrass(gain,stereo);source.connect(highpass).connect(body).connect(air).connect(gain);this.scheduleGrassVoice(source,[highpass,body,air,gain,panner],t,t+dur);

    const low=ctx.createBufferSource();low.buffer=this.noiseBuffer(Math.min(.20,dur));
    const lowpass=ctx.createBiquadFilter();lowpass.type='lowpass';lowpass.frequency.value=260+soft*120;
    const lowGain=ctx.createGain(),lowAmount=(type==='land'?.036:.018)*strength*(.45+soft*.45)*GRASS_VOLUME;
    lowGain.gain.setValueAtTime(.0001,t);lowGain.gain.linearRampToValueAtTime(lowAmount,t+.018);lowGain.gain.exponentialRampToValueAtTime(.0001,t+(type==='land'?.18:.11));
    const lowPanner=this.connectGrass(lowGain,stereo*.45);low.connect(lowpass).connect(lowGain);this.scheduleGrassVoice(low,[lowpass,lowGain,lowPanner],t,t+Math.min(.20,dur));

    if(type==='land') {
      const trail=ctx.createBufferSource();trail.buffer=this.noiseBuffer(.32);
      const trailBand=ctx.createBiquadFilter();trailBand.type='bandpass';trailBand.frequency.value=1200+(1-moist)*500;trailBand.Q.value=.35;
      const trailGain=ctx.createGain();trailGain.gain.setValueAtTime(.0001,t+.055);trailGain.gain.linearRampToValueAtTime(.045*grass*strength*GRASS_VOLUME,t+.095);trailGain.gain.exponentialRampToValueAtTime(.0001,t+.34);
      const trailPanner=this.connectGrass(trailGain,-stereo*.2);trail.connect(trailBand).connect(trailGain);this.scheduleGrassVoice(trail,[trailBand,trailGain,trailPanner],t+.055,t+.375);
    }
  }
  private startRunBed() {
    if(this.runSource)return;
    const ctx=this.context,bus=ctx.createGain(),source=ctx.createBufferSource(),highpass=ctx.createBiquadFilter(),bandpass=ctx.createBiquadFilter();
    bus.gain.value=.0001;source.buffer=this.noiseBuffer(3.2);source.loop=true;highpass.type='highpass';highpass.frequency.value=520;bandpass.type='bandpass';bandpass.frequency.value=1280;bandpass.Q.value=.33;
    source.connect(highpass).connect(bandpass).connect(bus).connect(this.output);
    const now=ctx.currentTime;bus.gain.setValueAtTime(.0001,now);bus.gain.linearRampToValueAtTime(.018*(.45+GRASS_PRESENCE*.55)*GRASS_VOLUME,now+.12);
    source.onended=()=>{source.disconnect();bus.disconnect();highpass.disconnect();bandpass.disconnect();};source.start();
    this.runSource=source;this.runBus=bus;this.runNodes=[bus,highpass,bandpass];
    this.grassStep();
  }
  private stopRunBed(immediate=false) {
    const source=this.runSource,bus=this.runBus,nodes=this.runNodes;if(!source||!bus)return;
    if(this.stepTimer!==null){clearTimeout(this.stepTimer);this.stepTimer=null;}
    this.runSource=null;this.runBus=null;this.runNodes=[];
    if(immediate){try{source.stop();}catch{source.disconnect();for(const node of nodes)node.disconnect();}return;}
    const now=this.context.currentTime;bus.gain.cancelScheduledValues(now);bus.gain.setValueAtTime(Math.max(.0001,bus.gain.value),now);bus.gain.exponentialRampToValueAtTime(.0001,now+.1);
    try{source.stop(now+.14);}catch{source.disconnect();for(const node of nodes)node.disconnect();}
  }
  /** Quiet continuous surface movement under the lab's discrete pressure swells. */
  motion(speed:number) {
    if(this.context.state!=='running')return;
    if(speed>.012)this.startRunBed();else this.stopRunBed();
  }
  /** The lab's alternating low-strength run contacts at its fixed 3.55 Hz pace. */
  private grassStep() {
    this.foot=!this.foot;this.grassContact('step',.72+Math.random()*.08,this.foot?-.08:.08);
    if(this.runSource)this.stepTimer=setTimeout(()=>{this.stepTimer=null;if(this.runSource)this.grassStep();},1000/GRASS_RUN_CADENCE*(.97+Math.random()*.06));
  }
  grassJump(type:'takeoff'|'land') {this.grassContact(type,type==='land'?1.04:1,0);}
  play(kind:SoccerEvent,strength:number,distance:number,pan:number) {
    const ctx=this.context;if(ctx.state!=='running'||this.voices.size>=8||(kind!=='goal'&&ctx.currentTime-this.lastEvent<.055))return;
    this.lastEvent=ctx.currentTime;const source=ctx.createBufferSource(),gain=ctx.createGain(),panner=ctx.createStereoPanner();source.buffer=this.buffer(kind);
    gain.gain.value=(kind==='goal'?.7:.65)*Math.min(1,strength)/(1+(distance/1.7)**2);panner.pan.value=pan;
    source.connect(gain).connect(panner).connect(this.output);this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();panner.disconnect();};source.start();
  }
  stop() {
    this.stopRunBed(true);
    for(const voice of this.grassVoices){try{voice.source.stop();}catch{voice.source.disconnect();}voice.source.disconnect();for(const node of voice.nodes)node.disconnect();}this.grassVoices.clear();
    for(const voice of this.voices){try{voice.stop();}catch{voice.disconnect();}voice.disconnect();}this.voices.clear();this.lastEvent=-1;this.foot=false;
  }
  dispose(){this.stop();this.buffers.clear();}
}
