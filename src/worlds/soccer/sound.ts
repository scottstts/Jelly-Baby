import type { SoccerEvent } from './physics.ts';

export function soccerSample(kind:SoccerEvent|'run',sampleRate:number) {
  const duration=kind==='run'?.5:kind==='goal'?.75:.20,data=new Float32Array(Math.ceil(duration*sampleRate));
  let seed=53817,low=0;
  for(let i=0;i<data.length;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1,t=i/sampleRate;low+=(noise-low)*.075;
    if(kind==='run') {
      // Short artificial-turf fibers make a dry, high-frequency brush with a
      // soft footfall pulse underneath. The loop is deterministic and cached.
      const grass=noise-low,phase=(t%.125)/.125,foot=Math.exp(-phase*18);
      data[i]=grass*(.028+.075*foot)+low*.032*foot;
    } else if(kind==='goal') {
      for(const [start,pitch] of [[0,523],[.10,659],[.20,784]]){const age=t-start;if(age>=0)data[i]+=.09*Math.sin(2*Math.PI*pitch*age)*(1-Math.exp(-age*150))*Math.exp(-age*9);}
    } else {
      const pitch=kind==='post'?710:kind==='save'?125:kind==='kick'?185:240;data[i]=(.23*Math.sin(t*pitch*Math.PI*2)*Math.exp(-t*35)+low*.4*Math.exp(-t*65))*(1-Math.exp(-t*800));
    }
  }
  if(kind==='run'){const fade=Math.floor(sampleRate*.015);for(let i=0;i<fade;i++){const a=i/fade;data[i]=data[data.length-fade+i]*(1-a)+data[i]*a;}}
  else data[0]=data[data.length-1]=0;
  return data;
}

export class SoccerAudio {
  private readonly context:AudioContext;
  private readonly output:AudioNode;
  private readonly buffers=new Map<string,AudioBuffer>();
  private readonly voices=new Set<AudioBufferSourceNode>();
  private run:AudioBufferSourceNode|null=null;
  private gain:GainNode|null=null;
  private pan:StereoPannerNode|null=null;
  private lastEvent=-1;
  constructor(context:AudioContext,output:AudioNode){this.context=context;this.output=output;}
  private buffer(kind:SoccerEvent|'run') {
    let buffer=this.buffers.get(kind);if(!buffer){const data=soccerSample(kind,this.context.sampleRate);buffer=this.context.createBuffer(1,data.length,this.context.sampleRate);buffer.copyToChannel(data,0);this.buffers.set(kind,buffer);}return buffer;
  }
  motion(speed:number,distance:number,pan:number) {
    const ctx=this.context;if(ctx.state!=='running')return;
    if(speed>.012&&!this.run){this.run=ctx.createBufferSource();this.run.buffer=this.buffer('run');this.run.loop=true;this.gain=ctx.createGain();this.gain.gain.value=0;this.pan=ctx.createStereoPanner();this.run.connect(this.gain).connect(this.pan).connect(this.output);this.run.start();}
    if(!this.run||!this.gain||!this.pan)return;
    const amount=Math.min(1,speed/.44);this.gain.gain.setTargetAtTime(speed>.012?.10*Math.sqrt(amount)/(1+(distance/.85)**2):0,ctx.currentTime,.035);
    this.run.playbackRate.setTargetAtTime(.72+amount*.72,ctx.currentTime,.05);this.pan.pan.setTargetAtTime(pan,ctx.currentTime,.05);
  }
  play(kind:SoccerEvent,strength:number,distance:number,pan:number) {
    const ctx=this.context;if(ctx.state!=='running'||this.voices.size>=8||(kind!=='goal'&&ctx.currentTime-this.lastEvent<.055))return;
    this.lastEvent=ctx.currentTime;const source=ctx.createBufferSource(),gain=ctx.createGain(),panner=ctx.createStereoPanner();source.buffer=this.buffer(kind);
    gain.gain.value=(kind==='goal'?.7:.65)*Math.min(1,strength)/(1+(distance/1.7)**2);panner.pan.value=pan;
    source.connect(gain).connect(panner).connect(this.output);this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();panner.disconnect();};source.start();
  }
  stop(){for(const voice of this.voices)voice.stop();this.voices.clear();this.run?.stop();this.run?.disconnect();this.gain?.disconnect();this.pan?.disconnect();this.run=null;this.gain=null;this.pan=null;}
  dispose(){this.stop();this.buffers.clear();}
}
