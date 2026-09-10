import { Box3, Vector3, type Scene } from 'three/webgpu';
import type { FacilityShadows } from '../graphics/facility-shadows.ts';
import type { SoftBody } from '../physics/soft-body.js';
import { FacilityCollision } from '../physics/facility-collision.ts';
import { PHYS } from '../physics/constants.js';
import { Trampoline } from '../graphics/trampoline.ts';
import { TRAMPOLINE, TrampolinePhysics } from './trampoline-physics.ts';
import type { Facility } from './facilities.ts';
import { FacilityMotionSound, type FacilitySoundSink } from './facility-sound.ts';

export class TrampolineFacility implements Facility {
  readonly id='spawn-trampoline';
  readonly label='Trampoline';
  readonly cameraDistance=.30;
  readonly physics:TrampolinePhysics;
  private readonly visual=new Trampoline();
  readonly collision:FacilityCollision;
  private laughStarted=false;
  private readonly audio:FacilityMotionSound;
  constructor(scene:Scene,body:SoftBody,shadows:FacilityShadows,sound:FacilitySoundSink=()=>{}) {
    this.collision=new FacilityCollision(body);
    this.audio=new FacilityMotionSound(sound,{x:TRAMPOLINE.x,y:TRAMPOLINE.height,z:TRAMPOLINE.z});
    this.physics=new TrampolinePhysics(body);scene.add(this.visual.group);
    this.collision.registerCylinder(TRAMPOLINE.x,TRAMPOLINE.z,TRAMPOLINE.radius,PHYS.floor,
      TRAMPOLINE.height+TRAMPOLINE.rimCenterOffset+TRAMPOLINE.rimHalfHeight);
    shadows.add(this.visual.group,new Box3(
      new Vector3(TRAMPOLINE.x-.105,0,TRAMPOLINE.z-.105),
      new Vector3(TRAMPOLINE.x+.105,TRAMPOLINE.height+.015,TRAMPOLINE.z+.105),
    ));
  }
  get active() {return this.physics.active;}
  get laughing() {return this.active&&this.laughStarted;}
  get interactionDistance() {
    return this.physics.nearby?Math.hypot(this.physics.body.center.x-TRAMPOLINE.x,this.physics.body.center.z-TRAMPOLINE.z):Infinity;
  }
  interact() {const changed=this.physics.toggle();if(changed){this.laughStarted=false;this.audio.reset();}return changed;}
  step(h:number) {
    this.physics.step(h);
    this.audio.trampoline(h,this.physics.supported,this.physics.speed,this.physics.compression,this.active);
  }
  afterStep() {
    if(this.active) {
      if(this.physics.bounceHeight>=TRAMPOLINE.laughHeight)this.laughStarted=true;
      return;
    }
    // A cylinder-shaped keep-out barrier follows the trampoline's disk. It is
    // only active below the top of the cushion, so a sufficiently high jump can
    // still clear the obstacle.
    this.collision.resolveCylinderBarrier(
      TRAMPOLINE.x,TRAMPOLINE.z,TRAMPOLINE.radius,PHYS.floor,
      TRAMPOLINE.height+TRAMPOLINE.rimCenterOffset+TRAMPOLINE.rimHalfHeight,
    );
  }
  warmupCollision() {
    this.collision.warmupCylinderBarrier(
      TRAMPOLINE.x,TRAMPOLINE.z,TRAMPOLINE.radius,PHYS.floor,
      TRAMPOLINE.height+TRAMPOLINE.rimCenterOffset+TRAMPOLINE.rimHalfHeight,
    );
  }
  update() {this.visual.update(this.physics.compression);}
  reset() {this.audio.reset();this.physics.reset();this.laughStarted=false;this.update();}
  dispose() {this.collision.dispose();this.visual.group.removeFromParent();this.visual.dispose();}
}
