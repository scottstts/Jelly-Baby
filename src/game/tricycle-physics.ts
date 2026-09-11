import { Vector3, Euler, Quaternion } from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';
import type { CollisionBox } from '../physics/facility-collision.ts';
import { PHYS, clamp } from '../physics/constants.js';
import { TRACK_START, ROAD_HEIGHT } from './toy-track-layout.ts';
import { constrainToRoad, WHEEL_CONTACTS, wheelHeight } from './tricycle-road-contact.ts';
import { tricycleBoxCollider, tricycleCircleContact, type TricycleCollider } from './tricycle-collision.ts';

const FOOTPRINT=[
  {x:0,z:.056,r:.022},
  {x:-.036,z:-.034,r:.0165},
  {x:.036,z:-.034,r:.0165},
  {x:0,z:.008,r:.018},
] as const;
const INERTIA_PER_MASS=.003;
const IMPACT_RESTITUTION=.10;
const IMPACT_FRICTION=.24;
const IMPACT_SOUND_SPEED=.035;
const CONTACT_HOLD=.11;

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
  private lateralSpeed=0;
  private impactYawRate=0;
  private roadContactHold=0;
  private readonly obstacleContactHold:number[]=[];
  private readonly obstacleImpactArmed:number[]=[];
  private readonly obstacleStepClosing:number[]=[];
  private readonly onTrack:boolean;
  private readonly rotation=new Quaternion();
  private readonly riderPoint=new Vector3();
  onCrash:(strength:number)=>void=()=>{};
  private standingFor=0;
  private flightFor=0;
  private rideFor=0;
  private readonly boxes:readonly CollisionBox[];
  private vehicleColliders:readonly TricycleCollider[];
  private readonly authoredVehicleColliders:boolean;
  private genericColliderBoxCount=-1;
  constructor(body:SoftBody,boxes:readonly CollisionBox[],onTrack=false,vehicleColliders?:readonly TricycleCollider[]) {
    this.body=body;this.boxes=boxes;this.onTrack=onTrack;this.position.y=onTrack?ROAD_HEIGHT:0;
    this.authoredVehicleColliders=vehicleColliders!==undefined;this.vehicleColliders=vehicleColliders??[];this.syncVehicleColliders();
    this.obstacleContactHold.length=this.vehicleColliders.length;this.obstacleContactHold.fill(0);
    this.obstacleImpactArmed.length=this.vehicleColliders.length;this.obstacleImpactArmed.fill(0);
    this.obstacleStepClosing.length=this.vehicleColliders.length;this.obstacleStepClosing.fill(0);
  }
  private syncVehicleColliders() {
    if(this.authoredVehicleColliders||this.genericColliderBoxCount===this.boxes.length)return;
    this.vehicleColliders=this.boxes.filter(box=>box.center.y+box.halfSize.y>ROAD_HEIGHT+.014).map(box=>tricycleBoxCollider(box));
    this.genericColliderBoxCount=this.boxes.length;
    this.obstacleContactHold.length=this.vehicleColliders.length;
    this.obstacleImpactArmed.length=this.vehicleColliders.length;
    this.obstacleStepClosing.length=this.vehicleColliders.length;
    for(let i=0;i<this.obstacleContactHold.length;i++){this.obstacleContactHold[i]??=0;this.obstacleImpactArmed[i]??=0;this.obstacleStepClosing[i]??=0;}
  }
  get nearby(){return !this.crying&&!this.body.grab&&this.body.grounded&&this.body.center.distanceTo(this.position)<.13;}
  get rollingSpeed(){return Math.hypot(this.speed,this.lateralSpeed);}
  toggle() {
    if(this.riding){this.leave();return true;}
    if(!this.nearby)return false;
    this.riding=true;this.rideFor=0;this.laughing=false;this.speed=0;this.lateralSpeed=0;this.impactYawRate=0;
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
  reset(){
    this.position.set(TRACK_START.x,this.onTrack?ROAD_HEIGHT:0,TRACK_START.z);this.yaw=TRACK_START.yaw;
    this.speed=this.steering=this.travel=this.throttle=this.turn=this.pitch=this.roll=this.heightSpeed=this.lateralSpeed=this.impactYawRate=this.roadContactHold=0;
    this.obstacleContactHold.fill(0);this.riding=this.laughing=this.crying=this.recovering=false;this.standingFor=this.flightFor=this.rideFor=0;
  }
  private impact(speed:number) {
    if(speed>=IMPACT_SOUND_SPEED)this.onCrash(speed);
    if(speed<.22||!this.laughing)return;
    this.riding=this.laughing=false;this.crying=this.recovering=true;this.flightFor=this.standingFor=0;this.throttle=this.turn=0;
    // Release supports without removing the body's incoming momentum. Lower
    // nodes kick up more than the crown, so the launch shears the live FEM body.
    for(let j=0;j<this.body.velocity.length;j+=3)this.body.velocity[j+1]+=.19+Math.max(0,1-this.body.rest[j+1]/.06)*.12;
    this.body.wake();
  }
  private applyStaticImpulse(vx:number,vz:number,normalX:number,normalZ:number,contactX:number,contactZ:number,driveYawRate:number) {
    const rx=contactX-this.position.x,rz=contactZ-this.position.z;
    const lever=rz*normalX-rx*normalZ;
    const angularVelocity=driveYawRate+this.impactYawRate;
    const normalVelocity=vx*normalX+vz*normalZ+angularVelocity*lever;
    if(normalVelocity>=0)return {vx,vz,closing:0};
    const closing=-normalVelocity,restitution=closing>.07?IMPACT_RESTITUTION:0;
    const normalDenominator=1+lever*lever/INERTIA_PER_MASS;
    const normalImpulse=-(1+restitution)*normalVelocity/normalDenominator;
    vx+=normalImpulse*normalX;vz+=normalImpulse*normalZ;
    this.impactYawRate=clamp(this.impactYawRate+normalImpulse*lever/INERTIA_PER_MASS,-3.5,3.5);

    const tangentX=-normalZ,tangentZ=normalX,tangentLever=rz*tangentX-rx*tangentZ;
    const tangentialVelocity=vx*tangentX+vz*tangentZ+(driveYawRate+this.impactYawRate)*tangentLever;
    const tangentDenominator=1+tangentLever*tangentLever/INERTIA_PER_MASS;
    const freeFrictionImpulse=-tangentialVelocity/tangentDenominator;
    const frictionLimit=normalImpulse*IMPACT_FRICTION;
    const frictionImpulse=clamp(freeFrictionImpulse,-frictionLimit,frictionLimit);
    vx+=frictionImpulse*tangentX;vz+=frictionImpulse*tangentZ;
    this.impactYawRate=clamp(this.impactYawRate+frictionImpulse*tangentLever/INERTIA_PER_MASS,-3.5,3.5);
    return {vx,vz,closing};
  }
  private resolveObstacleContacts(vx:number,vz:number,driveYawRate:number) {
    const c=Math.cos(this.yaw),s=Math.sin(this.yaw);
    for(let i=0;i<this.vehicleColliders.length;i++){this.obstacleImpactArmed[i]=this.obstacleContactHold[i]<=0?1:0;this.obstacleStepClosing[i]=0;}
    for(let pass=0;pass<3;pass++) {
      let changed=false;
      for(const footprint of FOOTPRINT) {
        for(let i=0;i<this.vehicleColliders.length;i++) {
          const circleX=this.position.x+c*footprint.x+s*footprint.z,circleZ=this.position.z-s*footprint.x+c*footprint.z;
          const contact=tricycleCircleContact(circleX,circleZ,footprint.r,this.vehicleColliders[i]);
          if(!contact)continue;
          this.obstacleContactHold[i]=CONTACT_HOLD;
          const impulse=this.applyStaticImpulse(vx,vz,contact.normalX,contact.normalZ,contact.contactX,contact.contactZ,driveYawRate);
          vx=impulse.vx;vz=impulse.vz;this.obstacleStepClosing[i]=Math.max(this.obstacleStepClosing[i],impulse.closing);
          this.position.x+=contact.normalX*contact.depth;this.position.z+=contact.normalZ*contact.depth;changed=true;
        }
      }
      if(!changed)break;
    }
    for(let i=0;i<this.vehicleColliders.length;i++)if(this.obstacleImpactArmed[i]&&this.obstacleStepClosing[i]>0)this.impact(this.obstacleStepClosing[i]);
    return {vx,vz};
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
    this.syncVehicleColliders();
    for(let i=0;i<this.obstacleContactHold.length;i++)this.obstacleContactHold[i]=Math.max(0,this.obstacleContactHold[i]-h);
    this.roadContactHold=Math.max(0,this.roadContactHold-h);
    this.lateralSpeed*=Math.exp(-8*h);this.impactYawRate*=Math.exp(-6*h);
    if(Math.abs(this.lateralSpeed)<1e-5)this.lateralSpeed=0;if(Math.abs(this.impactYawRate)<1e-5)this.impactYawRate=0;

    const oldYaw=this.yaw,oldSteering=this.steering;
    this.steering+=(this.turn*.52-this.steering)*(1-Math.exp(-8*h));
    const acceleration=this.riding?this.throttle*.24:0;
    const braking=this.riding&&this.throttle*this.speed<0?1.2:0;
    this.speed+=(acceleration-this.speed*(braking?5:.38)-Math.sign(this.speed)*.012)*h;
    if(!this.throttle&&Math.abs(this.speed)<.001)this.speed=0;
    this.speed=clamp(this.speed,-.10,.34);
    const driveYawRate=clamp(this.speed*Math.tan(this.steering)/.09,-2.2,2.2);
    this.yaw+=(driveYawRate+this.impactYawRate)*h;
    const forwardX=Math.sin(this.yaw),forwardZ=Math.cos(this.yaw),sideX=Math.cos(this.yaw),sideZ=-Math.sin(this.yaw);
    let vx=forwardX*this.speed+sideX*this.lateralSpeed,vz=forwardZ*this.speed+sideZ*this.lateralSpeed;
    this.position.x+=vx*h;this.position.z+=vz*h;
    ({vx,vz}=this.resolveObstacleContacts(vx,vz,driveYawRate));
    if(this.onTrack) {
      const road=constrainToRoad(this.position,this.yaw);
      if(road.hit) {
        const contactX=this.position.x+Math.cos(this.yaw)*road.localX+Math.sin(this.yaw)*road.localZ;
        const contactZ=this.position.z-Math.sin(this.yaw)*road.localX+Math.cos(this.yaw)*road.localZ;
        const fresh=this.roadContactHold<=0;this.roadContactHold=CONTACT_HOLD;
        const impulse=this.applyStaticImpulse(vx,vz,road.x,road.z,contactX,contactZ,driveYawRate);vx=impulse.vx;vz=impulse.vz;
        if(fresh&&impulse.closing>0)this.impact(impulse.closing);
      }
    }
    this.speed=clamp(vx*forwardX+vz*forwardZ,-.10,.34);
    this.lateralSpeed=clamp(vx*sideX+vz*sideZ,-.14,.14);
    if(this.onTrack) {
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
      const riderVx=forwardX*this.speed+sideX*this.lateralSpeed+omega*tz,riderVz=forwardZ*this.speed+sideZ*this.lateralSpeed-omega*tx;
      b.velocity[j]+=(stiffness*(this.position.x+tx-b.x[j])-damping*(b.velocity[j]-riderVx))*h;
      const ty=this.position.y+(this.onTrack?this.riderPoint.y:.044+ry);
      b.velocity[j+1]+=(stiffness*(ty-b.x[j+1])-damping*(b.velocity[j+1]-this.heightSpeed)+PHYS.gravity)*h;
      b.velocity[j+2]+=(stiffness*(this.position.z+tz-b.x[j+2])-damping*(b.velocity[j+2]-riderVz))*h;
    }
  }
}
