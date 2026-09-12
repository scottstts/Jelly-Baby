import { Spherical, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SOCCER_POLAR_ANGLE=1.46;

/** Changes only pitch on field entry/exit. Horizontal orbit stays fully manual. */
export class SoccerCameraPitch {
  private active=false;
  private transitioning=false;
  private dragging=false;
  private normalPolar=1.1;
  private readonly offset=new Vector3();
  private readonly spherical=new Spherical();
  private readonly controls:OrbitControls;
  private readonly start=()=>{this.dragging=true;this.transitioning=false;};
  private readonly end=()=>{this.dragging=false;};
  constructor(controls:OrbitControls){this.controls=controls;controls.addEventListener('start',this.start);controls.addEventListener('end',this.end);}
  setFieldState(camera:PerspectiveCamera,onField:boolean) {
    if(onField===this.active)return;
    this.offset.copy(camera.position).sub(this.controls.target);this.spherical.setFromVector3(this.offset);
    if(onField)this.normalPolar=this.spherical.phi;
    this.active=onField;this.transitioning=!this.dragging;
  }
  get needsWidePolarLimit(){return this.active||this.transitioning;}
  update(camera:PerspectiveCamera,dt:number) {
    if(!this.transitioning||this.dragging)return;
    const c=this.controls;this.offset.copy(camera.position).sub(c.target);this.spherical.setFromVector3(this.offset);
    const target=this.active?SOCCER_POLAR_ANGLE:this.normalPolar;
    this.spherical.phi+=(target-this.spherical.phi)*(1-Math.exp(-6.5*dt));
    if(Math.abs(target-this.spherical.phi)<.0015){this.spherical.phi=target;this.transitioning=false;}
    this.offset.setFromSpherical(this.spherical);camera.position.copy(c.target).add(this.offset);c.update();
  }
  dispose(){this.controls.removeEventListener('start',this.start);this.controls.removeEventListener('end',this.end);}
}
