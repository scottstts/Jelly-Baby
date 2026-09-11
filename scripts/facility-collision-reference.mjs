// Frozen exhaustive traversal: verifies optimization without broad-phase rejection.
import { FacilityCollision, FACILITY_COLLISION_MARGIN } from "../src/facilities/collision.ts";
const COLLISION_ITERATIONS=2;
export class ExhaustiveFacilityCollision extends FacilityCollision {
  resolveBoxes(boxes,margin=FACILITY_COLLISION_MARGIN) {
    if(!boxes.length)return false;
    let changed=false;
    for(let iteration=0;iteration<COLLISION_ITERATIONS;iteration++) {
      let iterationChanged=false;
      for(let sample=0;sample<this.sampleCount;sample++) {
        this.readSample(sample);
        for(const box of boxes) {
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
  resolveCylinderBarrier(centerX,centerZ,radius,minY,maxY,margin=FACILITY_COLLISION_MARGIN) {
    const boundary=radius+margin;
    const boundarySquared=boundary*boundary;
    let changed=false;
    for(let iteration=0;iteration<COLLISION_ITERATIONS;iteration++)for(let sample=0;sample<this.sampleCount;sample++) {
      this.readSample(sample);
      if(this.point[1]<=minY||this.point[1]>=maxY)continue;
      const x=this.point[0]-centerX,z=this.point[2]-centerZ,distanceSquared=x*x+z*z;
      if(distanceSquared>=boundarySquared)continue;
      const distance=Math.sqrt(distanceSquared);
      const nx=distance<1e-9?1:x/distance,nz=distance<1e-9?0:z/distance;
      this.applyContact(sample,undefined,nx,0,nz,boundary-distance);changed=true;
    }
    this.finish(changed);
    return changed;
  }

}
