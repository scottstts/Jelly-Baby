import type { Scene } from 'three/webgpu';
import { Box3, Vector3 } from 'three/webgpu';
import type { FacilityShadows } from '../graphics/facility-shadows.ts';
import type { SoftBody } from '../physics/soft-body.js';
import { FacilityCollision } from '../physics/facility-collision.ts';
import { Swing } from '../graphics/swing.ts';
import { SwingPhysics, SWING } from './swing-physics.ts';
import type { Facility } from './facilities.ts';
import { FacilityMotionSound, type FacilitySoundSink } from './facility-sound.ts';

const LAUGH_ANGLE=15*Math.PI/180;

export class SwingFacility implements Facility {
  readonly id='spawn-swing';
  readonly label='Swing';
  readonly cameraDistance=.29;
  readonly physics:SwingPhysics;
  private readonly visual=new Swing();
  readonly collision:FacilityCollision;
  private laughStarted=false;
  private laughBeyondThreshold=false;
  private readonly audio:FacilityMotionSound;
  constructor(scene:Scene,body:SoftBody,shadows:FacilityShadows,sound:FacilitySoundSink=()=>{}) {
    this.collision=new FacilityCollision(body);
    this.audio=new FacilityMotionSound(sound,{x:SWING.x,y:SWING.height,z:SWING.z});
    this.physics=new SwingPhysics(body);this.visual.update(this.physics.angle,this.physics.seatCollisionMotion);scene.add(this.visual.group);
    this.collision.registerBoxes(this.visual.collisionBoxes);
    shadows.add(this.visual.group,new Box3(
      new Vector3(SWING.x-.10,0,SWING.z-.15),
      new Vector3(SWING.x+.10,SWING.height+.02,SWING.z+.15),
    ));
  }
  get active() {return this.physics.riding;}
  get laughing() {return this.active&&this.laughStarted;}
  get interactionDistance() {
    return this.physics.nearby?Math.hypot(this.physics.body.center.x-SWING.x,this.physics.body.center.z-SWING.z):Infinity;
  }
  interact() {
    const changed=this.physics.toggle();
    if(changed) {
      this.laughStarted=false;
      this.laughBeyondThreshold=this.physics.riding&&Math.abs(this.physics.angle)>=LAUGH_ANGLE;
    }
    return changed;
  }
  step(h:number) {
    this.physics.step(h);
    this.audio.swing(h,this.physics.angle,this.physics.speed,this.active);
    // Remember only a threshold crossing that happens during this ride. If an
    // empty swing was already beyond the threshold when the jelly boards, it
    // must first return inside the normal-expression range before laughing.
    const beyondThreshold=Math.abs(this.physics.angle)>=LAUGH_ANGLE;
    if(this.active&&!this.laughBeyondThreshold&&beyondThreshold)this.laughStarted=true;
    this.laughBeyondThreshold=this.active&&beyondThreshold;
  }
  afterStep() {
    if(this.active)return;
    if(!this.collision.mayCollide())return;
    // Seat boxes carry a tight fitting-margin override; frame boxes retain the
    // general margin used by sparse surface contacts.
    this.visual.update(this.physics.angle,this.physics.seatCollisionMotion);
    this.collision.resolveBoxes(this.visual.collisionBoxes);
  }
  warmupCollision() {this.collision.warmupBoxes(this.visual.collisionBoxes);}
  update() {this.visual.update(this.physics.angle,this.physics.seatCollisionMotion);}
  reset() {this.audio.reset();this.laughStarted=false;this.laughBeyondThreshold=false;this.physics.reset();this.update();}
  dispose() {this.collision.dispose();this.visual.group.removeFromParent();this.visual.dispose();}
}
