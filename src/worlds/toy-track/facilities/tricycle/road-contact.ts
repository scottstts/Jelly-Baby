import type { CollisionBox } from '../../../../facilities/collision.ts';
import { CURB_ROAD_EDGE, ROAD_HEIGHT, roadLocation } from '../../layout.ts';

export const WHEEL_CONTACTS=[{x:0,z:.056,r:.023},{x:-.036,z:-.034,r:.015},{x:.036,z:-.034,r:.015}];
export function wheelHeight(x:number,z:number,r:number,boxes:readonly CollisionBox[]) {
  let height=ROAD_HEIGHT;
  for(const box of boxes) {
    const top=box.center.y+box.halfSize.y;
    if(top>ROAD_HEIGHT+.014||top<=ROAD_HEIGHT)continue;
    const dx=x-box.center.x,dz=z-box.center.z,lx=dx*box.xAxis.x+dz*box.xAxis.z,lz=dx*box.zAxis.x+dz*box.zAxis.z;
    if(Math.abs(lz)>box.halfSize.z+r*.5)continue;
    // Low cylindrical pen: wheel-centre path is the Minkowski sum of the
    // two circular sections, not a vertical AABB wall or an animation trigger.
    const penRadius=box.halfSize.y;
    const d=Math.abs(lx),sum=r+penRadius;
    if(d<sum)height=Math.max(height,box.center.y+Math.sqrt(sum*sum-d*d)-r);
  }
  return height;
}
export function constrainToRoad(position:{x:number;z:number},yaw:number) {
  let hitX=0,hitZ=0,localX=0,localZ=0,hit=false;
  for(let pass=0;pass<3;pass++)for(const wheel of WHEEL_CONTACTS) {
    const x=position.x+Math.cos(yaw)*wheel.x+Math.sin(yaw)*wheel.z,z=position.z-Math.sin(yaw)*wheel.x+Math.cos(yaw)*wheel.z;
    const nearest=roadLocation(x,z),normalX=(nearest.x-x)/Math.max(1e-9,nearest.distance),normalZ=(nearest.z-z)/Math.max(1e-9,nearest.distance);
    const support=.004*Math.abs(normalX*Math.cos(yaw)-normalZ*Math.sin(yaw))+wheel.r*Math.abs(normalX*Math.sin(yaw)+normalZ*Math.cos(yaw));
    const limit=CURB_ROAD_EDGE-.002-support;
    if(nearest.distance<=limit)continue;
    const nx=(nearest.x-x)/nearest.distance,nz=(nearest.z-z)/nearest.distance,depth=nearest.distance-limit;
    position.x+=nx*depth;position.z+=nz*depth;hitX=nx;hitZ=nz;localX=wheel.x;localZ=wheel.z;hit=true;
  }
  return {x:hitX,z:hitZ,localX,localZ,hit};
}
