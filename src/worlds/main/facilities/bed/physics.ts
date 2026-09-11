import type { SoftBody } from '../../../../physics/soft-body.js';
import { PHYS } from '../../../../physics/constants.js';

export const BED={x:.165,z:.205,width:.112,length:.148,top:.036,bodyY:.066,bodyZ:.008,radius:.14};

const S=Math.sin(.12),C=Math.cos(.12);

/** Compliant supine support; the FEM body retains deformation and volume. */
export class BedPhysics {
  active=false;
  time=0;
  readonly body:SoftBody;
  private readonly targetX:Float64Array;
  private readonly targetY:Float64Array;
  private readonly targetZ:Float64Array;
  private readonly chestWeights:Float64Array;
  constructor(body:SoftBody){
    this.body=body;
    const count=body.mass.length;
    this.targetX=new Float64Array(count);this.targetY=new Float64Array(count);this.targetZ=new Float64Array(count);
    this.chestWeights=new Float64Array(count);
    for(let i=0;i<count;i++){
      const j=i*3;
      this.targetX[i]=BED.x+body.rest[j];
      this.targetY[i]=BED.bodyY+S*body.rest[j+1]+C*body.rest[j+2];
      this.targetZ[i]=BED.z+BED.bodyZ-C*body.rest[j+1]+S*body.rest[j+2];
      this.chestWeights[i]=Math.exp(-(((body.rest[j+1]-.029)/.016)**2));
    }
  }
  get nearby(){return !this.body.grab&&this.body.grounded&&Math.hypot(this.body.center.x-BED.x,this.body.center.z-BED.z)<BED.radius;}
  toggle(){
    if(this.active){this.leave();return true;}
    if(!this.nearby)return false;
    this.active=true;this.time=0;
    const b=this.body;
    for(let i=0;i<b.mass.length;i++){
      const j=i*3;b.x[j]=this.targetX[i];b.x[j+1]=this.targetY[i];b.x[j+2]=this.targetZ[i];
    }
    this.sync();return true;
  }
  private sync(){const b=this.body;b.previous.set(b.x);b.velocity.fill(0);b.wake();b.updateCenter();b.surfaceDirty=true;}
  leave(){
    const b=this.body;
    for(let j=0;j<b.x.length;j+=3){const y=b.x[j+1]-BED.bodyY,z=b.x[j+2]-BED.z-BED.bodyZ;b.x[j]-=.105;b.x[j+1]=S*y-C*z+PHYS.floor+.003;b.x[j+2]=BED.z+C*y+S*z;}
    this.active=false;b.canSleep=true;this.sync();
  }
  step(h:number){
    if(!this.active)return;
    this.time+=h;const b=this.body;b.canSleep=false;b.wake();
    const breathScale=.00065*Math.sin(this.time*Math.PI*2/3.8);
    for(let i=0;i<b.mass.length;i++){
      const j=i*3,tx=this.targetX[i],ty=this.targetY[i]+breathScale*this.chestWeights[i],tz=this.targetZ[i];
      b.velocity[j]+=(1800*(tx-b.x[j])-65*b.velocity[j])*h;
      b.velocity[j+1]+=(1800*(ty-b.x[j+1])-65*b.velocity[j+1]+PHYS.gravity)*h;
      b.velocity[j+2]+=(1800*(tz-b.x[j+2])-65*b.velocity[j+2])*h;
    }
  }
  reset(){this.active=false;this.time=0;this.body.canSleep=true;}
}
