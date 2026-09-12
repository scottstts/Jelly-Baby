import type { SoftBody } from '../../physics/soft-body.js';
import type { CollisionBox } from '../../facilities/collision.ts';

/** Raised turf, ramps and seating provide the same grounded locomotion as the
 * table. Side contacts never grant support or turn walls into jump surfaces.
 */
export function markStadiumSupport(body:SoftBody,boxes:readonly CollisionBox[]) {
  for(const box of boxes) {
    const axes=[box.xAxis,box.yAxis,box.zAxis],half=[box.halfSize.x,box.halfSize.y,box.halfSize.z];
    for(let axis=0;axis<3;axis++) {
      const up=axes[axis];if(Math.abs(up.y)<.7)continue;
      const sign=Math.sign(up.y),topY=box.center.y+half[axis]*Math.abs(up.y);
      if(topY<body.center.y-.07||topY>body.center.y+.005)continue;
      for(let i=0;i<body.mass.length;i++) {
        const j=i*3;if(body.rest[j+1]>.016)continue;
        const dx=body.x[j]-box.center.x,dy=body.x[j+1]-box.center.y,dz=body.x[j+2]-box.center.z;
        const height=(dx*up.x+dy*up.y+dz*up.z)*sign-half[axis];if(height<-.002||height>.006)continue;
        let inside=true;for(let a=0;a<3;a++)if(a!==axis){const v=axes[a];if(Math.abs(dx*v.x+dy*v.y+dz*v.z)>half[a]+.001)inside=false;}
        if(inside&&body.velocity[j+1]<.12){body.contact[i]=Math.max(body.contact[i],.0001);body.grounded=true;return true;}
      }
    }
  }
  return false;
}
