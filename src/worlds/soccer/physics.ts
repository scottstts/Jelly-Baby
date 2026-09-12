import { BufferAttribute, DynamicDrawUsage, Quaternion, Vector3 } from 'three/webgpu';
import { SoftBody } from '../../physics/soft-body.js';
import { PHYS, clamp } from '../../physics/constants.js';
import { BALL, ENTRANCE, FIELD, FIELD_RAMP, GOAL, SKATE } from './layout.ts';

/** Clone mutable skin/cage buffers; the goalie must never write the player's skin. */
export function makeGoalieBody(player:SoftBody) {
  const cage=player.cage;
  const cloneSurface=(surface:typeof cage.surface)=>{const positions=surface.positions.slice(),geometry=surface.geometry.clone();geometry.setAttribute('position',new BufferAttribute(positions,3).setUsage(DynamicDrawUsage));return {...surface,geometry,positions};};
  return new SoftBody({...cage,surface:cloneSurface(cage.surface),opticalSurface:cloneSurface(cage.opticalSurface as typeof cage.surface)});
}

export class SkateRig {
  readonly body:SoftBody;
  readonly move=new Vector3();
  readonly velocity=new Vector3();
  readonly position=new Vector3();
  readonly restCenter=new Vector3();
  yaw=Math.PI;
  travel=0;
  arch=0;
  jumpHeight=0;
  jumpSpeed=0;
  private meanUpper=0;
  private meanUpperSquared=0;
  get floorHeight(){const p=this.body.center;if(Math.abs(p.x-FIELD_RAMP.x)<FIELD_RAMP.width/2&&p.z>=FIELD_RAMP.start&&p.z<=FIELD_RAMP.end)return FIELD.y-(p.z-FIELD_RAMP.start)/.16*.011;return Math.abs(p.x)<=1&&Math.abs(p.z)<=FIELD.length/2||Math.abs(p.x)<GOAL.width/2+.01&&Math.abs(p.z)<FIELD.length/2+GOAL.depth?FIELD.y:PHYS.floor;}
  constructor(body:SoftBody) {
    this.body=body;for(let i=0;i<body.mass.length;i++){const weight=body.mass[i]/body.totalMass,upper=clamp(body.rest[i*3+1]/.07,0,1);this.restCenter.addScaledVector(new Vector3().fromArray(body.rest,i*3),weight);this.meanUpper+=upper*weight;this.meanUpperSquared+=upper*upper*weight;}
  }
  place(x:number,z:number,yaw:number,floor:number=FIELD.y) {
    const b=this.body,c=Math.cos(yaw),s=Math.sin(yaw);this.yaw=yaw;this.velocity.set(0,0,0);this.move.set(0,0,0);this.jumpHeight=this.jumpSpeed=this.arch=0;
    for(let j=0;j<b.x.length;j+=3) {const rx=b.rest[j]-this.restCenter.x,rz=b.rest[j+2]-this.restCenter.z;b.x[j]=x+rx*c+rz*s;b.x[j+1]=b.rest[j+1]+floor+SKATE.lift;b.x[j+2]=z+rz*c-rx*s;}
    b.previous.set(b.x);b.velocity.fill(0);b.updateCenter();b.surfaceDirty=true;b.wake();this.position.set(x,floor,z);
  }
  step(h:number,maxSpeed=.82,turnToMovement=true) {
    const b=this.body,v=b.velocity;this.velocity.set(0,0,0);
    for(let i=0;i<b.mass.length;i++){const j=i*3,w=b.mass[i]/b.totalMass;this.velocity.x+=v[j]*w;this.velocity.y+=v[j+1]*w;this.velocity.z+=v[j+2]*w;}
    const speed=this.move.length();
    if(speed>.02&&turnToMovement) {const desired=Math.atan2(this.move.x,this.move.z);this.yaw+=Math.atan2(Math.sin(desired-this.yaw),Math.cos(desired-this.yaw))*(1-Math.exp(-9*h));}
    const damping=speed>.02?6.5:2.8;
    const ax=clamp((this.move.x*maxSpeed-this.velocity.x)*damping,-3,3),az=clamp((this.move.z*maxSpeed-this.velocity.z)*damping,-3,3);
    if(this.jumpHeight>0||this.jumpSpeed>0){this.jumpSpeed-=PHYS.gravity*h;this.jumpHeight=Math.max(0,this.jumpHeight+this.jumpSpeed*h);if(!this.jumpHeight)this.jumpSpeed=0;}
    const c=Math.cos(this.yaw),s=Math.sin(this.yaw),floor=this.floorHeight,leanX=clamp(ax*.0025,-.008,.008),leanZ=clamp(az*.0025,-.008,.008);
    for(let i=0;i<b.mass.length;i++) {
      const j=i*3,rx=b.rest[j]-this.restCenter.x,ry=b.rest[j+1],rz=b.rest[j+2]-this.restCenter.z,upper=clamp(ry/.07,0,1);
      // Internal posture changes have zero mass-weighted translation. Otherwise
      // an arch can accidentally skate the entire jelly backward during windup.
      const bend=this.arch*(upper*upper-this.meanUpperSquared),tx=b.center.x+rx*c+rz*s+s*bend+leanX*(upper-this.meanUpper),tz=b.center.z+rz*c-rx*s+c*bend+leanZ*(upper-this.meanUpper);
      const ty=ry+floor+SKATE.lift+this.jumpHeight-Math.abs(this.arch)*.22*upper;
      const k=ry<.02?1700:850,drag=ry<.02?45:24;
      v[j]+=(k*(tx-b.x[j])-24*(v[j]-this.velocity.x)+ax)*h;
      v[j+1]+=(k*(ty-b.x[j+1])-drag*(v[j+1]-this.jumpSpeed)+PHYS.gravity)*h;
      v[j+2]+=(k*(tz-b.x[j+2])-24*(v[j+2]-this.velocity.z)+az)*h;
    }
    b.canSleep=false;b.wake();this.travel+=Math.hypot(this.velocity.x,this.velocity.z)*h;
    this.position.set(b.center.x,this.floorHeight+this.jumpHeight,b.center.z);
  }
}

export type SoccerEvent='kick'|'bump'|'save'|'post'|'goal';
export class SoccerPhysics {
  readonly body:SoftBody;
  readonly player:SkateRig;
  readonly goalie:SkateRig;
  readonly ball=new Vector3(0,FIELD.y+BALL.radius,0);
  readonly ballVelocity=new Vector3();
  readonly ballSpin=new Vector3();
  readonly ballRotation=new Quaternion();
  riding=false;
  score=0;
  private elapsed=0;
  private lastShot=-2;
  private shotAge=Infinity;
  private celebration=0;
  private resetBallIn=0;
  private reaction=0;
  private targetX=0;
  private targetZ=-1.43;
  private jumpCooldown=0;
  private eventHold=0;
  private goalieHold=0;
  private readonly rotation=new Quaternion();
  private readonly normal=new Vector3();
  private readonly point=new Vector3();
  private readonly previousBall=new Vector3();
  private readonly patchWeights:Float64Array;
  onEvent:(kind:SoccerEvent,strength:number,position:Vector3)=>void=()=>{};
  constructor(body:SoftBody,goalieBody=makeGoalieBody(body)) {this.body=body;this.patchWeights=new Float64Array(body.mass.length);this.player=new SkateRig(body);this.goalie=new SkateRig(goalieBody);this.goalie.place(0,-1.43,0);}
  get crying(){return this.riding&&this.shotAge<.48&&this.celebration<=0;}
  get laughing(){return this.riding&&this.celebration>0;}
  get canLeave(){return this.riding&&Math.hypot(this.body.center.x-ENTRANCE.x,this.body.center.z-(ENTRANCE.z-.08))<.22;}
  board(){this.riding=true;this.player.place(ENTRANCE.x,1.35,Math.PI);}
  leave(){this.riding=false;this.player.place(ENTRANCE.x,ENTRANCE.z+.115,0,-SKATE.lift+PHYS.floor);this.body.canSleep=true;this.shotAge=Infinity;this.celebration=0;}
  shoot() {
    if(!this.riding||this.elapsed-this.lastShot<1)return false;
    this.lastShot=this.elapsed;this.shotAge=0;return true;
  }
  private emit(kind:SoccerEvent,strength:number) {
    if(kind==='goal'||kind==='kick'||this.eventHold<=0){this.onEvent(kind,strength,this.ball);this.eventHold=.09;}
  }
  step(h:number) {
    this.elapsed+=h;this.eventHold-=h;this.jumpCooldown-=h;this.goalieHold=Math.max(0,this.goalieHold-h);this.celebration=Math.max(0,this.celebration-h);
    const previousAge=this.shotAge;this.shotAge+=h;
    this.player.arch=this.shotAge<.16?-.014*Math.sin(Math.PI*this.shotAge/.32):this.shotAge<.42?.012*Math.sin(Math.PI*(this.shotAge-.16)/.26):0;
    if(this.riding){
      // Wheel reaction provides the short forward lunge; the torso remains a
      // force-driven soft body throughout the arch/release/recovery sequence.
      const thrust=this.shotAge>=.16&&this.shotAge<.28?2.6*Math.sin(Math.PI*(this.shotAge-.16)/.12):0;
      if(thrust)for(let j=0;j<this.body.velocity.length;j+=3){this.body.velocity[j]+=Math.sin(this.player.yaw)*thrust*h;this.body.velocity[j+2]+=Math.cos(this.player.yaw)*thrust*h;}
      if(previousAge<.23&&this.shotAge>=.23)this.strike();this.player.step(h);this.thinkGoalie(h);
    }
    else this.goalie.move.set(0,0,0);
    this.goalie.step(h,.66,false);this.goalie.body.step(h);
    if(this.resetBallIn>0){this.resetBallIn-=h;if(this.resetBallIn<=0)this.centerBall();}
    this.previousBall.copy(this.ball);
    this.ballVelocity.y-=PHYS.gravity*h;
    this.ballVelocity.multiplyScalar(Math.exp(-.035*h));
    // Mild Magnus curvature follows spin transferred by glancing contacts.
    this.ballVelocity.x+=clamp(this.ballSpin.y*this.ballVelocity.z*.0007,-.3,.3)*h;
    this.ballVelocity.z-=clamp(this.ballSpin.y*this.ballVelocity.x*.0007,-.3,.3)*h;
    this.ball.addScaledVector(this.ballVelocity,h);
    this.boundaries(h);
    this.contactBody(this.goalie.body,true);
    const spinSpeed=this.ballSpin.length();if(spinSpeed>1e-5){this.rotation.setFromAxisAngle(this.normal.copy(this.ballSpin).normalize(),spinSpeed*h);this.ballRotation.premultiply(this.rotation).normalize();}
  }
  afterStep(){this.contactBody(this.body,false);this.confineSkater(this.goalie);this.player.position.set(this.body.center.x,this.player.floorHeight,this.body.center.z);}
  private strike() {
    const delta=this.normal.copy(this.ball).sub(this.body.center),planar=Math.hypot(delta.x,delta.z);
    const forward=delta.x*Math.sin(this.player.yaw)+delta.z*Math.cos(this.player.yaw);
    // No remote aim assist: a miss still performs the effort animation.
    if(planar>.082||planar<.006||Math.abs(delta.y)>.075||forward<-.005)return;
    let surfaceDistance=Infinity;
    for(const contact of this.body.contacts){const point=this.point;point.set(0,0,0);for(const [id,w] of contact.weights){point.x+=this.body.x[id*3]*w;point.y+=this.body.x[id*3+1]*w;point.z+=this.body.x[id*3+2]*w;}surfaceDistance=Math.min(surfaceDistance,point.distanceTo(this.ball));}
    if(surfaceDistance>BALL.radius+.012)return;
    delta.y=clamp((this.ball.y-(FIELD.y+.016))*.8,.003,.031);delta.normalize();
    const impulse=.0145;
    this.ballVelocity.addScaledVector(delta,impulse/BALL.mass);
    // Equal opposite impulse is distributed by node mass, preserving total momentum.
    for(let j=0;j<this.body.velocity.length;j+=3){this.body.velocity[j]-=delta.x*impulse/this.body.totalMass;this.body.velocity[j+1]-=delta.y*impulse/this.body.totalMass;this.body.velocity[j+2]-=delta.z*impulse/this.body.totalMass;}
    this.ballSpin.y+=clamp((Math.sin(this.player.yaw)*delta.z-Math.cos(this.player.yaw)*delta.x)*18,-12,12);
    this.emit('kick',1);
  }
  private thinkGoalie(h:number) {
    this.reaction-=h;
    if(this.reaction<=0) {
      this.reaction=.12;const g=this.goalie,p=this.ball,v=this.ballVelocity;
      const time=v.z<-.12?(g.body.center.z-p.z)/v.z:Infinity;
      if(time>0&&time<1.8) {
        // Fold wall rebounds into the prediction. Commit/recover prevents perfect tracking.
        const width=2*(1-BALL.radius),raw=p.x+v.x*time+width/2,phase=((raw%(2*width))+2*width)%(2*width);
        const intercept=(phase<width?phase:2*width-phase)-width/2;
        if(this.goalieHold<=0)this.targetX=clamp(intercept+.017*Math.sin(this.elapsed*3.7+this.score),-.205,.205);
        this.targetZ=-1.43;
        const height=p.y+v.y*time-.5*PHYS.gravity*time*time;
        if(time<.26&&height>FIELD.y+.078&&height<FIELD.y+.24&&this.jumpCooldown<=0&&Math.abs(intercept-g.body.center.x)<.13) {
          g.jumpSpeed=clamp((height-FIELD.y-.058)/Math.max(.13,time)+PHYS.gravity*time*.5,.28,.64);this.jumpCooldown=1.15;this.goalieHold=.30;
        }
      } else {
        this.targetX=clamp(p.x*.46,-.18,.18);this.targetZ=p.z<-.95?-1.32:-1.43;
      }
    }
    const g=this.goalie,dx=this.targetX-g.body.center.x,dz=this.targetZ-g.body.center.z;
    g.move.set(clamp(dx*12,-1,1),0,clamp(dz*10,-.6,.6));if(g.move.length()>1)g.move.normalize();
    const desired=Math.atan2(this.ball.x-g.body.center.x,this.ball.z-g.body.center.z);g.yaw+=Math.atan2(Math.sin(desired-g.yaw),Math.cos(desired-g.yaw))*(1-Math.exp(-6*h));
    g.arch=-clamp(g.velocity.x*.018,-.01,.01);
  }
  private contactBody(body:SoftBody,goalie:boolean) {
    if(this.ball.distanceToSquared(body.center)>.13**2)return;
    let closest:typeof body.contacts[number]|undefined,best=BALL.radius**2;
    const p=this.point;
    for(const contact of body.contacts) {
      p.set(0,0,0);for(const [id,w] of contact.weights){const j=id*3;p.x+=body.x[j]*w;p.y+=body.x[j+1]*w;p.z+=body.x[j+2]*w;}
      const d=p.distanceToSquared(this.ball);if(d<best){best=d;closest=contact;}
    }
    if(!closest)return;
    p.set(0,0,0);let vx=0,vy=0,vz=0;
    for(const [id,w] of closest.weights){const j=id*3;p.x+=body.x[j]*w;p.y+=body.x[j+1]*w;p.z+=body.x[j+2]*w;vx+=body.velocity[j]*w;vy+=body.velocity[j+1]*w;vz+=body.velocity[j+2]*w;}
    const n=this.normal.copy(this.ball).sub(p);const length=n.length();if(length<1e-7)return;n.multiplyScalar(1/length);
    // The ball compresses a finite soft contact patch, rather than one tiny
    // barycentric sample with almost no effective mass. Partition the impulse
    // over nearby FEM nodes; the same weights own the reciprocal mass and recoil.
    let weightSum=0;const weights=this.patchWeights;
    for(let i=0;i<body.mass.length;i++){const j=i*3,d2=(body.x[j]-p.x)**2+(body.x[j+1]-p.y)**2+(body.x[j+2]-p.z)**2;weights[i]=body.mass[i]*Math.max(0,1-d2/.038**2)**2;weightSum+=weights[i];}
    if(weightSum<1e-12)return;
    let patchInverseMass=0;vx=vy=vz=0;
    for(let i=0;i<weights.length;i++){const w=weights[i]/weightSum;weights[i]=w;patchInverseMass+=w*w*body.inverseMass[i];vx+=body.velocity[i*3]*w;vy+=body.velocity[i*3+1]*w;vz+=body.velocity[i*3+2]*w;}
    const denominator=1/BALL.mass+patchInverseMass,depth=BALL.radius-length;
    const correction=depth/denominator;this.ball.addScaledVector(n,correction/BALL.mass);
    const relative=(this.ballVelocity.x-vx)*n.x+(this.ballVelocity.y-vy)*n.y+(this.ballVelocity.z-vz)*n.z;
    const impulse=relative<0?-(1+.38)*relative/denominator:0;this.ballVelocity.addScaledVector(n,impulse/BALL.mass);
    for(let id=0;id<weights.length;id++) {
      const j=id*3,weight=body.inverseMass[id]*weights[id];
      body.x[j]-=n.x*correction*weight;body.x[j+1]-=n.y*correction*weight;body.x[j+2]-=n.z*correction*weight;
      body.velocity[j]-=n.x*impulse*weight;body.velocity[j+1]-=n.y*impulse*weight;body.velocity[j+2]-=n.z*impulse*weight;
    }
    this.ballSpin.y+=clamp(((this.ballVelocity.x-vx)*n.z-(this.ballVelocity.z-vz)*n.x)*3,-2,2);
    body.updateCenter();body.surfaceDirty=true;body.wake();
    if(relative<-.06){this.emit(goalie?'save':'bump',clamp(-relative,0,1));if(goalie)this.goalieHold=.24;}
  }
  private boundaries(h:number) {
    const p=this.ball,v=this.ballVelocity,r=BALL.radius,floor=FIELD.y+r;
    if(p.y<floor) {
      p.y=floor;if(v.y<-.07){this.emit('bump',Math.min(1,-v.y));v.y=-v.y*BALL.restitution;}else v.y=0;
      const speed=Math.hypot(v.x,v.z),next=Math.max(0,speed-BALL.rollingDrag*h),factor=speed>0?next/speed:0;v.x*=factor;v.z*=factor;
      this.ballSpin.x+=(v.z/r-this.ballSpin.x)*(1-Math.exp(-18*h));this.ballSpin.z+=(-v.x/r-this.ballSpin.z)*(1-Math.exp(-18*h));this.ballSpin.y*=Math.exp(-1.2*h);
    }
    for(const side of [-1,1]) {
      if(p.x*side>1-r&&p.y<FIELD.y+FIELD.wall+r){p.x=side*(1-r);if(v.x*side>0){v.x*=-.62;this.emit('post',Math.abs(v.x));}}
      const z=side*FIELD.length/2;
      // Posts/crossbars use closest-point sphere-cylinder contact at 240 Hz.
      for(const x of [-GOAL.width/2,GOAL.width/2])this.postContact(new Vector3(x,clamp(p.y,FIELD.y,FIELD.y+GOAL.height),z));
      this.postContact(new Vector3(clamp(p.x,-GOAL.width/2,GOAL.width/2),FIELD.y+GOAL.height,z));
      const insideMouth=Math.abs(p.x)<GOAL.width/2-r&&p.y<FIELD.y+GOAL.height-r;
      if(p.z*side>FIELD.length/2-r&&!insideMouth&&p.y<FIELD.y+FIELD.wall+r){p.z=side*(FIELD.length/2-r);if(v.z*side>0)v.z*=-.55;}
      if(insideMouth&&p.z*side>FIELD.length/2+r&&this.previousBall.z*side<=FIELD.length/2+r&&this.resetBallIn<=0) {
        if(side===-1){this.score++;this.celebration=3;this.emit('goal',1);}this.resetBallIn=1.4;
      }
      if(p.z*side>FIELD.length/2&&Math.abs(p.x)<GOAL.width/2+r) {
        if(p.z*side>FIELD.length/2+GOAL.depth-r){p.z=side*(FIELD.length/2+GOAL.depth-r);v.z*=-.16;}
        if(Math.abs(p.x)>GOAL.width/2-r){p.x=Math.sign(p.x)*(GOAL.width/2-r);v.x*=-.22;}
      }
    }
    // A lob over the boards is a dead ball, with a short, deterministic return.
    if(Math.abs(p.x)>1.08||Math.abs(p.z)>1.76||p.y>1||!Number.isFinite(p.lengthSq())) {if(this.resetBallIn<=0)this.resetBallIn=.8;v.multiplyScalar(Math.exp(-4*h));}
  }
  private postContact(point:Vector3) {
    const n=this.normal.copy(this.ball).sub(point),distance=n.length(),radius=BALL.radius+GOAL.post;
    if(distance>=radius||distance<1e-7)return;n.multiplyScalar(1/distance);this.ball.addScaledVector(n,radius-distance);
    const vn=this.ballVelocity.dot(n);if(vn<0){this.ballVelocity.addScaledVector(n,-1.7*vn);this.emit('post',Math.min(1,-vn));}
  }
  private confineSkater(rig:SkateRig) {
    const b=rig.body,dx=clamp(b.center.x,-.955,.955)-b.center.x,dz=clamp(b.center.z,-1.485,1.465)-b.center.z;
    if(dx||dz){for(let j=0;j<b.x.length;j+=3){b.x[j]+=dx;b.x[j+2]+=dz;if(dx&&b.velocity[j]*dx<0)b.velocity[j]*=-.15;if(dz&&b.velocity[j+2]*dz<0)b.velocity[j+2]*=-.15;}b.updateCenter();b.surfaceDirty=true;}
  }
  centerBall(){this.ball.set(0,FIELD.y+BALL.radius,0);this.ballVelocity.set(0,0,0);this.ballSpin.set(0,0,0);this.resetBallIn=0;}
  reset(){this.riding=false;this.score=0;this.shotAge=Infinity;this.lastShot=-2;this.elapsed=this.celebration=this.reaction=this.jumpCooldown=this.goalieHold=this.eventHold=0;this.targetX=0;this.targetZ=-1.43;this.player.move.set(0,0,0);this.centerBall();this.ballRotation.identity();this.goalie.place(0,-1.43,0);}
}
