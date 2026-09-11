import { Box3, Quaternion, Vector3, type Group, type Scene } from 'three/webgpu';
import type { FacilityShadows } from '../graphics/facility-shadows.ts';
import type { SoftBody } from '../physics/soft-body.js';
import { FacilityCollision } from '../physics/facility-collision.ts';
import { HEAD_WEARABLES, WearablePhysics } from './wearable-physics.ts';
import { WearableTable } from '../graphics/wearable-table.ts';
import type { Facility } from './facilities.ts';
import type { Locomotion } from './locomotion.ts';

/** The dressing table owns selection, table collision, and head attachment. */
export class WearableFacility implements Facility {
  readonly id='head-wearable-table';
  readonly persistAcrossTravel=true;
  readonly label='Wearables';
  readonly physics:WearablePhysics;
  readonly visual:WearableTable;
  readonly collision:FacilityCollision;
  private readonly babyGroup:Group;
  private readonly headPosition=new Vector3();
  private readonly headOrientation=new Quaternion();

  constructor(scene:Scene,body:SoftBody,babyGroup:Group,rig:Locomotion,shadows:FacilityShadows) {
    this.physics=new WearablePhysics(body);this.visual=new WearableTable();this.collision=new FacilityCollision(body);
    this.collision.registerBoxes(this.visual.collisionBoxes);
    this.babyGroup=babyGroup;void rig;scene.add(this.visual.group);
    // The table's wearables can travel with the baby across the play area. The
    // broad, fixed envelope keeps both ground and raised-surface shadow maps
    // valid while the item is worn, including its short local head detachment.
    shadows.add(this.visual.group,new Box3(new Vector3(-.32,0,-.28),new Vector3(.32,.18,.46)));
  }

  get active() {return false;}

  get interactionDistance() {return this.physics.interactionDistance;}

  get action() {
    if(this.physics.wornIndex!==null) {
      const swap=this.physics.swapIndex;
      return swap===-1?`Take off ${HEAD_WEARABLES[this.physics.wornIndex].label}`:`Swap to ${HEAD_WEARABLES[swap].label}`;
    }
    const index=this.physics.availableIndex;
    return index===-1?'Wear':`Wear ${HEAD_WEARABLES[index].label}`;
  }

  get mobileAction() {
    if(this.physics.wornIndex!==null) {
      const swap=this.physics.swapIndex;
      return swap===-1?`Take off ${HEAD_WEARABLES[this.physics.wornIndex].label}`:`Swap to ${HEAD_WEARABLES[swap].label}`;
    }
    const index=this.physics.availableIndex;
    return index===-1?'Wear':`Wear ${HEAD_WEARABLES[index].label}`;
  }

  interact() {
    if(this.physics.wornIndex!==null) {
      const swap=this.physics.swapIndex;
      if(swap!==-1) {
        const previous=this.physics.swap(swap);
        if(previous===-1)return false;
        this.visual.setOnTable(previous);this.visual.setWorn(swap,this.babyGroup);return true;
      }
      const index=this.physics.takeOff();
      if(index===-1)return false;
      this.visual.setOnTable(index);return true;
    }
    const index=this.physics.availableIndex;
    if(index===-1)return false;
    if(!this.physics.wear(index))return false;
    this.visual.setWorn(index,this.babyGroup);return true;
  }

  step(h:number) {this.physics.step(h);}

  afterStep() {
    this.collision.resolveBoxes(this.visual.collisionBoxes);
  }

  warmupCollision() {this.collision.warmupBoxes(this.visual.collisionBoxes);}

  update() {
    const index=this.physics.wornIndex;
    if(index===null)return;
    this.physics.headPlacement(index,this.headPosition,this.headOrientation);
    this.visual.updateWorn(index,this.headPosition,this.headOrientation);
  }

  /** Ordinary locomotion calls this only for its own Space jump impulse. */
  jumpFromNormalLocomotion() {this.physics.jumpFromNormalLocomotion();}

  /** A carried item can be removed away from the hidden dressing table. */
  get canTakeOffCarried() {return this.physics.wornIndex!==null&&!this.physics.body.grab&&this.physics.body.grounded;}

  takeOffCarried() {
    if(!this.canTakeOffCarried)return false;
    const index=this.physics.returnToTable();
    if(index===-1)return false;
    this.visual.setOnTable(index);return true;
  }

  /** Beds remove a worn item immediately and leave it parked back on the table. */
  syncBedOccupancy(active:boolean) {
    if(!active)return;
    const index=this.physics.returnToTable();
    if(index!==-1)this.visual.setOnTable(index);
  }

  reset() {this.physics.reset();this.visual.reset();}
  dispose() {this.collision.dispose();this.visual.dispose();}
}

/** Toy-world fallback interaction for an item whose table remains in the playroom. */
export class CarriedWearableFacility implements Facility {
  readonly id='carried-head-wearable';
  readonly label='Wearable';
  readonly persistAcrossTravel=true;
  private readonly source:WearableFacility;
  constructor(source:WearableFacility) {this.source=source;}
  get active(){return false;}
  get interactionDistance(){return this.source.canTakeOffCarried?Number.MAX_SAFE_INTEGER:Infinity;}
  get action(){const index=this.source.physics.wornIndex;return index===null?'Wear':`Take off ${HEAD_WEARABLES[index].label}`;}
  get mobileAction(){return this.action;}
  interact(){return this.source.takeOffCarried();}
  step(h:number){this.source.step(h);}
  update(){this.source.update();}
  reset(){/* The home owner keeps carried attire through toy-world resets. */}
  dispose(){/* The home owner owns and disposes the shared visual/physics state. */}
}
