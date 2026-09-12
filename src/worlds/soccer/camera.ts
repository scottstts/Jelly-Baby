import { Spherical, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CollisionBox } from '../../facilities/collision.ts';

const SOCCER_POLAR_ANGLE=1.46;
const SOCCER_CAMERA_RATE=6.5;
const SOCCER_CAMERA_RESTORE_RATE=10;
const SOCCER_CAMERA_CLEARANCE=.012;
const SOCCER_CAMERA_MIN_DISTANCE=.006;

/** Changes field framing while keeping the manual orbit and clearing stadium walls. */
export class SoccerCameraPitch {
  private active=false;
  private transitioning=false;
  private dragging=false;
  private normalPolar=1.1;
  private normalRadius=0;
  private preferredRadius=0;
  private appliedRadius=0;
  private transitionPolar=1.1;
  private transitionRadius=0;
  private constrained=false;
  private readonly offset=new Vector3();
  private readonly direction=new Vector3();
  private readonly spherical=new Spherical();
  private readonly controls:OrbitControls;
  private readonly start=()=>{this.dragging=true;this.transitioning=false;};
  private readonly end=()=>{this.dragging=false;};
  constructor(controls:OrbitControls){this.controls=controls;controls.addEventListener('start',this.start);controls.addEventListener('end',this.end);}
  setFieldState(camera:PerspectiveCamera,onField:boolean) {
    if(onField===this.active)return;
    this.offset.copy(camera.position).sub(this.controls.target);this.spherical.setFromVector3(this.offset);
    const radius=this.spherical.radius;
    const maxDistance=Number.isFinite(this.controls.maxDistance)?this.controls.maxDistance:radius;
    if(onField){this.normalPolar=this.spherical.phi;this.normalRadius=radius;this.preferredRadius=this.dragging?radius:maxDistance;}
    else this.preferredRadius=this.normalRadius;
    this.active=onField;this.transitioning=!this.dragging;
    this.transitionPolar=this.spherical.phi;this.transitionRadius=radius;this.appliedRadius=radius;this.constrained=false;
  }
  get needsWidePolarLimit(){return this.active||this.transitioning;}
  update(camera:PerspectiveCamera,dt:number,obstacles:readonly CollisionBox[]=[]){
    const c=this.controls;this.offset.copy(camera.position).sub(c.target);this.spherical.setFromVector3(this.offset);
    const freeRadius=this.spherical.radius;
    const minDistance=Number.isFinite(c.minDistance)?c.minDistance:0,maxDistance=Number.isFinite(c.maxDistance)?c.maxDistance:freeRadius;
    if(this.normalRadius<=0)this.normalRadius=freeRadius;
    if(this.preferredRadius<=0)this.preferredRadius=freeRadius;
    let polar=this.spherical.phi,radius=freeRadius;
    if(this.transitioning&&!this.dragging) {
      const targetPolar=this.active?SOCCER_POLAR_ANGLE:this.normalPolar,targetRadius=this.active?maxDistance:this.normalRadius;
      const blend=1-Math.exp(-SOCCER_CAMERA_RATE*dt);
      this.transitionPolar+=(targetPolar-this.transitionPolar)*blend;this.transitionRadius+=(targetRadius-this.transitionRadius)*blend;
      if(Math.abs(targetPolar-this.transitionPolar)<.0015&&Math.abs(targetRadius-this.transitionRadius)<.00025){this.transitionPolar=targetPolar;this.transitionRadius=targetRadius;this.transitioning=false;}
      polar=this.transitionPolar;radius=this.transitionRadius;
    } else if(this.active) {
      if(!this.constrained)this.preferredRadius=Math.max(minDistance,Math.min(maxDistance,freeRadius));
      radius=this.constrained?this.preferredRadius:freeRadius;
    }
    this.spherical.phi=polar;this.spherical.radius=radius;this.offset.setFromSpherical(this.spherical);
    const wasConstrained=this.constrained,hit=this.firstObstacle(c.target,this.offset,obstacles);
    let desiredRadius=radius;
    if(hit<Infinity){
      desiredRadius=Math.min(radius,Math.max(SOCCER_CAMERA_MIN_DISTANCE,hit-SOCCER_CAMERA_CLEARANCE));this.constrained=true;
    } else if(wasConstrained) {
      const blend=1-Math.exp(-SOCCER_CAMERA_RESTORE_RATE*dt);desiredRadius=radius;
      desiredRadius=this.appliedRadius+(desiredRadius-this.appliedRadius)*blend;
      if(Math.abs(desiredRadius-radius)<.00025){desiredRadius=radius;this.constrained=false;}
    } else this.constrained=false;
    this.appliedRadius=desiredRadius;this.spherical.radius=desiredRadius;this.offset.setFromSpherical(this.spherical);
    camera.position.copy(c.target).add(this.offset);camera.lookAt(c.target);
  }
  private firstObstacle(origin:Vector3,offset:Vector3,obstacles:readonly CollisionBox[]) {
    const radius=offset.length();if(radius<=1e-6)return Infinity;
    const direction=this.direction.copy(offset).multiplyScalar(1/radius);let nearest=Infinity;
    for(const box of obstacles){
      const dx=origin.x-box.center.x,dy=origin.y-box.center.y,dz=origin.z-box.center.z;
      let enter=0,leave=radius,hit=true;
      for(let axis=0;axis<3;axis++) {
        const normal=axis===0?box.xAxis:axis===1?box.yAxis:box.zAxis;
        const localOrigin=dx*normal.x+dy*normal.y+dz*normal.z,localDirection=direction.x*normal.x+direction.y*normal.y+direction.z*normal.z;
        const half=(axis===0?box.halfSize.x:axis===1?box.halfSize.y:box.halfSize.z)+(box.margin??0);
        if(Math.abs(localDirection)<1e-8){if(Math.abs(localOrigin)>half){hit=false;break;}continue;}
        const a=(-half-localOrigin)/localDirection,b=(half-localOrigin)/localDirection,near=Math.min(a,b),far=Math.max(a,b);
        enter=Math.max(enter,near);leave=Math.min(leave,far);if(enter>leave){hit=false;break;}
      }
      if(hit&&enter>1e-5&&enter<nearest)nearest=enter;
    }
    return nearest;
  }
  dispose(){this.controls.removeEventListener('start',this.start);this.controls.removeEventListener('end',this.end);}
}
