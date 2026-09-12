import type { SoccerEvent } from './physics.ts';

export function soccerSample(kind:SoccerEvent|'roll',sampleRate:number) {
  const duration=kind==='roll'?1:kind==='goal'?.75:.20,data=new Float32Array(Math.ceil(duration*sampleRate));
  let seed=53817,low=0;
  for(let i=0;i<data.length;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1,t=i/sampleRate;low+=(noise-low)*.10;
    if(kind==='roll')data[i]=low*.5*(.88+.12*Math.cos(t*Math.PI*32));
    else if(kind==='goal') {for(const [start,pitch] of [[0,523],[.10,659],[.20,784]]){const age=t-start;if(age>=0)data[i]+=.09*Math.sin(2*Math.PI*pitch*age)*(1-Math.exp(-age*150))*Math.exp(-age*9);}}
    else {const pitch=kind==='post'?710:kind==='save'?125:kind==='kick'?185:240;data[i]=(.23*Math.sin(t*pitch*Math.PI*2)*Math.exp(-t*35)+low*.4*Math.exp(-t*65))*(1-Math.exp(-t*800));}
  }
  // The friction loop has a short cyclic crossfade rather than a click at wrap.
  if(kind==='roll'){const fade=Math.floor(sampleRate*.015);for(let i=0;i<fade;i++){const a=i/fade;data[i]=data[data.length-fade+i]*(1-a)+data[i]*a;}}
  else data[0]=data[data.length-1]=0;
  return data;
}

export class SoccerAudio {
  private readonly context:AudioContext;
  private readonly output:AudioNode;
  private readonly buffers=new Map<string,AudioBuffer>();
  private readonly voices=new Set<AudioBufferSourceNode>();
  private roll:AudioBufferSourceNode|null=null;
  private gain:GainNode|null=null;
  private pan:StereoPannerNode|null=null;
  private lastEvent=-1;
  constructor(context:AudioContext,output:AudioNode){this.context=context;this.output=output;}
  private buffer(kind:SoccerEvent|'roll') {
    let buffer=this.buffers.get(kind);if(!buffer){const data=soccerSample(kind,this.context.sampleRate);buffer=this.context.createBuffer(1,data.length,this.context.sampleRate);buffer.copyToChannel(data,0);this.buffers.set(kind,buffer);}return buffer;
  }
  motion(speed:number,distance:number,pan:number) {
    const ctx=this.context;if(ctx.state!=='running')return;
    if(speed>.009&&!this.roll){this.roll=ctx.createBufferSource();this.roll.buffer=this.buffer('roll');this.roll.loop=true;this.gain=ctx.createGain();this.gain.gain.value=0;this.pan=ctx.createStereoPanner();this.roll.connect(this.gain).connect(this.pan).connect(this.output);this.roll.start();}
    if(!this.roll||!this.gain||!this.pan)return;
    const amount=Math.min(1,speed/.85);this.gain.gain.setTargetAtTime(speed>.009?.075*Math.sqrt(amount)/(1+(distance/.85)**2):0,ctx.currentTime,.045);
    this.roll.playbackRate.setTargetAtTime(.6+amount*1.4,ctx.currentTime,.06);this.pan.pan.setTargetAtTime(pan,ctx.currentTime,.05);
  }
  play(kind:SoccerEvent,strength:number,distance:number,pan:number) {
    const ctx=this.context;if(ctx.state!=='running'||this.voices.size>=8||(kind!=='goal'&&ctx.currentTime-this.lastEvent<.055))return;
    this.lastEvent=ctx.currentTime;const source=ctx.createBufferSource(),gain=ctx.createGain(),panner=ctx.createStereoPanner();source.buffer=this.buffer(kind);
    gain.gain.value=(kind==='goal'?.7:.65)*Math.min(1,strength)/(1+(distance/1.7)**2);panner.pan.value=pan;
    source.connect(gain).connect(panner).connect(this.output);this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();panner.disconnect();};source.start();
  }
  stop(){for(const voice of this.voices)voice.stop();this.voices.clear();this.roll?.stop();this.roll?.disconnect();this.gain?.disconnect();this.pan?.disconnect();this.roll=null;this.gain=null;this.pan=null;}
  dispose(){this.stop();this.buffers.clear();}
}
