import { BufferAttribute, DynamicDrawUsage, Quaternion, Vector3 } from 'three/webgpu';
import { SoftBody } from '../../physics/soft-body.js';
import { PHYS, clamp } from '../../physics/constants.js';
import { BALL, FIELD, GOAL, onSoccerField } from './layout.ts';
import { GOALIE_BACK_Z, GOALIE_FRONT_Z, GOALIE_HOME_Z, GOALIE_SIDE_LIMIT, GoalieBrain } from './goalie-brain.ts';

const GOALIE_MAX_SPEED=.32;

/** Clone mutable skin/cage buffers; the goalie must never write the player's skin. */
export function makeGoalieBody(player:SoftBody) {
  const cage=player.cage;
  const cloneSurface=(surface:typeof cage.surface)=>{const positions=surface.positions.slice(),geometry=surface.geometry.clone();geometry.setAttribute('position',new BufferAttribute(positions,3).setUsage(DynamicDrawUsage));return {...surface,geometry,positions};};
  return new SoftBody({...cage,surface:cloneSurface(cage.surface),opticalSurface:cloneSurface(cage.opticalSurface as typeof cage.surface)});
}

/** Force-driven keeper locomotion using the same jelly gait language as the player. */
export class GoalieRig {
  readonly body:SoftBody;
  readonly move=new Vector3();
  readonly velocity=new Vector3();
  readonly position=new Vector3();
  readonly restCenter=new Vector3();
  yaw=0;
  jumpHeight=0;
  jumpSpeed=0;
  reach=0;
  private phase=0;
  private gaitWeight=0;
  private meanUpper=0;
  constructor(body:SoftBody) {
    this.body=body;
    for(let i=0;i<body.mass.length;i++) {
      const weight=body.mass[i]/body.totalMass,upper=clamp(body.rest[i*3+1]/.07,0,1);
      this.restCenter.addScaledVector(new Vector3().fromArray(body.rest,i*3),weight);this.meanUpper+=upper*weight;
    }
  }
  place(x:number,z:number,yaw=0) {
    const b=this.body,c=Math.cos(yaw),s=Math.sin(yaw);this.yaw=yaw;this.velocity.set(0,0,0);this.move.set(0,0,0);this.phase=this.gaitWeight=0;this.jumpHeight=this.jumpSpeed=this.reach=0;
    for(let j=0;j<b.x.length;j+=3) {
      const rx=b.rest[j]-this.restCenter.x,rz=b.rest[j+2]-this.restCenter.z;
      b.x[j]=x+rx*c+rz*s;b.x[j+1]=b.rest[j+1]+FIELD.y;b.x[j+2]=z+rz*c-rx*s;
    }
    b.previous.set(b.x);b.velocity.fill(0);b.updateCenter();b.surfaceDirty=true;b.wake();this.position.set(x,FIELD.y,z);
  }
  step(h:number) {
    const b=this.body,v=b.velocity;this.velocity.set(0,0,0);
    for(let i=0;i<b.mass.length;i++) {const j=i*3,w=b.mass[i]/b.totalMass;this.velocity.x+=v[j]*w;this.velocity.y+=v[j+1]*w;this.velocity.z+=v[j+2]*w;}
    const requested=this.move.length();
    if(this.jumpHeight>0||this.jumpSpeed>0){this.jumpSpeed-=PHYS.gravity*h;this.jumpHeight=Math.max(0,this.jumpHeight+this.jumpSpeed*h);if(!this.jumpHeight)this.jumpSpeed=0;}
    const targetX=this.move.x*GOALIE_MAX_SPEED,targetZ=this.move.z*GOALIE_MAX_SPEED;
    const ax=clamp((targetX-this.velocity.x)*(requested>.02?8:4.5),-3,3),az=clamp((targetZ-this.velocity.z)*(requested>.02?8:4.5),-3,3);
    this.gaitWeight+=(Math.min(1,requested)-this.gaitWeight)*(1-Math.exp(-12*h));
    if(this.gaitWeight<1e-5)this.gaitWeight=0;
    const planarSpeed=Math.hypot(this.velocity.x,this.velocity.z);if(this.gaitWeight>.001)this.phase+=h*Math.max(.25,Math.min(1,planarSpeed/.30))*42;
    const c=Math.cos(this.yaw),s=Math.sin(this.yaw),leanX=clamp(ax*.0024,-.007,.007),leanZ=clamp(az*.0024,-.007,.007);
    const moveX=requested>.001?this.move.x/requested:Math.sin(this.yaw),moveZ=requested>.001?this.move.z/requested:Math.cos(this.yaw);
    for(let i=0;i<b.mass.length;i++) {
      const j=i*3,rx=b.rest[j]-this.restCenter.x,ry=b.rest[j+1],rz=b.rest[j+2]-this.restCenter.z,upper=clamp(ry/.07,0,1);
      const foot=Math.max(0,1-ry/.023),arm=Math.max(0,Math.min(1,(Math.abs(rx)-.030)/.016));
      const stride=Math.sin(this.phase+(rx<0?0:Math.PI))*this.gaitWeight,gait=stride*(foot*.009-arm*.004),lift=Math.max(0,stride)*foot*.006;
      const tx=b.center.x+rx*c+rz*s+moveX*gait+leanX*(upper-this.meanUpper)+this.reach*(upper-this.meanUpper);
      const tz=b.center.z+rz*c-rx*s+moveZ*gait+leanZ*(upper-this.meanUpper);
      const ty=ry+FIELD.y+this.jumpHeight+lift;
      const k=foot>.2?1700:900,drag=foot>.2?42:24;
      v[j]+=(k*(tx-b.x[j])-24*(v[j]-this.velocity.x)+ax)*h;
      v[j+1]+=(k*(ty-b.x[j+1])-drag*(v[j+1]-this.jumpSpeed)+PHYS.gravity)*h;
      v[j+2]+=(k*(tz-b.x[j+2])-24*(v[j+2]-this.velocity.z)+az)*h;
    }
    b.canSleep=false;b.wake();this.position.set(b.center.x,FIELD.y+this.jumpHeight,b.center.z);
  }
}

export type SoccerEvent='bump'|'save'|'post'|'goal';
export class SoccerPhysics {
  readonly body:SoftBody;
  readonly goalie:GoalieRig;
  readonly ball=new Vector3(0,FIELD.y+BALL.radius,0);
  readonly ballVelocity=new Vector3();
  readonly ballSpin=new Vector3();
  readonly ballRotation=new Quaternion();
  score=0;
  private elapsed=0;
  private celebration=0;
  private resetBallIn=0;
  private eventHold=0;
  private goalieClearance=0;
  private goalieTouchCooldown=0;
  private readonly goalieBrain=new GoalieBrain();
  private readonly rotation=new Quaternion();
  private readonly normal=new Vector3();
  private readonly point=new Vector3();
  private readonly previousBall=new Vector3();
  private readonly patchWeights:Float64Array;
  onEvent:(kind:SoccerEvent,strength:number,position:Vector3)=>void=()=>{};
  constructor(body:SoftBody,goalieBody=makeGoalieBody(body)) {
    this.body=body;this.patchWeights=new Float64Array(body.mass.length);this.goalie=new GoalieRig(goalieBody);this.goalie.place(0,GOALIE_HOME_Z,0);
  }
  get onField(){return onSoccerField(this.body.center.x,this.body.center.z);}
  get crying(){return false;}
  get laughing(){return this.celebration>0;}
  private emit(kind:SoccerEvent,strength:number) {
    if(kind==='goal'||this.eventHold<=0){this.onEvent(kind,strength,this.ball);this.eventHold=.09;}
  }
  step(h:number) {
    this.elapsed+=h;this.eventHold-=h;this.goalieTouchCooldown=Math.max(0,this.goalieTouchCooldown-h);this.celebration=Math.max(0,this.celebration-h);
    this.thinkGoalie(h);this.goalie.step(h);this.goalie.body.step(h);
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
  afterStep(){this.contactBody(this.body,false);this.confineGoalie();}
  private thinkGoalie(h:number) {
    const p=this.ball,v=this.ballVelocity,g=this.goalie,d=this.goalieBrain.step(h,{ballX:p.x,ballY:p.y,ballZ:p.z,ballVX:v.x,ballVY:v.y,ballVZ:v.z,keeperX:g.body.center.x,keeperZ:g.body.center.z,elapsed:this.elapsed,score:this.score});
    this.goalieClearance=d.clearance;if(d.jumpSpeed>0)g.jumpSpeed=d.jumpSpeed;
    const dx=d.targetX-g.body.center.x,dz=d.targetZ-g.body.center.z;
    const active=d.mode==='rescue'||d.mode==='clear'||d.mode==='challenge',gain=active?14:d.mode==='intercept'?11:8;
    g.move.set(clamp(dx*gain,-1,1),0,clamp(dz*(active?13:9),active?-1:-.65,active?1:.65));if(g.move.length()>1)g.move.normalize();
    const desired=Math.atan2(this.ball.x-g.body.center.x,this.ball.z-g.body.center.z);g.yaw+=Math.atan2(Math.sin(desired-g.yaw),Math.cos(desired-g.yaw))*(1-Math.exp(-7*h));
    g.reach+=(d.reach-g.reach)*(1-Math.exp(-13*h));
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
    if(goalie&&relative<-.025&&this.goalieTouchCooldown<=0) {
      this.applyGoalieClearance(body,weights);this.goalieTouchCooldown=.11;this.goalieBrain.notifySave(this.ball.z,this.ballVelocity.z);
    }
    body.updateCenter();body.surfaceDirty=true;body.wake();
    if(relative<-.06)this.emit(goalie?'save':'bump',clamp(-relative,0,1));
  }
  private applyGoalieClearance(body:SoftBody,weights:Float64Array) {
    const strength=this.goalieClearance;if(strength<=.02||this.ball.z>-.95||this.ball.y>FIELD.y+GOAL.height+.06)return;
    const desiredForward=.10+.15*strength,maxDelta=.08+.47*strength*strength*strength,delta=clamp(desiredForward-this.ballVelocity.z,0,maxDelta);if(delta<=1e-6)return;
    const x=Math.sign(this.ball.x)*.14*strength,invLength=1/Math.hypot(x,1),dx=x*invLength,dz=invLength,impulse=BALL.mass*delta/dz;
    this.ballVelocity.x+=dx*impulse/BALL.mass;this.ballVelocity.z+=dz*impulse/BALL.mass;
    for(let id=0;id<weights.length;id++) {
      const j=id*3,weight=body.inverseMass[id]*weights[id];body.velocity[j]-=dx*impulse*weight;body.velocity[j+2]-=dz*impulse*weight;
    }
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
    if(Math.abs(p.x)>1.08||Math.abs(p.z)>1.76||p.y>1||!Number.isFinite(p.lengthSq())) {if(this.resetBallIn<=0)this.resetBallIn=.8;v.multiplyScalar(Math.exp(-4*h));}
  }
  private postContact(point:Vector3) {
    const n=this.normal.copy(this.ball).sub(point),distance=n.length(),radius=BALL.radius+GOAL.post;
    if(distance>=radius||distance<1e-7)return;n.multiplyScalar(1/distance);this.ball.addScaledVector(n,radius-distance);
    const vn=this.ballVelocity.dot(n);if(vn<0){this.ballVelocity.addScaledVector(n,-1.7*vn);this.emit('post',Math.min(1,-vn));}
  }
  private confineGoalie() {
    const b=this.goalie.body,dx=clamp(b.center.x,-GOALIE_SIDE_LIMIT,GOALIE_SIDE_LIMIT)-b.center.x,dz=clamp(b.center.z,GOALIE_BACK_Z,GOALIE_FRONT_Z)-b.center.z;
    if(dx||dz){for(let j=0;j<b.x.length;j+=3){b.x[j]+=dx;b.x[j+2]+=dz;if(dx&&b.velocity[j]*dx<0)b.velocity[j]*=-.15;if(dz&&b.velocity[j+2]*dz<0)b.velocity[j+2]*=-.15;}b.updateCenter();b.surfaceDirty=true;}
  }
  centerBall(){this.ball.set(0,FIELD.y+BALL.radius,0);this.ballVelocity.set(0,0,0);this.ballSpin.set(0,0,0);this.resetBallIn=0;}
  reset(){this.score=0;this.elapsed=this.celebration=this.eventHold=this.goalieClearance=this.goalieTouchCooldown=0;this.goalieBrain.reset();this.centerBall();this.ballRotation.identity();this.goalie.place(0,GOALIE_HOME_Z,0);}
}
