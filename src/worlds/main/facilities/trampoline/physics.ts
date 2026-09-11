import { Vector3 } from 'three/webgpu';
import type { SoftBody } from '../../../../physics/soft-body.js';
import { PHYS } from '../../../../physics/constants.js';

export const TRAMPOLINE={x:.165,z:-.035,radius:.10,matRadius:.075,height:.043,
  rimMajorRadius:.091,rimMinorRadius:.010,rimCenterOffset:.001,rimHalfHeight:.0075,
  interactionRadius:.145,maxBounce:.105,laughHeight:.035};

/** A unilateral spring bed: loaded compression/rebound, then gravity-only flight.
 * A bounded leg drive replenishes energy on the upstroke; the FEM rider keeps
 * its own elastic response to the moving support instead of scaling a mesh.
 */
export class TrampolinePhysics {
  readonly body:SoftBody;
  readonly restCenter=new Vector3();
  active=false;
  supported=true;
  height=0;
  speed=0;
  compression=0;
  private elapsed=0;
  private emptySpeed=0;
  private footMass=0;
  private readonly footWeights:number[]=[];
  constructor(body:SoftBody) {
    this.body=body;
    for(let i=0;i<body.mass.length;i++) {
      this.restCenter.addScaledVector(new Vector3().fromArray(body.rest,i*3),body.mass[i]/body.totalMass);
      const weight=Math.max(0,1-body.rest[i*3+1]/.018);
      this.footWeights.push(weight);this.footMass+=weight*body.mass[i];
    }
  }
  get nearby() {
    return !this.body.grab&&this.body.grounded&&Math.hypot(this.body.center.x-TRAMPOLINE.x,this.body.center.z-TRAMPOLINE.z)<TRAMPOLINE.interactionRadius;
  }
  get bounceHeight() {return Math.max(0,this.body.center.y-this.restCenter.y-TRAMPOLINE.height);}
  toggle() {
    if(this.active){this.leave();return true;}
    if(!this.nearby)return false;
    this.active=true;this.supported=true;this.elapsed=0;this.height=this.compression;this.speed=0;
    const b=this.body;
    for(let j=0;j<b.x.length;j+=3) {
      b.x[j]=b.rest[j]+TRAMPOLINE.x;
      b.x[j+1]=b.rest[j+1]+TRAMPOLINE.height+this.height+.001;
      b.x[j+2]=b.rest[j+2]+TRAMPOLINE.z;
    }
    b.previous.set(b.x);b.velocity.fill(0);b.wake();b.updateCenter();b.surfaceDirty=true;
    return true;
  }
  leave() {
    const b=this.body,dx=TRAMPOLINE.x-.145-b.center.x,dz=TRAMPOLINE.z-b.center.z;
    let low=Infinity;for(let j=1;j<b.x.length;j+=3)low=Math.min(low,b.x[j]);
    for(let j=0;j<b.x.length;j+=3){b.x[j]+=dx;b.x[j+1]+=PHYS.floor+.003-low;b.x[j+2]+=dz;}
    b.previous.set(b.x);b.velocity.fill(0);b.updateCenter();b.wake();b.surfaceDirty=true;
    this.emptySpeed=this.supported?this.speed:0;this.active=false;
  }
  reset() {this.active=false;this.supported=true;this.height=0;this.speed=0;this.compression=0;this.emptySpeed=0;this.elapsed=0;}
  step(h:number) {
    if(!this.active) {
      this.emptySpeed+=(-3800*this.compression-20*this.emptySpeed)*h;
      this.compression+=this.emptySpeed*h;
      if(Math.abs(this.compression)<.00001&&Math.abs(this.emptySpeed)<.0001)this.compression=this.emptySpeed=0;
      return;
    }
    this.elapsed+=h;
    const b=this.body,mass=b.totalMass,stiffness=95;
    let vy=0,footHeight=0,footSpeed=0;
    for(let i=0;i<b.mass.length;i++) {
      const j=i*3,w=this.footWeights[i]*b.mass[i]/this.footMass;
      vy+=b.velocity[j+1]*b.mass[i]/mass;
      footHeight+=(b.x[j+1]-b.rest[j+1]-TRAMPOLINE.height)*w;
      footSpeed+=b.velocity[j+1]*w;
    }
    this.height=b.center.y-this.restCenter.y-TRAMPOLINE.height;this.speed=vy;
    this.supported=footHeight<0;
    let force=0;
    if(this.supported) {
      this.compression=footHeight;this.emptySpeed=footSpeed;
      const target=.003+(TRAMPOLINE.maxBounce-.003)*(1-Math.exp(-this.elapsed/10));
      const energy=.5*mass*vy*vy+.5*stiffness*footHeight*footHeight+mass*PHYS.gravity*this.height;
      const missing=Math.max(0,mass*PHYS.gravity*target-energy);
      const pump=footSpeed>0?Math.min(1.2,missing*16*footSpeed/(footSpeed*footSpeed+.01)):0;
      // Unilateral support acts through the feet. The FEM transmits the impact
      // into the torso; the same foot load depresses the visible bed.
      force=Math.max(0,-stiffness*footHeight-.25*footSpeed+pump);
    } else {
      this.emptySpeed+=(-3800*this.compression-20*this.emptySpeed)*h;
      this.compression+=this.emptySpeed*h;
      if(Math.abs(this.compression)<.00001&&Math.abs(this.emptySpeed)<.0001)this.compression=this.emptySpeed=0;
    }
    b.canSleep=false;b.wake();
    for(let i=0;i<b.mass.length;i++) {
      const j=i*3;
      b.velocity[j]+=(900*(TRAMPOLINE.x+b.rest[j]-b.x[j])-30*b.velocity[j])*h;
      b.velocity[j+2]+=(900*(TRAMPOLINE.z+b.rest[j+2]-b.x[j+2])-30*b.velocity[j+2])*h;
      // Zero-net-force internal posture: centre of mass stays ballistic in air.
      b.velocity[j+1]+=(300*(b.center.y+b.rest[j+1]-this.restCenter.y-b.x[j+1])-12*(b.velocity[j+1]-vy)
        +force*this.footWeights[i]/this.footMass)*h;
    }
  }
}
