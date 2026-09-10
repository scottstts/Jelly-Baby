import type { SoftBody } from "./soft-body.js";
import type { CollisionBox } from "./facility-collision.ts";

export function emptyBounds(out:Float64Array){out.fill(Infinity,0,3);out.fill(-Infinity,3,6);}
export function unionBounds(out:Float64Array,b:Float64Array){
  for(let a=0;a<3;a++){out[a]=Math.min(out[a],b[a]);out[a+3]=Math.max(out[a+3],b[a+3]);}
}
export function boundsOverlap(a:Float64Array,b:Float64Array){
  return !(a[3]<b[0]||a[0]>b[3]||a[4]<b[1]||a[1]>b[4]||a[5]<b[2]||a[2]>b[5]);
}

/** Enclose the actual dot-product slab intersection, even for imperfect axes. */
export function boxBounds(box:CollisionBox,margin:number,out:Float64Array){
  const {xAxis:a,yAxis:b,zAxis:c,center}=box;
  const i00=b.y*c.z-b.z*c.y,i01=a.z*c.y-a.y*c.z,i02=a.y*b.z-a.z*b.y;
  const i10=b.z*c.x-b.x*c.z,i11=a.x*c.z-a.z*c.x,i12=a.z*b.x-a.x*b.z;
  const i20=b.x*c.y-b.y*c.x,i21=a.y*c.x-a.x*c.y,i22=a.x*b.y-a.y*b.x;
  const det=a.x*i00+a.y*i10+a.z*i20;
  if(!Number.isFinite(det)||Math.abs(det)<1e-12){out.fill(-Infinity,0,3);out.fill(Infinity,3,6);return;}
  const delta=box.margin===undefined?0:box.margin-margin;
  const hx=box.halfSize.x+delta+margin,hy=box.halfSize.y+delta+margin,hz=box.halfSize.z+delta+margin;
  const scale=1/Math.abs(det);
  const rx=(Math.abs(i00)*hx+Math.abs(i01)*hy+Math.abs(i02)*hz)*scale;
  const ry=(Math.abs(i10)*hx+Math.abs(i11)*hy+Math.abs(i12)*hz)*scale;
  const rz=(Math.abs(i20)*hx+Math.abs(i21)*hy+Math.abs(i22)*hz)*scale;
  const pad=1e-10*(1+Math.abs(center.x)+Math.abs(center.y)+Math.abs(center.z)+rx+ry+rz);
  out[0]=center.x-rx-pad;out[1]=center.y-ry-pad;out[2]=center.z-rz-pad;
  out[3]=center.x+rx+pad;out[4]=center.y+ry+pad;out[5]=center.z+rz+pad;
}

/** Authored static pieces plus a full X-axis orbit envelope for pendulum pieces. */
export function facilityBoxBounds(boxes:readonly CollisionBox[],margin:number){
  const out=new Float64Array(6),part=new Float64Array(6);emptyBounds(out);
  for(const box of boxes){
    boxBounds(box,margin,part);
    const motion=box.motion?.nativePendulum;
    if(motion){
      const y=Math.max(Math.abs(part[1]-motion.pivotY),Math.abs(part[4]-motion.pivotY));
      const z=Math.max(Math.abs(part[2]-motion.pivotZ),Math.abs(part[5]-motion.pivotZ));
      const radius=Math.hypot(y,z)+1e-10;
      part[1]=motion.pivotY-radius;part[4]=motion.pivotY+radius;
      part[2]=motion.pivotZ-radius;part[5]=motion.pivotZ+radius;
    }else if(box.motion){
      // No motion envelope contract: never reject an arbitrary moving object.
      part.fill(-Infinity,0,3);part.fill(Infinity,3,6);
    }
    unionBounds(out,part);
  }
  return out;
}

/** Current cage enclosure plus the exact bulk-translation path used by throws. */
export function bodyCollisionBounds(body:SoftBody,magnitude:number,error:number,out:Float64Array){
  const x=body.x,previous=body.previous,velocity=body.velocity;
  let vx=0,vy=0,vz=0,dx=0,dy=0,dz=0;
  emptyBounds(out);
  for(let j=0;j<x.length;j+=3){
    for(let a=0;a<3;a++){out[a]=Math.min(out[a],x[j+a]);out[a+3]=Math.max(out[a+3],x[j+a]);}
    if(previous&&body.mass){
      const w=body.mass[j/3]/body.totalMass;
      vx+=w*velocity[j];vy+=w*velocity[j+1];vz+=w*velocity[j+2];
      dx+=w*(x[j]-previous[j]);dy+=w*(x[j+1]-previous[j+1]);dz+=w*(x[j+2]-previous[j+2]);
    }
  }
  const swept=previous&&vx*vx+vy*vy+vz*vz>=.8*.8&&dx*dx+dy*dy+dz*dz>=1e-10;
  if(swept){
    for(let j=0;j<x.length;j+=3)for(let a=0;a<3;a++){
      const v=previous[j+a],delta=a===0?dx:a===1?dy:dz;
      out[a]=Math.min(out[a],v,v+delta);out[a+3]=Math.max(out[a+3],v,v+delta);
    }
  }
  for(let a=0;a<3;a++){
    const center=(out[a]+out[a+3])*.5;
    const radius=(out[a+3]-out[a])*.5*magnitude+Math.abs(center)*error+(swept?Math.abs(a===0?dx:a===1?dy:dz)*error:0);
    const pad=1e-10*(1+Math.abs(center)+radius);out[a]=center-radius-pad;out[a+3]=center+radius+pad;
  }
}

const worlds=new WeakMap<SoftBody,CollisionHierarchy>();
const COLLISION_BOUNDS_WARMUP_PASSES=32;
export function collisionHierarchy(body:SoftBody){
  let world=worlds.get(body);if(!world){world=new CollisionHierarchy(body);worlds.set(body,world);}return world;
}

/** Cache only inside Facilities.afterStep; direct callers always get fresh bounds. */
export class CollisionHierarchy {
  private readonly body:SoftBody;
  private readonly groups=new Set<Float64Array>();
  private readonly all=new Float64Array(6);
  private readonly bounds=new Float64Array(6);
  private magnitude=1;
  private error=0;
  private batching=false;
  private valid=false;
  private outsideWorld=false;
  boundBuilds=0;
  worldRejects=0;
  facilityRejects=0;
  constructor(body:SoftBody){
    this.body=body;emptyBounds(this.all);
    // Cover the full embedding, not just the spatially thinned contact anchors.
    const weights=body.surface.bindingWeights;
    for(let i=0;i<weights.length;i+=4){
      let magnitude=0,sum=0;for(let k=0;k<4;k++){magnitude+=Math.abs(weights[i+k]);sum+=weights[i+k];}
      this.magnitude=Math.max(this.magnitude,magnitude);this.error=Math.max(this.error,Math.abs(sum-1));
    }
  }
  includeBindings(magnitude:number,error:number){
    this.magnitude=Math.max(this.magnitude,magnitude);this.error=Math.max(this.error,error);this.invalidate();
  }
  register(bounds:Float64Array){this.groups.add(bounds);unionBounds(this.all,bounds);this.invalidate();}
  unregister(bounds:Float64Array){this.groups.delete(bounds);emptyBounds(this.all);for(const b of this.groups)unionBounds(this.all,b);this.invalidate();}
  /** Exercise the native enclosure export without changing hierarchy cache/counters. */
  warmup(){const kernel=this.body.kernel;if(kernel)for(let i=0;i<COLLISION_BOUNDS_WARMUP_PASSES;i++)kernel.collisionBounds(this.magnitude,this.error);}
  begin(){this.batching=true;this.invalidate();}
  end(){this.batching=false;this.invalidate();}
  invalidate(){this.valid=false;}
  read(){
    if(!this.batching||!this.valid){
      if(this.body.kernel)this.bounds.set(this.body.kernel.collisionBounds(this.magnitude,this.error));
      else bodyCollisionBounds(this.body,this.magnitude,this.error,this.bounds);
      this.boundBuilds++;this.valid=true;this.outsideWorld=!boundsOverlap(this.bounds,this.all);
    }
    return this.bounds;
  }
  forGroup(group:Float64Array){
    const b=this.read();
    if(this.outsideWorld){this.worldRejects++;return null;}
    if(!boundsOverlap(b,group)){this.facilityRejects++;return null;}
    return b;
  }
}
