import { Plane, Triangle, Vector3 } from 'three/webgpu';
import type { Ray } from 'three/webgpu';
import type { SoftBody } from './soft-body.js';

export function surfaceGrab(body:SoftBody,face:{a:number;b:number;c:number},point:Vector3) {
  const p=body.surface.positions,{a,b,c}=face;
  const tri=new Triangle(new Vector3().fromArray(p,a*3),new Vector3().fromArray(p,b*3),new Vector3().fromArray(p,c*3));
  const bary=tri.getBarycoord(point,new Vector3());
  if(!bary)return null;
  const weights=new Map<number,number>();
  const ids=body.surface.bindingIds,values=body.surface.bindingWeights;
  for(const [surfaceId,w] of [[a,bary.x],[b,bary.y],[c,bary.z]]) {
    const offset=surfaceId*4;
    for(let k=0;k<4;k++) {
      const id=ids[offset+k],value=values[offset+k];
      weights.set(id,(weights.get(id)||0)+w*value);
    }
  }
  const list=[...weights].filter(([,w])=>w>1e-12),sum=list.reduce((total,[,w])=>total+w,0);
  if(!Number.isFinite(sum)||sum<=0)return null;
  list.forEach(pair=>pair[1]/=sum);
  const anchor=new Vector3();
  for(const [id,w] of list){anchor.x+=body.x[id*3]*w;anchor.y+=body.x[id*3+1]*w;anchor.z+=body.x[id*3+2]*w;}
  // Float32 render positions vs Float64 mechanics may differ by micrometres,
  // but a visible mismatch means the hit/stencils refer to different geometry.
  if(anchor.distanceTo(point)>.00002)throw new Error('Grab surface and physics binding disagree');
  return {weights:list,target:anchor.clone(),point:anchor.clone(),lambda:new Float64Array(3)};
}

const floorPlane=new Plane(new Vector3(0,1,0),-.0003);
/** Keep the target on the pointer ray even when dragging into the table. */
export function projectGrabTarget(ray:Ray,dragPlane:Plane,out:Vector3) {
  if(!ray.intersectPlane(dragPlane,out))return false;
  if(out.y<.0003)return ray.intersectPlane(floorPlane,out)!==null;
  return true;
}

// The pointer itself may jump arbitrarily far in one browser event. Keep the
// existing fast servo feel, but cap only absurd world-space commands. Do not
// clamp the solver lead or rewind the command after a hard step: both create
// visible slow-motion under abrupt dragging.
export const MAX_RAW_GRAB_LEAD=.14;

export function advanceGrabTarget(target:Vector3,desired:Vector3,h:number,actual?:Vector3) {
  let desiredX=desired.x,desiredY=desired.y,desiredZ=desired.z;
  if(actual) {
    const ax=desiredX-actual.x,ay=desiredY-actual.y,az=desiredZ-actual.z;
    const ad=Math.hypot(ax,ay,az);
    if(ad>MAX_RAW_GRAB_LEAD) {
      const s=MAX_RAW_GRAB_LEAD/ad;
      desiredX=actual.x+ax*s;desiredY=actual.y+ay*s;desiredZ=actual.z+az*s;
    }
  }
  const dx=desiredX-target.x,dy=desiredY-target.y,dz=desiredZ-target.z;
  const distance=Math.hypot(dx,dy,dz);
  if(distance===0)return;
  // Original game feel: fast exponential response plus a bounded target speed.
  const fraction=Math.min(1-Math.exp(-85*h),1.8*h/distance);
  target.x+=dx*fraction;target.y+=dy*fraction;target.z+=dz*fraction;
}
