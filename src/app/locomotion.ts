import { Vector3 } from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';

/** A powered soft rig: muscles apply forces to FEM nodes, never overwrite positions. */
export class Locomotion {
  readonly move=new Vector3();
  readonly velocity=new Vector3();
  readonly center=new Vector3();
  yaw=0;
  phase=0;
  speedScale=1;
  cadenceScale=1;
  private gaitWeight=0;
  grounded=false;
  private jumpQueued=false;
  private jumpCooldown=0;
  private releasedFor=1;
  private restCenter=new Vector3();
  private elapsed=0;
  private lastImpact=-1;
  private lastStep=-1;
  onContact:(speed:number,foot:boolean)=>void=()=>{};
  /** Share the normal landing debounce with contacts resolved by facilities. */
  surfaceImpact(speed:number) {
    if(speed<=.13||this.elapsed-this.lastImpact<=.11)return false;
    this.onContact(speed,false);this.lastImpact=this.elapsed;return true;
  }
  /** Emitted only when the ordinary locomotion jump actually launches. */
  onJump:()=>void=()=>{};
  readonly body:SoftBody;
  constructor(body:SoftBody) {
    this.body=body;
    for(let i=0;i<body.mass.length;i++) this.restCenter.addScaledVector(new Vector3().fromArray(body.rest,i*3),body.mass[i]/body.totalMass);
  }
  jump() { this.jumpQueued=true; }
  reset() { this.yaw=0; this.phase=0;this.speedScale=1;this.cadenceScale=1;this.gaitWeight=0;this.jumpCooldown=0; this.jumpQueued=false; this.move.set(0,0,0); }
  step(h:number) {
    const b=this.body, x=b.x, v=b.velocity;
    this.elapsed+=h; this.jumpCooldown-=h;
    this.center.set(0,0,0); this.velocity.set(0,0,0);
    for(let i=0;i<b.mass.length;i++) {
      const j=i*3, w=b.mass[i]/b.totalMass;
      this.center.x+=x[j]*w; this.center.y+=x[j+1]*w; this.center.z+=x[j+2]*w;
      this.velocity.x+=v[j]*w; this.velocity.y+=v[j+1]*w; this.velocity.z+=v[j+2]*w;
    }
    this.grounded=b.grounded;
    const speed=this.move.length();
    b.canSleep=speed<.001&&!this.jumpQueued;
    if(!b.canSleep)b.wake();
    if(b.sleeping)return;
    if(b.grab) { this.releasedFor=0; this.jumpQueued=false; return; }
    this.releasedFor+=h;
    const recovery=Math.min(1,this.releasedFor/0.55);
    if(speed>.01) {
      const target=Math.atan2(this.move.x,this.move.z);
      const angle=Math.atan2(Math.sin(target-this.yaw),Math.cos(target-this.yaw));
      this.yaw+=angle*(1-Math.exp(-10*h));
    }
    this.gaitWeight+=(Math.min(1,speed)-this.gaitWeight)*(1-Math.exp(-12*h));
    if(this.gaitWeight<1e-5)this.gaitWeight=0;
    if(speed>.001&&this.grounded)this.phase+=h*Math.max(.25,Math.min(1,Math.hypot(this.velocity.x,this.velocity.z)/(.10*this.speedScale)))*14*this.cadenceScale;
    const co=Math.cos(this.yaw),si=Math.sin(this.yaw);
    const drive=this.grounded?1:.08;
    const targetSpeed=.145*this.speedScale;
    const ax=(this.move.x*targetSpeed-this.velocity.x)*48*drive*recovery;
    const az=(this.move.z*targetSpeed-this.velocity.z)*48*drive*recovery;
    const muscle=(this.grounded?1:.22)*recovery;
    for(let i=0;i<b.mass.length;i++) {
      const j=i*3;
      const rx=b.rest[j]-this.restCenter.x;
      let ry=b.rest[j+1]-this.restCenter.y,rz=b.rest[j+2]-this.restCenter.z;
      const foot=Math.max(0,1-b.rest[j+1]/.023);
      const arm=Math.max(0,Math.min(1,(Math.abs(rx)-.030)/.016));
      const stride=Math.sin(this.phase+(rx<0?0:Math.PI))*this.gaitWeight;
      rz+=stride*(foot*.009-arm*.004);
      ry+=Math.max(0,stride)*foot*.006;
      const tx=rx*co+rz*si, tz=rz*co-rx*si;
      // A force-controlled posture leaves shear, volume, contact and recoil to XPBD.
      const k=foot>0?1800:1000;
      v[j]+=(muscle*(k*(this.center.x+tx-x[j])-24*(v[j]-this.velocity.x))+ax)*h;
      v[j+1]+=muscle*(k*(this.center.y+ry-x[j+1])-24*(v[j+1]-this.velocity.y))*h;
      v[j+2]+=(muscle*(k*(this.center.z+tz-x[j+2])-24*(v[j+2]-this.velocity.z))+az)*h;
    }
    if(this.jumpQueued && this.grounded && this.jumpCooldown<=0) {
      for(let i=0;i<b.mass.length;i++) {
        // Feet receive more impulse; elastic transmission launches the crown a beat later.
        const foot=Math.max(0,1-b.rest[i*3+1]/.035);
        v[i*3+1]+=.43+foot*.12;
      }
      this.onJump();
      this.jumpCooldown=.24;
    }
    this.jumpQueued=false;
  }
  afterStep() {
    let contact=0;
    for(let i=0;i<this.body.contact.length;i++) contact+=this.body.contact[i]*this.body.mass[i];
    if(contact>0 && this.velocity.y<-.13)this.surfaceImpact(-this.velocity.y);
    const beat=Math.floor(this.phase/Math.PI);
    if(contact>0 && this.move.lengthSq()>.01 && beat!==this.lastStep) {
      this.lastStep=beat;
      if(this.elapsed-this.lastImpact>.10) this.onContact(.08+this.velocity.length()*.65,true);
    }
  }
}
