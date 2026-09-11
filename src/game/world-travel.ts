import { Scene, Vector3, type WebGPURenderer, type PerspectiveCamera } from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';
import type { FacilityShadows } from '../graphics/facility-shadows.ts';
import { HOME_PORTAL, JellyPortal } from '../graphics/jelly-portal.ts';
import { cameraFacingYaw, portalArrivalZ, TRACK_PORTAL } from './toy-world-layout.ts';
import { warmMainScenePipelines } from '../graphics/render-warmup.ts';
import { Facilities } from './facilities.ts';
import type { TricycleFacility } from './tricycle-facility.ts';

/** World ownership and loading are separate from the main simulation loop. */
export class WorldTravel {
  readonly home=new Scene();
  readonly toys=new Scene();
  readonly toyFacilities:Facilities;
  readonly homePortal=new JellyPortal(HOME_PORTAL.x,HOME_PORTAL.z);
  private returnPortal:JellyPortal|undefined;
  tricycle:TricycleFacility|undefined;
  inToys=false;
  loading=false;
  arrivalYaw=0;
  private cooldown=1;
  private readonly previous=new Vector3();
  private disposed=false;
  private readonly scene:Scene;
  private readonly body:SoftBody;
  private readonly shadows:FacilityShadows;
  private readonly homeFacilities:Facilities;
  private readonly renderer:WebGPURenderer;
  private readonly camera:PerspectiveCamera;
  private readonly stage:(s:string)=>void;
  private readonly fail:(e:unknown)=>void;
  onMove:()=>void=()=>{};
  onReady:()=>void|Promise<void>=()=>{};
  constructor(scene:Scene,body:SoftBody,shadows:FacilityShadows,homeFacilities:Facilities,renderer:WebGPURenderer,camera:PerspectiveCamera,stage:(s:string)=>void,fail:(e:unknown)=>void) {
    this.scene=scene;this.body=body;this.shadows=shadows;this.homeFacilities=homeFacilities;this.renderer=renderer;this.camera=camera;this.stage=stage;this.fail=fail;
    this.toyFacilities=new Facilities(body);this.toyFacilities.enabled=false;
    this.home.add(this.homePortal.group);this.toys.visible=false;scene.add(this.home,this.toys);
  }
  get facilities(){return this.inToys?this.toyFacilities:this.homeFacilities;}
  reset() {
    const toyArrivalZ=this.inToys?portalArrivalZ(TRACK_PORTAL.z,this.body.center.z,this.camera.position.z):0;
    const toyArrivalYaw=this.inToys?cameraFacingYaw(this.body.center.x,this.body.center.z,this.camera.position.x,this.camera.position.z):0;
    this.facilities.reset();this.body.reset();
    if(this.inToys){this.arrivalYaw=toyArrivalYaw;this.place(TRACK_PORTAL.x,toyArrivalZ,toyArrivalYaw);}else {this.arrivalYaw=0;this.previous.copy(this.body.center);}
    this.cooldown=1;
  }
  private placeAtPortal(portal:{x:number;z:number}) {
    const z=portalArrivalZ(portal.z,this.body.center.z,this.camera.position.z);
    const yaw=cameraFacingYaw(this.body.center.x,this.body.center.z,this.camera.position.x,this.camera.position.z);
    this.arrivalYaw=yaw;this.place(portal.x,z,yaw);
  }
  private place(x:number,z:number,yaw:number) {
    const b=this.body;b.reset();
    const cx=b.center.x,cz=b.center.z,c=Math.cos(yaw),s=Math.sin(yaw);
    for(let j=0;j<b.x.length;j+=3) {
      const rx=b.x[j]-cx,rz=b.x[j+2]-cz;
      b.x[j]=x+rx*c+rz*s;b.x[j+2]=z+rz*c-rx*s;
    }
    b.previous.set(b.x);b.updateCenter();b.updateSurface();this.previous.copy(b.center);
  }
  step(h:number) {
    this.cooldown=Math.max(0,this.cooldown-h);
    const portal=this.inToys?TRACK_PORTAL:HOME_PORTAL,b=this.body;
    const dz=b.center.z-this.previous.z;
    const crossed=(this.previous.z-portal.z)*(b.center.z-portal.z)<=0&&Math.abs(dz)>.000001;
    const t=crossed?(portal.z-this.previous.z)/dz:0;
    const x=this.previous.x+(b.center.x-this.previous.x)*t,y=this.previous.y+(b.center.y-this.previous.y)*t;
    this.previous.copy(b.center);
    if(this.loading||this.cooldown>0||b.grab||this.facilities.active)return;
    if(crossed&&Math.hypot(x-portal.x,y-.075)<.057)void this.travel().catch(this.fail);
  }
  update(dt:number) {(this.inToys?this.returnPortal:this.homePortal)?.update(dt);}
  private async travel() {
    this.loading=true;this.onMove();
    document.querySelector('#loading')!.classList.remove('hidden');
    this.stage(this.inToys?'Going back to the playroom':'Unpacking the toy road');
    // Give the existing loading card a painted frame before construction/compile.
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    if(this.disposed)return;
    if(!this.tricycle) {
      const {TricycleFacility}=await import('./tricycle-facility.ts');
      if(this.disposed)return;
      this.tricycle=new TricycleFacility(this.toys,this.body,this.shadows);this.toyFacilities.add(this.tricycle);
      this.returnPortal=new JellyPortal(TRACK_PORTAL.x,TRACK_PORTAL.z);this.toys.add(this.returnPortal.group);
      this.toyFacilities.warmupCollisions();
    }
    this.facilities.resetForTravel();this.inToys=!this.inToys;
    this.home.visible=!this.inToys;this.toys.visible=this.inToys;
    this.homeFacilities.enabled=!this.inToys;this.toyFacilities.enabled=this.inToys;
    const portal=this.inToys?TRACK_PORTAL:HOME_PORTAL;
    this.placeAtPortal(portal);this.cooldown=1;
    // Update after placement so cross-world attachments snap to the destination
    // body before the hidden first render and GPU warmup.
    this.homeFacilities.update();this.toyFacilities.update();
    await this.onReady();this.stage('Settling into the little world');
    const shadowRevision=this.shadows.update(this.renderer);
    this.shadows.surfaces.update(this.renderer,shadowRevision);
    await warmMainScenePipelines(this.renderer,this.scene,this.camera);
    if(this.disposed)return;
    this.renderer.render(this.scene,this.camera);
    await (this.renderer.backend as unknown as {device:GPUDevice}).device.queue.onSubmittedWorkDone();
    if(this.disposed)return;
    document.querySelector('#loading')!.classList.add('hidden');this.loading=false;
  }
  dispose(){this.disposed=true;this.toyFacilities.dispose();this.homePortal.dispose();this.returnPortal?.dispose();this.home.removeFromParent();this.toys.removeFromParent();}
}
