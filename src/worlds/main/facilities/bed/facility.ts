import { Box3, Vector3, type Scene } from 'three/webgpu';
import type { SoftBody } from '../../../../physics/soft-body.js';
import type { FacilityShadows } from '../../../../facilities/shadows.ts';
import { FacilityCollision } from '../../../../facilities/collision.ts';
import { Bed } from './graphics.ts';
import { BED, BedPhysics } from './physics.ts';
import { BedBlanket } from './blanket.ts';
import type { Facility } from '../../../../facilities/manager.ts';

export class BedFacility implements Facility {
  readonly id='spawn-bed';
  readonly label='Bed';
  readonly cameraDistance=.26;
  readonly physics:BedPhysics;
  readonly blanket=new BedBlanket();
  private readonly visual:Bed;
  readonly collision:FacilityCollision;
  constructor(scene:Scene,body:SoftBody,shadows:FacilityShadows){
    this.physics=new BedPhysics(body);this.visual=new Bed(this.blanket);this.collision=new FacilityCollision(body);scene.add(this.visual.group);
    this.collision.registerBoxes(this.visual.boxes);
    shadows.add(this.visual.group,new Box3(new Vector3(BED.x-.066,-.001,BED.z-.082),new Vector3(BED.x+.066,.115,BED.z+.095)));
  }
  get active(){return this.physics.active;}
  get sleeping(){return this.active;}
  get action(){return this.active?'Get Up':'Go to Bed';}
  get mobileAction(){return this.active?'Get up':'Go to Bed';}
  get interactionDistance(){return this.physics.nearby?Math.hypot(this.physics.body.center.x-BED.x,this.physics.body.center.z-BED.z):Infinity;}
  interact(){return this.physics.toggle();}
  step(h:number){this.physics.step(h);this.lastStep=h;}
  private lastStep=1/240;
  afterStep(){
    if(!this.active)this.collision.resolveBoxes(this.visual.boxes);
    this.blanket.step(this.lastStep,this.physics.body,this.active);
  }
  warmupCollision(){this.collision.warmupBoxes(this.visual.boxes);this.blanket.warmup(this.physics.body);}
  update(){
    if(this.active&&this.physics.body.surfaceDirty)this.physics.body.updateSurface();
    this.blanket.prepareRender(this.physics.body,this.active);this.visual.update();
  }
  reset(){this.physics.reset();this.blanket.reset();this.update();}
  dispose(){this.collision.dispose();this.visual.dispose();}
}
