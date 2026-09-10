import { CatmullRomCurve3, Vector3 } from 'three/webgpu';
import type { CollisionBox } from '../physics/facility-collision.ts';

const BASE_TRACK_WIDTH=.20;
export const TRACK_RADIUS_SCALE=2;
export const TRACK_SCENERY_SCALE=2;
export const TRACK_WIDTH=BASE_TRACK_WIDTH*1.5;
export const ROAD_HEIGHT=.003;
export const CURB_HEIGHT=.019;
export const CURB_COLLISION_WIDTH=.010;
export const TRACK_LOCATION_SEGMENTS=256;
const obstacleOffsetScale=TRACK_WIDTH/BASE_TRACK_WIDTH;

export const trackCurve=new CatmullRomCurve3(Array.from({length:16},(_,i)=>{
  const angle=.768+i*Math.PI/8,radius=(.49+.018*Math.sin(3*angle))*TRACK_RADIUS_SCALE;
  return new Vector3(radius*Math.cos(angle),0,radius*Math.sin(angle));
}),true,'centripetal');
const startPoint=trackCurve.getPointAt(0),startTangent=trackCurve.getTangentAt(0);
export const TRACK_START={x:startPoint.x,z:startPoint.z,yaw:Math.atan2(-startTangent.x,-startTangent.z)};
export function trackPoint(t:number,offset=0) {
  const u=(t%1+1)%1,p=trackCurve.getPointAt(u),v=trackCurve.getTangentAt(u);
  p.x+=v.z*offset;p.z-=v.x*offset;return p;
}
export function box(x:number,y:number,z:number,sx:number,sy:number,sz:number,yaw=0):CollisionBox {
  return {center:new Vector3(x,y,z),halfSize:new Vector3(sx/2,sy/2,sz/2),xAxis:new Vector3(Math.cos(yaw),0,-Math.sin(yaw)),yAxis:new Vector3(0,1,0),zAxis:new Vector3(Math.sin(yaw),0,Math.cos(yaw))};
}
export type ToyObstacle={kind:'brick'|'pen'|'bottle'|'eraser'|'spool';x:number;z:number;yaw:number};
const obstaclePoint=(t:number,offset:number)=>trackPoint(t,offset*obstacleOffsetScale);
export const obstacles:ToyObstacle[]=[
  {kind:'brick',...obstaclePoint(.18,.060),yaw:Math.atan2(trackCurve.getTangentAt(.18).x,trackCurve.getTangentAt(.18).z)},
  {kind:'pen',...obstaclePoint(.36,0),yaw:Math.atan2(trackCurve.getTangentAt(.36).x,trackCurve.getTangentAt(.36).z)+Math.PI/2},
  {kind:'bottle',...obstaclePoint(.53,-.063),yaw:0},
  {kind:'eraser',...obstaclePoint(.70,.064),yaw:Math.atan2(trackCurve.getTangentAt(.70).x,trackCurve.getTangentAt(.70).z)},
  {kind:'spool',...obstaclePoint(.85,-.064),yaw:0},
];

const samples=Array.from({length:TRACK_LOCATION_SEGMENTS+1},(_,i)=>trackPoint(i/TRACK_LOCATION_SEGMENTS));
const minX=Math.min(...samples.map(p=>p.x)),maxX=Math.max(...samples.map(p=>p.x));
const minZ=Math.min(...samples.map(p=>p.z)),maxZ=Math.max(...samples.map(p=>p.z));
// Includes the enlarged trackside trees and start gantry without covering the portal.
const decorationMargin=.35;
export const TRACK_SHADOW_ENVELOPE={
  minX:minX-decorationMargin,maxX:maxX+decorationMargin,
  minZ:minZ-decorationMargin,maxZ:maxZ+decorationMargin,
};

/** Nearest polyline projection shared by vehicle road support and local curb contacts. */
export function roadLocation(x:number,z:number) {
  let distanceSq=Infinity,px=0,pz=0,nearestT=0;
  for(let i=0;i<TRACK_LOCATION_SEGMENTS;i++) {
    const a=samples[i],b=samples[i+1],dx=b.x-a.x,dz=b.z-a.z;
    const u=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    const qx=a.x+u*dx,qz=a.z+u*dz,d=(x-qx)**2+(z-qz)**2;
    if(d<distanceSq){distanceSq=d;px=qx;pz=qz;nearestT=(i+u)/TRACK_LOCATION_SEGMENTS;}
  }
  return {x:px,z:pz,distance:Math.sqrt(distanceSq),t:nearestT};
}
