import { Box3, Vector3, type Scene } from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';
import { FacilityCollision } from '../physics/facility-collision.ts';
import type { FacilityShadows } from '../graphics/facility-shadows.ts';
import { Tricycle } from '../graphics/tricycle.ts';
import { ToyTrack } from '../graphics/toy-track.ts';
import { TricyclePhysics } from './tricycle-physics.ts';
import type { Facility } from './facilities.ts';
import { box, ROAD_HEIGHT, TRACK_WIDTH, roadLocation } from './toy-track-layout.ts';
import { fitGrips } from './tricycle-fit.ts';

export class TricycleFacility implements Facility {
  readonly id='toy-tricycle';readonly label='Tricycle';readonly cameraDistance=.24;
  readonly physics:TricyclePhysics;
  readonly collision:FacilityCollision;
  private readonly parkedCollision:FacilityCollision;
  readonly track=new ToyTrack();
  readonly visual:Tricycle;
  private readonly parkedBox=box(0,.026,0,.079,.052,.113);
  constructor(scene:Scene,body:SoftBody,shadows:FacilityShadows) {
    this.visual=new Tricycle(fitGrips(body));
    this.physics=new TricyclePhysics(body,this.track.obstacleBoxes,true);this.collision=new FacilityCollision(body);
    this.parkedCollision=new FacilityCollision(body);
    this.collision.registerBoxes(this.track.boxes);scene.add(this.track.group,this.visual.group);this.update();
    shadows.add(this.track.group,new Box3(new Vector3(-.65,0,-.65),new Vector3(.65,.16,.65)));
    shadows.add(this.visual.group,new Box3(new Vector3(-.65,0,-.65),new Vector3(.65,.16,.65)));
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
    const changed=this.collision.resolveBoxes(this.track.boxes);
    const body=this.physics.body;
    if(changed&&!this.physics.riding&&roadLocation(body.center.x,body.center.z).distance<TRACK_WIDTH/2) {
      let low=Infinity;for(let j=1;j<body.x.length;j+=3)low=Math.min(low,body.x[j]);
      if(low<ROAD_HEIGHT+.006)body.grounded=true;
    }
    if(this.physics.riding||this.physics.recovering)return;
    const p=this.physics.position,yaw=this.physics.yaw;
    this.parkedBox.center.x=p.x+.011*Math.sin(yaw);this.parkedBox.center.z=p.z+.011*Math.cos(yaw);
    Object.assign(this.parkedBox.xAxis,{x:Math.cos(yaw),y:0,z:-Math.sin(yaw)});
    Object.assign(this.parkedBox.zAxis,{x:Math.sin(yaw),y:0,z:Math.cos(yaw)});
    this.parkedCollision.resolveBoxes([this.parkedBox]);
  }
  warmupCollision(){this.collision.warmupBoxes(this.track.boxes);}
  update(){this.visual.group.position.copy(this.physics.position);this.visual.group.rotation.set(this.physics.pitch,this.physics.yaw,this.physics.roll,'YXZ');this.visual.update(this.physics.steering,this.physics.travel);}
  reset(){this.physics.reset();this.update();}
  dispose(){this.collision.dispose();this.parkedCollision.dispose();this.track.dispose();this.visual.dispose();}
}
