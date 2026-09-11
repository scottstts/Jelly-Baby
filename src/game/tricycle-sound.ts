const ROLL_START_SPEED=.006;
const MAX_TRICYCLE_SPEED=.34;

function clamp01(value:number){return Math.max(0,Math.min(1,value));}

/** Seamless deterministic rolling texture: broad tyre hiss with a faint tread/chain pulse. */
export function makeTricycleRollSample(sampleRate:number) {
  const duration=1.25,length=Math.max(32,Math.round(sampleRate*duration));
  const raw=new Float32Array(length),out=new Float32Array(length);
  let seed=0x6d2b79f5;
  for(let i=0;i<length;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    raw[i]=seed/2147483648-1;
  }
  const at=(index:number)=>raw[(index%length+length)%length];
  for(let i=0;i<length;i++) {
    const low=(at(i-18)+at(i-9)+at(i)+at(i+9)+at(i+18))*.2;
    const slow=(at(i-72)+at(i-36)+at(i)+at(i+36)+at(i+72))*.2;
    const band=low-slow;
    const phase=(i/length*8)%1;
    const tread=Math.exp(-Math.min(phase,1-phase)*42)-.052;
    out[i]=Math.max(-.55,Math.min(.55,band*.24+tread*.055));
  }
  return out;
}

/** One quiet loop whose gain, filter and rate follow the physical tricycle speed. */
export class TricycleRollAudio {
  private source:AudioBufferSourceNode|null=null;
  private gain:GainNode|null=null;
  private filter:BiquadFilterNode|null=null;
  private panner:StereoPannerNode|null=null;
  private buffer:AudioBuffer|null=null;
  readonly context:AudioContext;
  readonly output:AudioNode;
  constructor(context:AudioContext,output:AudioNode){this.context=context;this.output=output;}

  update(speed:number,distance:number,pan:number) {
    const ctx=this.context;
    if(ctx.state!=='running')return;
    const amount=clamp01((Math.abs(speed)-ROLL_START_SPEED)/(MAX_TRICYCLE_SPEED-ROLL_START_SPEED));
    if(amount>0&&!this.source)this.start();
    if(!this.source||!this.gain||!this.filter||!this.panner)return;
    const now=ctx.currentTime,attenuation=1/(1+(distance/.55)**2);
    // Keep this beneath impacts/laughter: it should read as rolling texture,
    // not as an engine or a second music layer.
    const level=amount<=0?0:.042*(.20+.80*Math.sqrt(amount))*attenuation;
    this.gain.gain.setTargetAtTime(level,now,.045);
    this.filter.frequency.setTargetAtTime(240+amount*430,now,.055);
    this.source.playbackRate.setTargetAtTime(.48+amount*1.42,now,.07);
    this.panner.pan.setTargetAtTime(Math.max(-.65,Math.min(.65,pan)),now,.04);
  }

  stop() {
    const source=this.source;
    this.source=null;
    if(source){source.stop();source.disconnect();}
    this.gain?.disconnect();this.filter?.disconnect();this.panner?.disconnect();
    this.gain=null;this.filter=null;this.panner=null;
  }

  dispose(){this.stop();this.buffer=null;}

  private start() {
    const ctx=this.context;
    if(!this.buffer) {
      const data=makeTricycleRollSample(ctx.sampleRate);
      this.buffer=ctx.createBuffer(1,data.length,ctx.sampleRate);this.buffer.copyToChannel(data,0);
    }
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),panner=ctx.createStereoPanner();
    source.buffer=this.buffer;source.loop=true;source.playbackRate.value=.48;
    filter.type='bandpass';filter.frequency.value=240;filter.Q.value=.55;gain.gain.value=0;panner.pan.value=0;
    source.connect(filter).connect(gain).connect(panner).connect(this.output);
    this.source=source;this.filter=filter;this.gain=gain;this.panner=panner;source.start(ctx.currentTime);
  }
}
