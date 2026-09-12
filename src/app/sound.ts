import type { PerspectiveCamera } from 'three/webgpu';
import { FacilityAudio, type FacilitySoundEvent } from '../facilities/sound.ts';
import { TricycleRollAudio } from '../worlds/toy-track/facilities/tricycle/sound.ts';
import { SoccerAudio } from '../worlds/soccer/sound.ts';
import type { SoccerEvent } from '../worlds/soccer/physics.ts';
type AudioWindow=Window&{webkitAudioContext?:typeof AudioContext};

export class JellySound {
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private compressor:DynamicsCompressorNode|null=null;
  private resumePromise:Promise<void>|null=null;
  private outputPrimed=false;
  private facilities:FacilityAudio|null=null;
  private tricycleRoll:TricycleRollAudio|null=null;
  private soccer:SoccerAudio|null=null;
  private listener={x:0,y:.12,z:.19,rightX:1,rightZ:0};
  private abort=new AbortController();
  muted=false;
  constructor() {
    const signal=this.abort.signal;
    window.addEventListener('pointerdown',this.unlockFromGesture,{signal});
    window.addEventListener('touchstart',this.unlockFromGesture,{passive:true,signal});
    window.addEventListener('keydown',this.unlockFromGesture,{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.stopFacilities();},{signal});
  }
  private unlockFromGesture=()=>{void this.unlock().catch(()=>{});};
  private createContext() {
    const Context=window.AudioContext??(window as AudioWindow).webkitAudioContext;
    if(!Context)return null;
    let context:AudioContext|null=null;
    try {
      context=new Context();
      const master=context.createGain();master.gain.value=this.muted?0:.62;
      const compressor=context.createDynamicsCompressor();
      compressor.threshold.value=-14;compressor.ratio.value=5;
      master.connect(compressor).connect(context.destination);
      this.context=context;this.master=master;this.compressor=compressor;
      this.facilities=new FacilityAudio(context,master);
      this.tricycleRoll=new TricycleRollAudio(context,master);
      this.soccer=new SoccerAudio(context,master);
      return context;
    } catch {
      if(context&&context.state!=='closed')void context.close().catch(()=>{});
      return null;
    }
  }
  private primeOutput(context:AudioContext) {
    if(this.outputPrimed)return;
    const source=context.createBufferSource();
    source.buffer=context.createBuffer(1,1,context.sampleRate);source.connect(context.destination);source.start();
    source.onended=()=>source.disconnect();this.outputPrimed=true;
  }
  unlock() {
    const context=this.context??this.createContext();
    if(!context||context.state==='closed')return Promise.resolve();
    this.primeOutput(context);
    if(context.state==='running')return Promise.resolve();
    if(this.resumePromise)return this.resumePromise;
    try {
      this.resumePromise=context.resume().catch(()=>{}).finally(()=>{this.resumePromise=null;});
    } catch {this.resumePromise=null;return Promise.resolve();}
    return this.resumePromise;
  }
  toggle() {
    this.muted=!this.muted;
    if(this.muted)this.stopFacilities();
    if(this.context&&this.master) this.master.gain.setTargetAtTime(this.muted?0:.62,this.context.currentTime,.025);
    return this.muted;
  }
  listen(camera:PerspectiveCamera) {
    const {x,y,z}=camera.position,e=camera.matrixWorld.elements;
    this.listener={x,y,z,rightX:e[0],rightZ:e[2]};
  }
  facility=(event:FacilitySoundEvent)=>{
    if(this.muted||document.hidden)return;
    const l=this.listener,dx=event.x-l.x,dy=event.y-l.y,dz=event.z-l.z,distance=Math.hypot(dx,dy,dz);
    this.facilities?.play(event,distance,(dx*l.rightX+dz*l.rightZ)/Math.max(.12,distance));
  };
  stopFacilities() {this.facilities?.stop();this.tricycleRoll?.stop();this.soccer?.stop();}
  soccerMotion(speed:number,p:{x:number;y:number;z:number}) {
    if(this.muted||document.hidden)return;const l=this.listener,dx=p.x-l.x,dz=p.z-l.z,distance=Math.hypot(dx,p.y-l.y,dz);
    this.soccer?.motion(speed,distance,Math.max(-.7,Math.min(.7,(dx*l.rightX+dz*l.rightZ)/Math.max(.12,distance))));
  }
  soccerLanding(speed:number,p:{x:number;y:number;z:number}) {
    if(this.muted||document.hidden)return;const l=this.listener,dx=p.x-l.x,dz=p.z-l.z,distance=Math.hypot(dx,p.y-l.y,dz);
    this.soccer?.landing(Math.min(1,speed/.62),distance,Math.max(-.7,Math.min(.7,(dx*l.rightX+dz*l.rightZ)/Math.max(.12,distance))));
  }
  soccerEvent(kind:SoccerEvent,strength:number,p:{x:number;y:number;z:number}) {
    if(this.muted||document.hidden)return;const l=this.listener,dx=p.x-l.x,dz=p.z-l.z,distance=Math.hypot(dx,p.y-l.y,dz);
    this.soccer?.play(kind,strength,distance,Math.max(-.7,Math.min(.7,(dx*l.rightX+dz*l.rightZ)/Math.max(.12,distance))));
  }
  tricycleMotion(speed:number,x:number,y:number,z:number) {
    if(this.muted||document.hidden)return;
    const l=this.listener,dx=x-l.x,dy=y-l.y,dz=z-l.z,distance=Math.hypot(dx,dy,dz);
    this.tricycleRoll?.update(speed,distance,(dx*l.rightX+dz*l.rightZ)/Math.max(.12,distance));
  }
  contact(speed:number,foot:boolean) {
    const ctx=this.context, out=this.master;
    if(!ctx||!out||ctx.state==='closed'||this.muted) return;
    const t=ctx.currentTime, landing=!foot, strength=Math.min(1,speed/(landing?.62:.8)),impactBoost=landing?1.45:1;
    // Damped wet membrane modes, plus a brief filtered surface-contact transient.
    const base=(foot?190:125)+Math.random()*18;
    for(const [ratio,level,decay] of [[1,.28,.15],[1.63,.12,.095],[2.7,.045,.04]]) {
      const osc=ctx.createOscillator(), gain=ctx.createGain();
      osc.type='sine'; osc.frequency.setValueAtTime(base*ratio*(1+strength*.9),t);
      osc.frequency.exponentialRampToValueAtTime(base*ratio*.65,t+.07);
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(level*impactBoost*(.14+strength),t+.003);
      gain.gain.exponentialRampToValueAtTime(.0001,t+decay*(1+strength));
      osc.connect(gain).connect(out);osc.start(t);osc.stop(t+.35);
      osc.onended=()=>{osc.disconnect();gain.disconnect();};
    }
    const buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.06),ctx.sampleRate);
    const data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*Math.exp(-i/(ctx.sampleRate*.009));
    const noise=ctx.createBufferSource(), filter=ctx.createBiquadFilter(), gain=ctx.createGain();
    noise.buffer=buffer;filter.type='bandpass';filter.frequency.value=foot?950:620;filter.Q.value=1.5;
    gain.gain.value=.10*impactBoost*strength;noise.connect(filter).connect(gain).connect(out);noise.start(t);
    noise.onended=()=>{noise.disconnect();filter.disconnect();gain.disconnect();};
  }
  dispose() {
    this.facilities?.dispose();this.facilities=null;this.tricycleRoll?.dispose();this.tricycleRoll=null;
    this.soccer?.dispose();this.soccer=null;
    this.abort.abort();this.master?.disconnect();this.compressor?.disconnect();
    const context=this.context;this.context=null;this.master=null;this.compressor=null;this.resumePromise=null;
    if(context&&context.state!=='closed')void context.close().catch(()=>{});
  }
}
