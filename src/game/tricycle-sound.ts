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

/** Two small rubber/axle chirps per cycle, with silence between each soft stroke. */
export function makeTricycleSqueakSample(sampleRate:number) {
  const length=Math.max(32,Math.round(sampleRate*1.25)),out=new Float32Array(length);
  for(let i=0;i<length;i++) {
    const t=i/sampleRate;
    for(const [start,duration,pitch,strength] of [[.10,.16,900,1],[.73,.12,1020,.68]]) {
      const u=(t-start)/duration;
      if(u<=0||u>=1)continue;
      const envelope=Math.sin(Math.PI*u)**3;
      const phase=2*Math.PI*duration*(pitch*u-125*u*u);
      // A clear but still toy-sized transient; the layer gain below keeps this
      // below the rolling bed after the shared master compressor.
      out[i]+=.16*strength*envelope*(Math.sin(phase)+.18*Math.sin(phase*2));
    }
  }
  return out;
}

/** One quiet loop whose gain, filter and rate follow the physical tricycle speed. */
export class TricycleRollAudio {
  private source:AudioBufferSourceNode|null=null;
  private squeakSource:AudioBufferSourceNode|null=null;
  private gain:GainNode|null=null;
  private squeakGain:GainNode|null=null;
  private filter:BiquadFilterNode|null=null;
  private squeakFilter:BiquadFilterNode|null=null;
  private panner:StereoPannerNode|null=null;
  private buffer:AudioBuffer|null=null;
  private squeakBuffer:AudioBuffer|null=null;
  readonly context:AudioContext;
  readonly output:AudioNode;
  constructor(context:AudioContext,output:AudioNode){this.context=context;this.output=output;}

  update(speed:number,distance:number,pan:number) {
    const ctx=this.context;
    if(ctx.state!=='running')return;
    const amount=clamp01((Math.abs(speed)-ROLL_START_SPEED)/(MAX_TRICYCLE_SPEED-ROLL_START_SPEED));
    if(amount>0&&!this.source)this.start();
    if(!this.source||!this.squeakSource||!this.gain||!this.squeakGain||!this.filter||!this.squeakFilter||!this.panner)return;
    const now=ctx.currentTime,attenuation=1/(1+(distance/.55)**2);
    // Keep this beneath impacts/laughter: it should read as rolling texture,
    // not as an engine or a second music layer.
    const level=amount<=0?0:.042*(.20+.80*Math.sqrt(amount))*attenuation;
    this.gain.gain.setTargetAtTime(level,now,.045);
    this.filter.frequency.setTargetAtTime(240+amount*430,now,.055);
    this.source.playbackRate.setTargetAtTime(.48+amount*1.42,now,.07);
    // The squeak has its own narrow, higher band and gain. Keeping it on a
    // separate source makes the chirps survive the tyre filter instead of
    // disappearing into the rolling texture, while the same amount/attenuation
    // gate guarantees silence unless the rider is moving.
    const squeakLevel=amount<=0?0:.105*(.34+.66*Math.sqrt(amount))*attenuation;
    this.squeakGain.gain.setTargetAtTime(squeakLevel,now,.06);
    this.squeakFilter.frequency.setTargetAtTime(700+amount*320,now,.07);
    this.squeakSource.playbackRate.setTargetAtTime(.82+amount*.50,now,.09);
    this.panner.pan.setTargetAtTime(Math.max(-.65,Math.min(.65,pan)),now,.04);
  }

  stop() {
    const source=this.source;
    const squeakSource=this.squeakSource;
    this.source=null;
    this.squeakSource=null;
    if(source){source.stop();source.disconnect();}
    if(squeakSource){squeakSource.stop();squeakSource.disconnect();}
    this.gain?.disconnect();this.squeakGain?.disconnect();
    this.filter?.disconnect();this.squeakFilter?.disconnect();this.panner?.disconnect();
    this.gain=null;this.squeakGain=null;this.filter=null;this.squeakFilter=null;this.panner=null;
  }

  dispose(){this.stop();this.buffer=null;this.squeakBuffer=null;}

  private start() {
    const ctx=this.context;
    if(!this.buffer) {
      const data=makeTricycleRollSample(ctx.sampleRate);
      this.buffer=ctx.createBuffer(1,data.length,ctx.sampleRate);this.buffer.copyToChannel(data,0);
    }
    if(!this.squeakBuffer) {
      const data=makeTricycleSqueakSample(ctx.sampleRate);
      this.squeakBuffer=ctx.createBuffer(1,data.length,ctx.sampleRate);this.squeakBuffer.copyToChannel(data,0);
    }
    const source=ctx.createBufferSource(),squeakSource=ctx.createBufferSource();
    const filter=ctx.createBiquadFilter(),squeakFilter=ctx.createBiquadFilter();
    const gain=ctx.createGain(),squeakGain=ctx.createGain(),panner=ctx.createStereoPanner();
    source.buffer=this.buffer;source.loop=true;source.playbackRate.value=.48;
    squeakSource.buffer=this.squeakBuffer;squeakSource.loop=true;squeakSource.playbackRate.value=.82;
    filter.type='bandpass';filter.frequency.value=240;filter.Q.value=.55;gain.gain.value=0;panner.pan.value=0;
    squeakFilter.type='bandpass';squeakFilter.frequency.value=650;squeakFilter.Q.value=1.15;squeakGain.gain.value=0;
    source.connect(filter).connect(gain).connect(panner).connect(this.output);
    squeakSource.connect(squeakFilter).connect(squeakGain).connect(panner);
    this.source=source;this.squeakSource=squeakSource;this.filter=filter;this.squeakFilter=squeakFilter;
    this.gain=gain;this.squeakGain=squeakGain;this.panner=panner;
    source.start(ctx.currentTime);squeakSource.start(ctx.currentTime);
  }
}
