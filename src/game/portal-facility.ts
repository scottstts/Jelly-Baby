import type { SoftBody } from '../physics/soft-body.js';
import { FacilityCollision, type CollisionBox } from '../physics/facility-collision.ts';
import type { Facility } from './facilities.ts';

const PORTAL_INTERACTION_RADIUS=.145;

/** Portal housing plus the shared contextual travel interaction. */
export class PortalFacility implements Facility {
  readonly label='Portal';
  readonly active=false;
  readonly action='Use Portal';
  readonly mobileAction='Use Portal';
  readonly collision:FacilityCollision;
  private readonly boxes:readonly CollisionBox[];
  private readonly body:SoftBody;
  private readonly portalX:number;
  private readonly portalZ:number;
  private readonly onUse:()=>boolean;
  private readonly available:()=>boolean;
  constructor(body:SoftBody,id:string,portalX:number,portalZ:number,boxes:readonly CollisionBox[],onUse:()=>boolean,available:()=>boolean=()=>true) {
    this.body=body;this.portalX=portalX;this.portalZ=portalZ;this.onUse=onUse;this.available=available;
    this.id=id;this.boxes=boxes;this.collision=new FacilityCollision(body);
    this.collision.registerBoxes(boxes);
  }
  readonly id:string;
  get interactionDistance() {
    if(!this.available())return Infinity;
    const distance=Math.hypot(this.body.center.x-this.portalX,this.body.center.z-this.portalZ);
    return distance<=PORTAL_INTERACTION_RADIUS?distance:Infinity;
  }
  interact(){
    if(!Number.isFinite(this.interactionDistance))return false;
    return this.onUse();
  }
  step(){}
  afterStep(){this.collision.resolveBoxes(this.boxes);}
  warmupCollision(){this.collision.warmupBoxes(this.boxes);}
  update(){}
  reset(){}
  dispose(){this.collision.dispose();}
}
