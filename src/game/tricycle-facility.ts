import { Box3, Vector3, type Scene } from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';
import { FacilityCollision, type CollisionBox } from '../physics/facility-collision.ts';
import type { FacilityShadows } from '../graphics/facility-shadows.ts';
import { Tricycle } from '../graphics/tricycle.ts';
import { ToyTrack } from '../graphics/toy-track.ts';
import { TricyclePhysics } from './tricycle-physics.ts';
import type { Facility } from './facilities.ts';
import { box, TRACK_SHADOW_ENVELOPE } from './toy-track-layout.ts';
import { fitGrips } from './tricycle-fit.ts';

export class TricycleFacility implements Facility {
  readonly id='toy-tricycle';readonly label='Tricycle';readonly cameraDistance=.24;
  readonly physics:TricyclePhysics;
  readonly collision:FacilityCollision;
  private readonly parkedCollision:FacilityCollision;
  readonly track=new ToyTrack();
  readonly visual:Tricycle;
  private readonly parkedBox=box(0,.026,0,.079,.052,.113);
  private readonly collisionBounds:CollisionBox[];
  constructor(scene:Scene,body:SoftBody,shadows:FacilityShadows) {
    this.visual=new Tricycle(fitGrips(body));
    this.physics=new TricyclePhysics(body,this.track.obstacleBoxes,true,this.track.vehicleColliders);this.collision=new FacilityCollision(body);
    this.parkedCollision=new FacilityCollision(body);
    this.collisionBounds=[...this.track.boxes,...this.track.curbBoxes];
    this.collision.registerBoxes(this.collisionBounds);scene.add(this.track.group,this.visual.group);this.update();
    const envelope=new Box3(
      new Vector3(TRACK_SHADOW_ENVELOPE.minX,0,TRACK_SHADOW_ENVELOPE.minZ),
      new Vector3(TRACK_SHADOW_ENVELOPE.maxX,.33,TRACK_SHADOW_ENVELOPE.maxZ),
    );
    shadows.add(this.track.group,envelope);
    shadows.add(this.visual.group,envelope);
  }
  get active(){return this.physics.riding||this.physics.recovering;}
  get action(){return this.physics.riding?'Get Off Tricycle':'Ride Tricycle';}
  get showPrompt(){return !this.physics.recovering;}
  get laughing(){return this.physics.laughing;}
  get crying(){return this.physics.crying;}
  get interactionDistance(){return this.physics.nearby?this.physics.body.center.distanceTo(this.physics.position):Infinity;}
  interact(){return !this.physics.recovering&&this.physics.toggle();}
  step(h:number){this.physics.step(h);}
  afterStep(){
    this.collision.resolveBoxes(this.track.boxes);
    // While mounted, the tricycle's wheel/road constraint owns curb contact.
    // Walking and ejected bodies use the finite visible curb volumes instead.
    if(!this.physics.riding) {
      const curbs=this.track.curbsNear(this.physics.body.center.x,this.physics.body.center.z);
      if(curbs.length)this.collision.resolveBoxes(curbs);
    }
    if(this.physics.riding||this.physics.recovering)return;
    const p=this.physics.position,yaw=this.physics.yaw;
    this.parkedBox.center.x=p.x+.011*Math.sin(yaw);this.parkedBox.center.z=p.z+.011*Math.cos(yaw);
    Object.assign(this.parkedBox.xAxis,{x:Math.cos(yaw),y:0,z:-Math.sin(yaw)});
    Object.assign(this.parkedBox.zAxis,{x:Math.sin(yaw),y:0,z:Math.cos(yaw)});
    this.parkedCollision.resolveBoxes([this.parkedBox]);
  }
  warmupCollision(){
    this.collision.warmupBoxes(this.track.boxes);
    // Runtime curb collision only submits this many local segments, so warm that
    // bounded path rather than scanning the complete ring during every step.
    this.collision.warmupBoxes(this.track.curbBoxes.slice(0,this.track.curbActiveBoxCount));
  }
  update(){this.visual.group.position.copy(this.physics.position);this.visual.group.rotation.set(this.physics.pitch,this.physics.yaw,this.physics.roll,'YXZ');this.visual.update(this.physics.steering,this.physics.travel);}
  reset(){this.physics.reset();this.update();}
  dispose(){this.collision.dispose();this.parkedCollision.dispose();this.track.dispose();this.visual.dispose();}
}
