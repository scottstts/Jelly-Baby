import type { SoftBody } from '../physics/soft-body.js';
import { stopFacilityThrow } from './throw.ts';
import { bodyCollisionBounds, boxBounds, boundsOverlap, collisionHierarchy, emptyBounds, facilityBoxBounds, unionBounds, type CollisionHierarchy } from './collision-bounds.ts';

type PointLike={x:number;y:number;z:number};

function separatedOnAxis(dx:number,dy:number,dz:number,rx:number,ry:number,rz:number,axis:PointLike,extent:number) {
  return Math.abs(dx*axis.x+dy*axis.y+dz*axis.z)>
    extent+rx*Math.abs(axis.x)+ry*Math.abs(axis.y)+rz*Math.abs(axis.z);
}

/** Optional finite-mass response for a moving collision volume. */
export interface CollisionMotion {
  nativePendulum?:{speed:number;pivotY:number;pivotZ:number;inertia:number};
  velocityAt(x:number,y:number,z:number,out:PointLike):void;
  inverseMassAt(x:number,y:number,z:number,nx:number,ny:number,nz:number):number;
  applyImpulse(x:number,y:number,z:number,ix:number,iy:number,iz:number):void;
}

export interface CollisionBox {
  center:PointLike;
  xAxis:PointLike;
  yAxis:PointLike;
  zAxis:PointLike;
  halfSize:PointLike;
  motion?:CollisionMotion;
  /** Optional per-box override for the facility contact margin. */
  margin?:number;
}

// The visible body is much denser than the mechanical cage. A single surface
// vertex per rest-space cell gives the collision pass enough shape information
// to keep the rendered skin out of a tight facility volume without scanning all
// 72k visible vertices at 240 Hz.
export const FACILITY_COLLISION_SAMPLE_SPACING=.003;
export const FACILITY_COLLISION_MARGIN=.002;
const COLLISION_ITERATIONS=2;
const COLLISION_WARMUP_PASSES=32;
const COLLISION_WARMUP_OFFSET=1024;

/** Lightweight narrow-phase contacts for authored facility volumes. */
export class FacilityCollision {
  readonly sampleCount:number;
  private readonly body:SoftBody;
  private readonly vertices:Int32Array;
  private readonly bindingIds:Uint32Array;
  private readonly bindingWeights:Float64Array;
  private readonly denominators:Float64Array;
  private readonly point=new Float64Array(3);
  private readonly motionVelocity:PointLike={x:0,y:0,z:0};
  private readonly bounds=new Float64Array(6);
  private readonly pieceBounds=new Float64Array(6);
  private readonly hierarchy:CollisionHierarchy;
  private registeredBounds:Float64Array|null=null;
  private readonly candidates:CollisionBox[]=[];
  private readonly candidateIndices:number[]=[];
  private native:ReturnType<NonNullable<SoftBody['kernel']>['createFacilityCollision']>|null=null;
  private maxWeightMagnitude=0;
  private maxWeightSumError=0;

  constructor(body:SoftBody,spacing=FACILITY_COLLISION_SAMPLE_SPACING) {
    this.body=body;
    this.hierarchy=collisionHierarchy(body);
    const surface=body.surface as {
      positions:Float32Array;
      bindingIds:Uint32Array;
      bindingWeights:Float64Array;
    };
    this.bindingIds=surface.bindingIds;
    this.bindingWeights=surface.bindingWeights;
    const bins=new Map<string,number>();
    const inverseSpacing=1/spacing;
    for(let vertex=0;vertex<surface.positions.length/3;vertex++) {
      const offset=vertex*3;
      const key=`${Math.floor(surface.positions[offset]*inverseSpacing)},${Math.floor(surface.positions[offset+1]*inverseSpacing)},${Math.floor(surface.positions[offset+2]*inverseSpacing)}`;
      if(!bins.has(key))bins.set(key,vertex);
    }
    this.vertices=Int32Array.from(bins.values());
    this.sampleCount=this.vertices.length;
    this.denominators=new Float64Array(this.sampleCount);
    for(let sample=0;sample<this.sampleCount;sample++) {
      const offset=this.vertices[sample]*4;
      let denominator=0;
      let magnitude=0,sum=0;
      for(let k=0;k<4;k++) {
        const id=this.bindingIds[offset+k],weight=this.bindingWeights[offset+k];
        denominator+=body.inverseMass[id]*weight*weight;
        magnitude+=Math.abs(weight);sum+=weight;
      }
      this.maxWeightMagnitude=Math.max(this.maxWeightMagnitude,magnitude);
      this.maxWeightSumError=Math.max(this.maxWeightSumError,Math.abs(sum-1));
      this.denominators[sample]=denominator;
    }
    this.hierarchy.includeBindings(this.maxWeightMagnitude,this.maxWeightSumError);
  }

  /** Register authored bounds once; re-register if geometry or margins change. */
  registerBoxes(boxes:readonly CollisionBox[],margin=FACILITY_COLLISION_MARGIN){
    this.registerBounds(facilityBoxBounds(boxes,margin));
  }
  registerCylinder(cx:number,cz:number,radius:number,minY:number,maxY:number,margin=FACILITY_COLLISION_MARGIN){
    const r=radius+margin,pad=1e-10*(1+Math.abs(cx)+Math.abs(cz)+r+Math.abs(minY)+Math.abs(maxY));
    this.registerBounds(new Float64Array([cx-r-pad,minY-pad,cz-r-pad,cx+r+pad,maxY+pad,cz+r+pad]));
  }
  private registerBounds(bounds:Float64Array){
    if(this.registeredBounds)this.hierarchy.unregister(this.registeredBounds);
    this.registeredBounds=bounds;this.hierarchy.register(bounds);
  }
  mayCollide(){return !this.registeredBounds||this.hierarchy.forGroup(this.registeredBounds)!==null;}
  dispose(){if(this.registeredBounds)this.hierarchy.unregister(this.registeredBounds);this.registeredBounds=null;}

  /**
   * Pay native allocation and tier-up cost during loading without touching the
   * live body. Synthetic geometry is translated far from gameplay, while a
   * matching synthetic bound deliberately admits every piece so the native
   * narrow phase still traverses its normal candidate/sample loops.
   */
  warmupBoxes(boxes:readonly CollisionBox[],margin=FACILITY_COLLISION_MARGIN) {
    if(!boxes.length)return;
    const native=this.nativeKernel();
    if(!native)return;
    const warmupBoxes=boxes.map(box=>({
      ...box,
      center:{x:box.center.x+COLLISION_WARMUP_OFFSET,y:box.center.y,z:box.center.z+COLLISION_WARMUP_OFFSET},
    }));
    const bounds=new Float64Array(6),piece=new Float64Array(6);emptyBounds(bounds);
    for(const box of warmupBoxes){boxBounds(box,margin,piece);unionBounds(bounds,piece);}
    for(let i=0;i<COLLISION_WARMUP_PASSES;i++) {
      if(native.resolveBoxes(warmupBoxes,margin,bounds)===null)return;
    }
    // Leave static authored records packed with their real transforms. The far
    // rejecting bound keeps this final write out of contact with the live body.
    const rejectingBounds=bounds.slice();
    rejectingBounds[0]+=COLLISION_WARMUP_OFFSET;rejectingBounds[2]+=COLLISION_WARMUP_OFFSET;
    rejectingBounds[3]+=COLLISION_WARMUP_OFFSET;rejectingBounds[5]+=COLLISION_WARMUP_OFFSET;
    native.resolveBoxes(boxes,margin,rejectingBounds);
  }

  /** Warm the native cylinder path with the same non-contacting strategy. */
  warmupCylinderBarrier(centerX:number,centerZ:number,radius:number,minY:number,maxY:number,margin=FACILITY_COLLISION_MARGIN) {
    const native=this.nativeKernel();
    if(!native)return;
    const x=centerX+COLLISION_WARMUP_OFFSET,z=centerZ+COLLISION_WARMUP_OFFSET,r=radius+margin;
    const bounds=new Float64Array([x-r,minY,z-r,x+r,maxY,z+r]);
    for(let i=0;i<COLLISION_WARMUP_PASSES;i++)native.resolveCylinder(x,z,radius,minY,maxY,margin,bounds);
  }

  /** Resolve tight oriented boxes, such as the swing's timber frame pieces. */
  resolveBoxes(boxes:readonly CollisionBox[],margin=FACILITY_COLLISION_MARGIN) {
    if(!boxes.length)return false;
    const bounds=this.registeredBounds?this.hierarchy.forGroup(this.registeredBounds):undefined;
    if(bounds===null)return false;
    const native=this.nativeKernel();
    if(native){const changed=native.resolveBoxes(boxes,margin,bounds);if(changed!==null){this.finish(changed,true);return changed;}}
    this.findCandidates(boxes,margin);
    if(!this.candidates.length)return false;
    if(stopFacilityThrow(this.body,this.vertices,this.candidates,margin)){this.finish(true);return true;}
    return this.resolveBoxContacts(boxes,margin);
  }

  private findCandidates(boxes:readonly CollisionBox[],margin:number) {
    this.updateBounds();
    let count=0;
    for(let i=0;i<boxes.length;i++) {
      const overlaps=this.overlapsBox(boxes[i],margin);
      if(overlaps){this.candidates[count]=boxes[i];this.candidateIndices[count++]=i;}
    }
    this.candidates.length=count;this.candidateIndices.length=count;
  }

  private resolveBoxContacts(boxes:readonly CollisionBox[],margin:number) {
    let activeBoxes:readonly CollisionBox[]=this.candidates;
    let changed=false;
    for(let iteration=0;iteration<COLLISION_ITERATIONS;iteration++) {
      let iterationChanged=false;
      for(let sample=0;sample<this.sampleCount;sample++) {
        this.readSample(sample);
        for(let boxIndex=0;boxIndex<activeBoxes.length;boxIndex++) {
          const box=activeBoxes[boxIndex];
          const dx=this.point[0]-box.center.x,dy=this.point[1]-box.center.y,dz=this.point[2]-box.center.z;
          const qx=dx*box.xAxis.x+dy*box.xAxis.y+dz*box.xAxis.z;
          const boxDelta=box.margin===undefined?0:box.margin-margin;
          const hx=box.halfSize.x+boxDelta+margin,hy=box.halfSize.y+boxDelta+margin,hz=box.halfSize.z+boxDelta+margin;
          const absQx=Math.abs(qx);
          if(absQx>=hx)continue;
          const qy=dx*box.yAxis.x+dy*box.yAxis.y+dz*box.yAxis.z;
          const absQy=Math.abs(qy);
          if(absQy>=hy)continue;
          const qz=dx*box.zAxis.x+dy*box.zAxis.y+dz*box.zAxis.z;
          const absQz=Math.abs(qz);
          if(absQz>=hz)continue;
          const px=hx-absQx,py=hy-absQy,pz=hz-absQz;
          let nx=box.xAxis.x,ny=box.xAxis.y,nz=box.xAxis.z,depth=px,side=qx;
          if(py<depth){depth=py;side=qy;nx=box.yAxis.x;ny=box.yAxis.y;nz=box.yAxis.z;}
          if(pz<depth){depth=pz;side=qz;nx=box.zAxis.x;ny=box.zAxis.y;nz=box.zAxis.z;}
          if(side<0){nx=-nx;ny=-ny;nz=-nz;}
          this.applyContact(sample,box,nx,ny,nz,depth);changed=true;iterationChanged=true;
          this.readSample(sample);
          // Resume at the next original box, including initially rejected
          // pieces that this contact may have pushed the sample into.
          if(activeBoxes!==boxes){boxIndex=this.candidateIndices[boxIndex];activeBoxes=boxes;}
        }
      }
      if(!iterationChanged)break;
    }
    this.finish(changed);
    return changed;
  }

  /**
   * Keep the body outside the side of a vertical cylinder. This is deliberately
   * a one-sided boundary: inactive trampoline space is a keep-out disk, while
   * jumping above the cylinder remains possible.
   */
  resolveCylinderBarrier(centerX:number,centerZ:number,radius:number,minY:number,maxY:number,margin=FACILITY_COLLISION_MARGIN) {
    const bounds=this.registeredBounds?this.hierarchy.forGroup(this.registeredBounds):undefined;
    if(bounds===null)return false;
    const native=this.nativeKernel();
    if(native){const changed=native.resolveCylinder(centerX,centerZ,radius,minY,maxY,margin,bounds);this.finish(changed,true);return changed;}
    const boundary=radius+margin;
    const boundarySquared=boundary*boundary;
    this.updateBounds();
    if(!this.overlaps(centerX-boundary,minY,centerZ-boundary,centerX+boundary,maxY,centerZ+boundary))return false;
    const dx=Math.max(this.bounds[0]-centerX,0,centerX-this.bounds[3]);
    const dz=Math.max(this.bounds[2]-centerZ,0,centerZ-this.bounds[5]);
    if(dx*dx+dz*dz>boundarySquared)return false;
    let changed=false;
    for(let iteration=0;iteration<COLLISION_ITERATIONS;iteration++) {
      let iterationChanged=false;
      for(let sample=0;sample<this.sampleCount;sample++) {
        this.readSample(sample);
        if(this.point[1]<=minY||this.point[1]>=maxY)continue;
        const x=this.point[0]-centerX,z=this.point[2]-centerZ,distanceSquared=x*x+z*z;
        if(distanceSquared>=boundarySquared)continue;
        const distance=Math.sqrt(distanceSquared);
        const nx=distance<1e-9?1:x/distance,nz=distance<1e-9?0:z/distance;
        this.applyContact(sample,undefined,nx,0,nz,boundary-distance);changed=true;iterationChanged=true;
      }
      if(!iterationChanged)break;
    }
    this.finish(changed);
    return changed;
  }

  private readSample(sample:number) {
    const offset=this.vertices[sample]*4,x=this.body.x;
    let px=0,py=0,pz=0;
    for(let k=0;k<4;k++) {
      const id=this.bindingIds[offset+k],weight=this.bindingWeights[offset+k],j=id*3;
      px+=x[j]*weight;py+=x[j+1]*weight;pz+=x[j+2]*weight;
    }
    this.point[0]=px;this.point[1]=py;this.point[2]=pz;
  }

  /** Bound the current bindings without reconstructing the dense surface.
   * Signed/extrapolating weights are supported: the cage radius is multiplied
   * by the largest absolute weight sum, with a separate partition-error term.
   * Reuse only inside the hierarchy's explicitly scoped, invalidated batch.
   */
  private updateBounds() {
    if(this.registeredBounds)this.bounds.set(this.hierarchy.read());
    else bodyCollisionBounds(this.body,this.maxWeightMagnitude,this.maxWeightSumError,this.bounds);
  }

  private overlaps(minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number) {
    const b=this.bounds;
    return !(b[3]<minX||b[0]>maxX||b[4]<minY||b[1]>maxY||b[5]<minZ||b[2]>maxZ);
  }

  private overlapsBox(box:CollisionBox,margin:number) {
    const b=this.bounds;
    boxBounds(box,margin,this.pieceBounds);
    if(!boundsOverlap(b,this.pieceBounds))return false;
    const dx=(b[0]+b[3])*.5-box.center.x,dy=(b[1]+b[4])*.5-box.center.y,dz=(b[2]+b[5])*.5-box.center.z;
    const rx=(b[3]-b[0])*.5,ry=(b[4]-b[1])*.5,rz=(b[5]-b[2])*.5;
    // Project the cage enclosure onto exactly the axes used by the narrow
    // phase. No assumption about perfectly orthonormal floating-point axes.
    const boxDelta=box.margin===undefined?0:box.margin-margin;
    return !separatedOnAxis(dx,dy,dz,rx,ry,rz,box.xAxis,box.halfSize.x+boxDelta+margin)&&
      !separatedOnAxis(dx,dy,dz,rx,ry,rz,box.yAxis,box.halfSize.y+boxDelta+margin)&&
      !separatedOnAxis(dx,dy,dz,rx,ry,rz,box.zAxis,box.halfSize.z+boxDelta+margin);
  }

  private applyContact(sample:number,box:CollisionBox|undefined,nx:number,ny:number,nz:number,depth:number) {
    const offset=this.vertices[sample]*4,denominator=this.denominators[sample];
    if(denominator<1e-15)return;
    const x=this.body.x,inverseMass=this.body.inverseMass;
    for(let k=0;k<4;k++) {
      const id=this.bindingIds[offset+k],weight=this.bindingWeights[offset+k],j=id*3;
      const amount=inverseMass[id]*weight*depth/denominator;
      x[j]+=amount*nx;x[j+1]+=amount*ny;x[j+2]+=amount*nz;
    }
    const velocity=this.body.velocity;
    let normalVelocity=0;
    for(let k=0;k<4;k++) {
      const id=this.bindingIds[offset+k],weight=this.bindingWeights[offset+k],j=id*3;
      normalVelocity+=weight*(velocity[j]*nx+velocity[j+1]*ny+velocity[j+2]*nz);
    }
    const motion=box?.motion;
    let motionNormalVelocity=0,motionInverseMass=0;
    if(motion) {
      motion.velocityAt(this.point[0],this.point[1],this.point[2],this.motionVelocity);
      motionNormalVelocity=this.motionVelocity.x*nx+this.motionVelocity.y*ny+this.motionVelocity.z*nz;
      motionInverseMass=motion.inverseMassAt(this.point[0],this.point[1],this.point[2],nx,ny,nz);
    }
    const relativeVelocity=normalVelocity-motionNormalVelocity;
    if(relativeVelocity>=0)return;
    const impulse=-relativeVelocity/(denominator+Math.max(0,motionInverseMass));
    for(let k=0;k<4;k++) {
      const id=this.bindingIds[offset+k],weight=this.bindingWeights[offset+k],j=id*3;
      const amount=inverseMass[id]*weight*impulse;
      velocity[j]+=amount*nx;velocity[j+1]+=amount*ny;velocity[j+2]+=amount*nz;
    }
    if(motion)motion.applyImpulse(this.point[0],this.point[1],this.point[2],-impulse*nx,-impulse*ny,-impulse*nz);
  }

  private nativeKernel() {
    if(!this.body.kernel)return null;
    return this.native??=this.body.kernel.createFacilityCollision(this.vertices,this.denominators,this.maxWeightMagnitude,this.maxWeightSumError);
  }

  private finish(changed:boolean,native=false) {
    if(!changed)return;
    this.hierarchy.invalidate();
    this.body.stabilizeContacts(native);
    this.body.wake();this.body.updateCenter();this.body.surfaceDirty=true;
  }
}
