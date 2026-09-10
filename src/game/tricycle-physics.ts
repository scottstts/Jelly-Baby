import { Vector3, Euler, Quaternion } from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';
import type { CollisionBox } from '../physics/facility-collision.ts';
import { PHYS, clamp } from '../physics/constants.js';
import { TRACK_START, ROAD_HEIGHT } from './toy-track-layout.ts';
import { constrainToRoad, WHEEL_CONTACTS, wheelHeight } from './tricycle-road-contact.ts';

export class TricyclePhysics {
  readonly body:SoftBody;
  readonly position=new Vector3(TRACK_START.x,0,TRACK_START.z);
  yaw=TRACK_START.yaw;
  speed=0;
  steering=0;
  travel=0;
  riding=false;
  laughing=false;
  crying=false;
  recovering=false;
  throttle=0;
  turn=0;
  pitch=0;
  roll=0;
  private heightSpeed=0;
  private readonly onTrack:boolean;
  private readonly rotation=new Quaternion();
  private readonly riderPoint=new Vector3();
  onCrash:(strength:number)=>void=()=>{};
  private standingFor=0;
  private flightFor=0;
  private rideFor=0;
  private readonly boxes:readonly CollisionBox[];
  constructor(body:SoftBody,boxes:readonly CollisionBox[],onTrack=false) {this.body=body;this.boxes=boxes;this.onTrack=onTrack;this.position.y=onTrack?ROAD_HEIGHT:0;}
  get nearby(){return !this.crying&&!this.body.grab&&this.body.grounded&&this.body.center.distanceTo(this.position)<.13;}
  toggle() {
    if(this.riding){this.leave();return true;}
    if(!this.nearby)return false;
    this.riding=true;this.rideFor=0;this.laughing=false;this.speed=0;
    const b=this.body,c=Math.cos(this.yaw+this.steering),s=Math.sin(this.yaw+this.steering);
    for(let j=0;j<b.x.length;j+=3){b.x[j]=this.position.x+c*b.rest[j]+s*b.rest[j+2];b.x[j+1]=b.rest[j+1]+.044+this.position.y;b.x[j+2]=this.position.z+c*b.rest[j+2]-s*b.rest[j];}
    b.previous.set(b.x);b.velocity.fill(0);b.updateCenter();b.surfaceDirty=true;b.wake();return true;
  }
  leave() {
    const b=this.body;let low=Infinity;for(let j=1;j<b.x.length;j+=3)low=Math.min(low,b.x[j]);
    for(let j=0;j<b.x.length;j+=3){b.x[j]+=.105*Math.cos(this.yaw);b.x[j+1]+=PHYS.floor+.002-low;b.x[j+2]-=.105*Math.sin(this.yaw);}
    b.previous.set(b.x);b.velocity.fill(0);b.updateCenter();b.wake();b.surfaceDirty=true;
    this.riding=this.laughing=false;this.throttle=this.turn=0;
  }
  reset(){this.position.set(TRACK_START.x,this.onTrack?ROAD_HEIGHT:0,TRACK_START.z);this.yaw=TRACK_START.yaw;this.speed=this.steering=this.travel=this.throttle=this.turn=this.pitch=this.roll=this.heightSpeed=0;this.riding=this.laughing=this.crying=this.recovering=false;this.standingFor=this.flightFor=this.rideFor=0;}
  private impact(speed:number) {
    this.onCrash(speed);
    if(speed<.22||!this.laughing)return;
    this.riding=this.laughing=false;this.crying=this.recovering=true;this.flightFor=this.standingFor=0;this.throttle=this.turn=0;
    // Release supports without removing the body's incoming momentum. Lower
    // nodes kick up more than the crown, so the launch shears the live FEM body.
    for(let j=0;j<this.body.velocity.length;j+=3)this.body.velocity[j+1]+=.19+Math.max(0,1-this.body.rest[j+1]/.06)*.12;
    this.body.wake();
  }
  step(h:number) {
    const b=this.body;
    if(this.crying) {
      this.flightFor+=h;
      if(this.flightFor>.18&&b.grounded)this.recovering=false;
      if(!this.recovering) {
        // Compare mass-weighted crown and feet: floor contact alone is not standing.
        let topY=0,topMass=0,lowY=0,lowMass=0;
        for(let i=0;i<b.mass.length;i++){const j=i*3,m=b.mass[i];if(b.rest[j+1]>.052){topY+=b.x[j+1]*m;topMass+=m;}if(b.rest[j+1]<.015){lowY+=b.x[j+1]*m;lowMass+=m;}}
        const upright=topMass>0&&lowMass>0&&topY/topMass-lowY/lowMass>.038;
        this.standingFor=b.grounded&&upright?this.standingFor+h:0;
        if(this.standingFor>=2)this.crying=false;
      }
    }
    const oldYaw=this.yaw,oldSteering=this.steering;
    this.steering+=(this.turn*.52-this.steering)*(1-Math.exp(-8*h));
    const acceleration=this.riding?this.throttle*.24:0;
    const braking=this.riding&&this.throttle*this.speed<0?1.2:0;
    this.speed+= (acceleration-this.speed*(braking?5:.38)-Math.sign(this.speed)*.012)*h;
    if(!this.throttle&&Math.abs(this.speed)<.001)this.speed=0;
    this.speed=clamp(this.speed,-.10,.34);
    const yawRate=clamp(this.speed*Math.tan(this.steering)/.09,-2.2,2.2);
    this.yaw+=yawRate*h;
    const dx=Math.sin(this.yaw)*this.speed*h,dz=Math.cos(this.yaw)*this.speed*h;
    let nx=0,nz=0,penetration=0;
    // Three footprint circles cover wheels and chassis. Fixed 240 Hz steps
    // bound travel below 1.5 mm, smaller than the thinnest obstacle.
    for(const localZ of [-.034,.012,.056]) {
      const px=this.position.x+dx+Math.sin(this.yaw)*localZ,pz=this.position.z+dz+Math.cos(this.yaw)*localZ;
      const radius=localZ<0?.044:.019;
      for(const box of this.boxes) {
        if(box.center.y+box.halfSize.y<=ROAD_HEIGHT+.014)continue;
        const x=px-box.center.x,z=pz-box.center.z,lx=x*box.xAxis.x+z*box.xAxis.z,lz=x*box.zAxis.x+z*box.zAxis.z;
        const qx=clamp(lx,-box.halfSize.x,box.halfSize.x),qz=clamp(lz,-box.halfSize.z,box.halfSize.z);
        const ex=lx-qx,ez=lz-qz,d=Math.hypot(ex,ez);
        if(d>=radius)continue;
        let ax=d>1e-8?ex/d:0,az=d>1e-8?ez/d:0,depth=radius-d;
        if(d<=1e-8){const gx=box.halfSize.x-Math.abs(lx),gz=box.halfSize.z-Math.abs(lz);if(gx<gz){ax=lx<0?-1:1;depth+=gx;}else{az=lz<0?-1:1;depth+=gz;}}
        if(depth>penetration){penetration=depth;nx=ax*box.xAxis.x+az*box.zAxis.x;nz=ax*box.xAxis.z+az*box.zAxis.z;}
      }
    }
    this.position.x+=dx+nx*penetration;this.position.z+=dz+nz*penetration;
    if(penetration>0) {
      const closing=-this.speed*(Math.sin(this.yaw)*nx+Math.cos(this.yaw)*nz);
      if(closing>0){this.impact(closing);this.speed*=.08;}
    }
    if(this.onTrack) {
      const normal=constrainToRoad(this.position,this.yaw),closing=-this.speed*(Math.sin(this.yaw)*normal.x+Math.cos(this.yaw)*normal.z);
      if(closing>0){this.impact(closing);this.speed*=Math.max(.08,1-closing/Math.max(.001,Math.abs(this.speed)));}
      const heights=WHEEL_CONTACTS.map(w=>wheelHeight(this.position.x+Math.cos(this.yaw)*w.x+Math.sin(this.yaw)*w.z,this.position.z-Math.sin(this.yaw)*w.x+Math.cos(this.yaw)*w.z,w.r,this.boxes));
      const rear=(heights[1]+heights[2])/2,target=rear+(heights[0]-rear)*.034/.09;
      const oldHeight=this.position.y;
      this.heightSpeed+=(1800*(target-this.position.y)-65*this.heightSpeed)*h;
      this.position.y+=this.heightSpeed*h;
      // Contact floor prevents spring lag from pushing a tyre through a low prop.
      this.position.y=Math.max(target-.0005,this.position.y);
      this.heightSpeed=(this.position.y-oldHeight)/h;
      if(this.position.y>oldHeight&&Math.abs(this.speed)>.015)this.speed=Math.sign(this.speed)*Math.sqrt(Math.max(.015**2,this.speed**2-2*PHYS.gravity*(this.position.y-oldHeight)*.35));
      this.pitch+=(Math.atan2(rear-heights[0],.09)-this.pitch)*(1-Math.exp(-45*h));
      this.roll+=(Math.atan2(heights[2]-heights[1],.072)-this.roll)*(1-Math.exp(-45*h));
    }
    this.travel+=this.speed*h;
    if(!this.riding)return;
    this.rideFor+=h;if(this.rideFor>.65&&this.speed>.12)this.laughing=true;
    b.canSleep=false;b.wake();
    const angle=this.yaw+this.steering,c=Math.cos(angle),s=Math.sin(angle),omega=((this.yaw-oldYaw)+(this.steering-oldSteering))/h;
    this.rotation.setFromEuler(new Euler(this.pitch,this.yaw,this.roll,'YXZ')).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),this.steering));
    for(let i=0;i<b.mass.length;i++) {
      const j=i*3,rx=b.rest[j],ry=b.rest[j+1],rz=b.rest[j+2];
      const foot=Math.max(0,1-ry/.026),hand=Math.max(0,Math.min(1,(Math.abs(rx)-.030)/.013));
      const stiffness=300+foot*6200+hand*2300,damping=12+foot*68+hand*25;
      this.riderPoint.set(rx,.044+ry,rz).applyQuaternion(this.rotation);
      const tx=this.onTrack?this.riderPoint.x:c*rx+s*rz,tz=this.onTrack?this.riderPoint.z:c*rz-s*rx;
      const vx=Math.sin(this.yaw)*this.speed+omega*tz,vz=Math.cos(this.yaw)*this.speed-omega*tx;
      b.velocity[j]+=(stiffness*(this.position.x+tx-b.x[j])-damping*(b.velocity[j]-vx))*h;
      const ty=this.position.y+(this.onTrack?this.riderPoint.y:.044+ry);
      b.velocity[j+1]+=(stiffness*(ty-b.x[j+1])-damping*(b.velocity[j+1]-this.heightSpeed)+PHYS.gravity)*h;
      b.velocity[j+2]+=(stiffness*(this.position.z+tz-b.x[j+2])-damping*(b.velocity[j+2]-vz))*h;
    }
  }
}
