import { Spherical, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function chaseAngle(current:number,target:number,dt:number) {
  return current+Math.atan2(Math.sin(target-current),Math.cos(target-current))*(1-Math.exp(-10*dt));
}
/** Orbit while held; a short release grace then a fast, shortest-arc return. */
export class TricycleCamera {
  private dragging=false;
  private releaseFor=1;
  private wasRiding=false;
  private readonly offset=new Vector3();
  private readonly spherical=new Spherical();
  private readonly start=()=>{this.dragging=true;};
  private readonly end=()=>{this.dragging=false;this.releaseFor=0;};
  private readonly controls:OrbitControls;
  constructor(controls:OrbitControls){this.controls=controls;controls.addEventListener('start',this.start);controls.addEventListener('end',this.end);}
  update(camera:PerspectiveCamera,yaw:number|undefined,dt:number) {
    const riding=yaw!==undefined,c=this.controls;
    if(!riding){if(this.wasRiding)c.enableDamping=true;this.wasRiding=false;return;}
    this.releaseFor+=dt;
    if(this.dragging||(this.wasRiding&&this.releaseFor<.10)){this.wasRiding=true;return;}
    c.enableDamping=false;
    this.offset.copy(camera.position).sub(c.target);this.spherical.setFromVector3(this.offset);
    this.spherical.theta=this.wasRiding?chaseAngle(this.spherical.theta,yaw+Math.PI,dt):yaw+Math.PI;
    this.spherical.phi=this.wasRiding?this.spherical.phi+(.86-this.spherical.phi)*(1-Math.exp(-10*dt)):.86;
    this.spherical.radius=Math.max(.25,this.spherical.radius);
    this.offset.setFromSpherical(this.spherical);camera.position.copy(c.target).add(this.offset);c.update();this.wasRiding=true;
  }
  dispose(){this.controls.removeEventListener('start',this.start);this.controls.removeEventListener('end',this.end);}
}
