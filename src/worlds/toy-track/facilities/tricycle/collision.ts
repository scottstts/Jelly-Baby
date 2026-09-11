import type { CollisionBox } from '../../../../facilities/collision.ts';

export type TricycleCollider=
  | {kind:'rounded-box';x:number;z:number;yaw:number;halfX:number;halfZ:number;cornerRadius:number}
  | {kind:'circle';x:number;z:number;radius:number};

export type TricycleContact={normalX:number;normalZ:number;depth:number;contactX:number;contactZ:number};

export function tricycleBoxCollider(box:CollisionBox,cornerRadius=0):TricycleCollider {
  return {
    kind:'rounded-box',x:box.center.x,z:box.center.z,
    yaw:Math.atan2(box.zAxis.x,box.zAxis.z),halfX:box.halfSize.x,halfZ:box.halfSize.z,
    cornerRadius:Math.max(0,Math.min(cornerRadius,box.halfSize.x,box.halfSize.z)),
  };
}

export function tricycleCircleCollider(x:number,z:number,radius:number):TricycleCollider {
  return {kind:'circle',x,z,radius};
}

/** Horizontal circle contact against the authored static obstacle footprint. */
export function tricycleCircleContact(cx:number,cz:number,radius:number,collider:TricycleCollider):TricycleContact|null {
  if(collider.kind==='circle') {
    const dx=cx-collider.x,dz=cz-collider.z,sum=radius+collider.radius,distance=Math.hypot(dx,dz);
    if(distance>=sum)return null;
    const nx=distance>1e-9?dx/distance:1,nz=distance>1e-9?dz/distance:0;
    return {normalX:nx,normalZ:nz,depth:sum-distance,contactX:cx-nx*radius,contactZ:cz-nz*radius};
  }

  const c=Math.cos(collider.yaw),s=Math.sin(collider.yaw),dx=cx-collider.x,dz=cz-collider.z;
  const lx=dx*c-dz*s,lz=dx*s+dz*c;
  const corner=collider.cornerRadius,coreX=Math.max(0,collider.halfX-corner),coreZ=Math.max(0,collider.halfZ-corner);
  const qx=Math.abs(lx)-coreX,qz=Math.abs(lz)-coreZ;
  const ox=Math.max(qx,0),oz=Math.max(qz,0),outside=Math.hypot(ox,oz);
  const signedDistance=outside+Math.min(Math.max(qx,qz),0)-corner;
  if(signedDistance>=radius)return null;

  let localNx=0,localNz=0;
  if(outside>1e-9) {
    localNx=(qx>0?Math.sign(lx)*ox/outside:0);
    localNz=(qz>0?Math.sign(lz)*oz/outside:0);
  } else if(qx>qz) localNx=lx<0?-1:1;
  else localNz=lz<0?-1:1;

  const normalX=localNx*c+localNz*s,normalZ=-localNx*s+localNz*c;
  return {
    normalX,normalZ,depth:radius-signedDistance,
    contactX:cx-normalX*radius,contactZ:cz-normalZ*radius,
  };
}
