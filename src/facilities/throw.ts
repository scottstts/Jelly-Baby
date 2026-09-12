import type { SoftBody } from '../physics/soft-body.js';
import type { CollisionBox } from './collision.ts';
import { PHYS } from '../physics/constants.js';

/** Cheap bulk-throw approximation for static frame pieces. */
export function stopFacilityThrow(body:SoftBody,vertices:Int32Array,boxes:readonly CollisionBox[],margin:number) {
  const previous=body.previous;
  if(!previous)return false;
  let vx=0,vy=0,vz=0,dx=0,dy=0,dz=0;
  for(let i=0;i<body.mass.length;i++) {
    const j=i*3,w=body.mass[i]/body.totalMass;
    vx+=w*body.velocity[j];vy+=w*body.velocity[j+1];vz+=w*body.velocity[j+2];
    dx+=w*(body.x[j]-previous[j]);dy+=w*(body.x[j+1]-previous[j+1]);dz+=w*(body.x[j+2]-previous[j+2]);
  }
  // Ignore ordinary locomotion and stationary deformation.
  if(vx*vx+vy*vy+vz*vz<.8*.8||dx*dx+dy*dy+dz*dz<1e-10)return false;
  const surface=body.surface as {bindingIds:Uint32Array;bindingWeights:Float64Array};
  let first=1,nx=0,ny=0,nz=0;
  for(const vertex of vertices) {
    const offset=vertex*4;let px=0,py=0,pz=0;
    for(let k=0;k<4;k++) {
      const j=surface.bindingIds[offset+k]*3,w=surface.bindingWeights[offset+k];
      px+=previous[j]*w;py+=previous[j+1]*w;pz+=previous[j+2]*w;
    }
    for(const box of boxes) {
      if(box.skipThrowSweep)continue;
      if(box.motion)continue;
      const boxMargin=box.margin===undefined?margin:box.margin-margin+margin;
      let enter=0,leave=first,ax=0,ay=0,az=0;
      const x=px-box.center.x,y=py-box.center.y,z=pz-box.center.z;
      for(let axis=0;axis<3;axis++) {
        const n=axis===0?box.xAxis:axis===1?box.yAxis:box.zAxis;
        const extent=(axis===0?box.halfSize.x:axis===1?box.halfSize.y:box.halfSize.z)+boxMargin;
        const p=x*n.x+y*n.y+z*n.z,v=dx*n.x+dy*n.y+dz*n.z;
        if(Math.abs(v)<1e-15){if(Math.abs(p)>=extent){leave=-1;break;}continue;}
        const a=(-extent-p)/v,b=(extent-p)/v,near=Math.min(a,b),far=Math.max(a,b);
        if(near>=enter){enter=near;const sign=v>0?-1:1;ax=sign*n.x;ay=sign*n.y;az=sign*n.z;}
        leave=Math.min(leave,far);
        if(enter>leave)break;
      }
      if(enter<=leave&&enter<first&&(ax!==0||ay!==0||az!==0)) {
        // A fast tangential slide can have >0.8 m/s bulk speed while only
        // re-entering an already-touching face by a few micrometres. Rewinding
        // the whole bulk step for that grazing contact erases its tangential
        // travel every frame and can pin the jelly to an inclined beam. Leave
        // shallow end-of-step penetration to the ordinary local contact pass;
        // reserve the sweep for normal travel large enough to tunnel.
        const remainingNormalTravel=-(1-Math.max(0,enter))*(dx*ax+dy*ay+dz*az);
        if(remainingNormalTravel>boxMargin*.25){first=enter;nx=ax;ny=ay;nz=az;}
      }
    }
  }
  if(first===1)return false;
  // Keep the already-deformed previous shape and stop its bulk translation
  // at the hit. This cannot invert its tetrahedra or invoke costly repair.
  const fraction=Math.max(0,first-1e-5);
  const incoming=vx*nx+vy*ny+vz*nz;
  const impulseSpeed=incoming<0?-(1+PHYS.restitution)*incoming:0;
  for(let j=0;j<body.x.length;j+=3) {
    body.x[j]=previous[j]+fraction*dx;body.x[j+1]=previous[j+1]+fraction*dy;body.x[j+2]=previous[j+2]+fraction*dz;
    body.velocity[j]+=impulseSpeed*nx;body.velocity[j+1]+=impulseSpeed*ny;body.velocity[j+2]+=impulseSpeed*nz;
  }
  return true;
}
