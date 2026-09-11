import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { SoftBody } from '../../../../physics/soft-body.js';
import { PHYS } from '../../../../physics/constants.js';

/** The dressing table's world-space footprint, in metres. */
export const WEARABLE_TABLE={
  x:-.155,z:.305,width:.20,depth:.112,height:.061,top:.061,
  slotSpacing:.063,interactionRadius:.135,collisionRadius:.23,
};

/**
 * Each reference asset is kept as a uniform-scale object. The individual
 * scales compensate for the source models' different physical envelopes so
 * their crowns, brims, and rings all fit the same 7 cm jelly head.
 */
export const HEAD_WEARABLES=[
  {id:'floral-crown',label:'Floral Crown',slotX:-WEARABLE_TABLE.slotSpacing,scale:.016,tableLift:.0016,headLift:-.0022,headForward:0,headSide:0,rotationY:0},
  {id:'top-hat',label:'Top Hat',slotX:0,scale:.0144,tableLift:.0008,headLift:-.0003,headForward:0,headSide:0,rotationY:0},
  {id:'baseball-cap',label:'Baseball Cap',slotX:WEARABLE_TABLE.slotSpacing,scale:.0125,tableLift:.006,headLift:.0038,headForward:-.0042,headSide:0,rotationY:0},
] as const;

export type HeadWearableIndex=0|1|2;

type HeadBinding={ids:Uint32Array;weights:Float64Array};

const HOP_HEIGHT=.0065;
const CROWN_TARGET=new Vector3(0,.07,0);
const FRONT_TARGET=new Vector3(0,.047,.018);
const BACK_TARGET=new Vector3(0,.047,-.015);
const LEFT_TARGET=new Vector3(-.02,.047,0);
const RIGHT_TARGET=new Vector3(.02,.047,0);

/** Selection, head attachment, and the small free-flight hop of a worn item. */
export class WearablePhysics {
  readonly body:SoftBody;
  private readonly headBindings:{crown:HeadBinding;front:HeadBinding;back:HeadBinding;left:HeadBinding;right:HeadBinding;};
  private readonly anchor=new Vector3();
  private readonly crown=new Vector3();
  private readonly front=new Vector3();
  private readonly back=new Vector3();
  private readonly left=new Vector3();
  private readonly right=new Vector3();
  private readonly planeCenter=new Vector3();
  private readonly xAxis=new Vector3();
  private readonly yAxis=new Vector3();
  private readonly zAxis=new Vector3();
  private readonly crownOffset=new Vector3();
  private readonly basis=new Matrix4();
  private hopHeight=0;
  private hopVelocity=0;
  private hopActive=false;
  wornIndex:HeadWearableIndex|null=null;

  constructor(body:SoftBody) {
    this.body=body;
    const positions=body.surface.positions;
    let highest=-Infinity;
    for(let i=1;i<positions.length;i+=3)highest=Math.max(highest,positions[i]);
    const crownVertex=this.findSurfaceVertex(CROWN_TARGET,(_x,y)=>y>highest-.004,positions);
    const frontVertex=this.findSurfaceVertex(FRONT_TARGET,(x,y,z)=>y>.038&&z>.010&&Math.abs(x)<.02,positions);
    const backVertex=this.findSurfaceVertex(BACK_TARGET,(x,y,z)=>y>.038&&z<-.008&&Math.abs(x)<.02,positions);
    const leftVertex=this.findSurfaceVertex(LEFT_TARGET,(x,y,z)=>y>.038&&x<-.010&&Math.abs(z)<.02,positions);
    const rightVertex=this.findSurfaceVertex(RIGHT_TARGET,(x,y,z)=>y>.038&&x>.010&&Math.abs(z)<.02,positions);
    this.headBindings={
      crown:this.captureBinding(crownVertex),front:this.captureBinding(frontVertex),back:this.captureBinding(backVertex),
      left:this.captureBinding(leftVertex),right:this.captureBinding(rightVertex),
    };
  }

  get wearing() {return this.wornIndex!==null;}
  get hopOffset() {return this.hopHeight;}

  /** The nearest slot while unworn, or -1 when no wear interaction is ready. */
  get availableIndex():HeadWearableIndex|-1 {
    if(this.wearing||this.body.grab||!this.body.grounded)return -1;
    return this.nearestSlot(null);
  }

  /** The nearest alternative slot while already wearing something. */
  get swapIndex():HeadWearableIndex|-1 {
    if(this.wornIndex===null||this.body.grab||!this.body.grounded)return -1;
    return this.nearestSlot(this.wornIndex);
  }

  /** The shared-manager distance for the current contextual affordance. */
  get interactionDistance() {
    if(this.body.grab||!this.body.grounded)return Infinity;
    if(this.wornIndex!==null) {
      const swap=this.swapIndex;
      if(swap!==-1)return this.distanceToSlot(swap);
      const distance=this.distanceToTable();
      return distance>WEARABLE_TABLE.interactionRadius?distance:Infinity;
    }
    const index=this.availableIndex;
    return index===-1?Infinity:this.distanceToSlot(index);
  }

  get collisionNearby() {
    return Math.hypot(this.body.center.x-WEARABLE_TABLE.x,this.body.center.z-WEARABLE_TABLE.z)<WEARABLE_TABLE.collisionRadius;
  }

  wear(index:HeadWearableIndex) {
    if(this.wearing||this.availableIndex!==index)return false;
    this.wornIndex=index;this.clearHop();
    return true;
  }

  swap(index:HeadWearableIndex):HeadWearableIndex|-1 {
    if(this.wornIndex===null||this.swapIndex!==index)return -1;
    const previous=this.wornIndex;
    this.wornIndex=index;this.clearHop();
    return previous;
  }

  takeOff():HeadWearableIndex|-1 {
    if(this.wornIndex===null||this.swapIndex!==-1||!Number.isFinite(this.interactionDistance))return -1;
    return this.returnToTable();
  }

  returnToTable():HeadWearableIndex|-1 {
    if(this.wornIndex===null)return -1;
    const index=this.wornIndex;
    this.wornIndex=null;this.clearHop();
    return index;
  }

  /** Called only by the ordinary locomotion jump path, never by facilities. */
  jumpFromNormalLocomotion() {
    if(!this.wearing||this.hopActive)return;
    this.hopHeight=0;
    this.hopVelocity=Math.sqrt(2*PHYS.gravity*HOP_HEIGHT);
    this.hopActive=true;
  }

  step(h:number) {
    if(!this.hopActive)return;
    this.hopVelocity-=PHYS.gravity*h;this.hopHeight+=this.hopVelocity*h;
    if(this.hopHeight<=0&&this.hopVelocity<0)this.clearHop();
  }

  headAnchor(out=this.anchor) {return this.sampleBinding(this.headBindings.crown,out);}

  headPlacement(index:HeadWearableIndex,outPosition=new Vector3(),outOrientation=new Quaternion()) {
    const wearable=HEAD_WEARABLES[index];
    this.sampleBinding(this.headBindings.crown,this.crown);
    this.sampleBinding(this.headBindings.front,this.front);
    this.sampleBinding(this.headBindings.back,this.back);
    this.sampleBinding(this.headBindings.left,this.left);
    this.sampleBinding(this.headBindings.right,this.right);
    this.planeCenter.copy(this.front).add(this.back).add(this.left).add(this.right).multiplyScalar(.25);

    this.xAxis.copy(this.right).sub(this.left);
    if(this.xAxis.lengthSq()<1e-10)this.xAxis.set(1,0,0); else this.xAxis.normalize();

    this.zAxis.copy(this.front).sub(this.back);
    this.zAxis.addScaledVector(this.xAxis,-this.zAxis.dot(this.xAxis));
    if(this.zAxis.lengthSq()<1e-10)this.zAxis.set(0,0,1); else this.zAxis.normalize();

    this.yAxis.crossVectors(this.zAxis,this.xAxis);
    if(this.yAxis.lengthSq()<1e-10)this.yAxis.set(0,1,0); else this.yAxis.normalize();

    this.crownOffset.copy(this.crown).sub(this.planeCenter);
    if(this.yAxis.dot(this.crownOffset)<0) {
      this.yAxis.negate();this.zAxis.negate();
    }
    this.zAxis.crossVectors(this.xAxis,this.yAxis).normalize();

    this.basis.makeBasis(this.xAxis,this.yAxis,this.zAxis);
    outOrientation.setFromRotationMatrix(this.basis);
    outPosition.copy(this.crown)
      .addScaledVector(this.yAxis,wearable.headLift+this.hopHeight)
      .addScaledVector(this.zAxis,wearable.headForward)
      .addScaledVector(this.xAxis,wearable.headSide);
    return outPosition;
  }

  slotPosition(index:HeadWearableIndex,out=new Vector3()) {
    const wearable=HEAD_WEARABLES[index];
    return out.set(WEARABLE_TABLE.x+wearable.slotX,WEARABLE_TABLE.top+wearable.tableLift,WEARABLE_TABLE.z);
  }

  reset() {
    this.wornIndex=null;this.clearHop();
  }

  get headAnchorVertex() {return this.headBindings.crown.ids[0];}

  private clearHop() {
    this.hopHeight=0;this.hopVelocity=0;this.hopActive=false;
  }

  private nearestSlot(exclude:HeadWearableIndex|null) {
    let bestIndex:HeadWearableIndex|-1=-1,bestDistance=Infinity;
    for(let i=0;i<HEAD_WEARABLES.length;i++) {
      const index=i as HeadWearableIndex;
      if(index===exclude)continue;
      const distance=this.distanceToSlot(index);
      if(distance<bestDistance){bestDistance=distance;bestIndex=index;}
    }
    return bestDistance<WEARABLE_TABLE.interactionRadius?bestIndex:-1;
  }

  private distanceToSlot(index:HeadWearableIndex) {
    const wearable=HEAD_WEARABLES[index];
    return Math.hypot(this.body.center.x-(WEARABLE_TABLE.x+wearable.slotX),this.body.center.z-WEARABLE_TABLE.z);
  }

  private distanceToTable() {
    return Math.hypot(this.body.center.x-WEARABLE_TABLE.x,this.body.center.z-WEARABLE_TABLE.z);
  }

  private captureBinding(vertex:number):HeadBinding {
    if(vertex<0)throw new Error('Unable to find a head anchor for the wearable table');
    const ids=new Uint32Array(4),weights=new Float64Array(4),offset=vertex*4;
    for(let k=0;k<4;k++) {
      ids[k]=this.body.surface.bindingIds[offset+k];
      weights[k]=this.body.surface.bindingWeights[offset+k];
    }
    return {ids,weights};
  }

  private sampleBinding(binding:HeadBinding,out:Vector3) {
    const x=this.body.x;
    let px=0,py=0,pz=0;
    for(let k=0;k<4;k++) {
      const id=binding.ids[k],weight=binding.weights[k],offset=id*3;
      px+=x[offset]*weight;py+=x[offset+1]*weight;pz+=x[offset+2]*weight;
    }
    return out.set(px,py,pz);
  }

  private findSurfaceVertex(target:Vector3,filter:(x:number,y:number,z:number)=>boolean,positions:Float32Array) {
    let vertex=-1,best=Infinity;
    for(let i=0;i<positions.length;i+=3) {
      const x=positions[i],y=positions[i+1],z=positions[i+2];
      if(!filter(x,y,z))continue;
      const score=(x-target.x)**2+(y-target.y)**2+(z-target.z)**2;
      if(score<best){best=score;vertex=i/3;}
    }
    return vertex;
  }
}
