import { Scene, type WebGPURenderer, type PerspectiveCamera } from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';
import type { FacilityShadows } from '../facilities/shadows.ts';
import { JellyPortal } from '../facilities/portal/graphics.ts';
import { HOME_PORTAL } from './main/layout.ts';
import { cameraFacingYaw, portalArrivalZ, TRACK_PORTAL } from './toy-track/portal-layout.ts';
import { warmMainScenePipelines } from '../graphics/scene/render-warmup.ts';
import { Facilities } from '../facilities/manager.ts';
import type { TricycleFacility } from './toy-track/facilities/tricycle/facility.ts';
import { PortalFacility } from '../facilities/portal/facility.ts';
import { DestinationMenu, type WorldId } from './destination-menu.ts';
import { SOCCER_PORTAL } from './soccer/layout.ts';
import type { SoccerFacility } from './soccer/facility.ts';

/** World ownership and loading are separate from the main simulation loop. */
export class WorldTravel {
  readonly home=new Scene();
  readonly toys=new Scene();
  readonly soccerWorld=new Scene();
  readonly soccerFacilities:Facilities;
  readonly menu:DestinationMenu;
  readonly toyFacilities:Facilities;
  readonly homePortal=new JellyPortal(HOME_PORTAL.x,HOME_PORTAL.z);
  readonly homePortalFacility:PortalFacility;
  private returnPortal:JellyPortal|undefined;
  private returnPortalFacility:PortalFacility|undefined;
  tricycle:TricycleFacility|undefined;
  soccer:SoccerFacility|undefined;
  private soccerPortal:JellyPortal|undefined;
  private soccerPortalFacility:PortalFacility|undefined;
  current:WorldId='home';
  get inToys(){return this.current==='toys';}
  get inSoccer(){return this.current==='soccer';}
  loading=false;
  arrivalYaw=0;
  private cooldown=1;
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
  onMenuOpen:()=>void=()=>{};
  onReady:()=>void|Promise<void>=()=>{};
  constructor(scene:Scene,body:SoftBody,shadows:FacilityShadows,homeFacilities:Facilities,renderer:WebGPURenderer,camera:PerspectiveCamera,stage:(s:string)=>void,fail:(e:unknown)=>void) {
    this.scene=scene;this.body=body;this.shadows=shadows;this.homeFacilities=homeFacilities;this.renderer=renderer;this.camera=camera;this.stage=stage;this.fail=fail;
    this.toyFacilities=new Facilities(body);this.toyFacilities.enabled=false;
    this.soccerFacilities=new Facilities(body);this.soccerFacilities.enabled=false;
    this.menu=new DestinationMenu(id=>{if(id===this.current){this.onMenuClose();return;}void this.travel(id).catch(this.fail);},()=>this.onMenuClose());
    this.homePortalFacility=new PortalFacility(body,'home-portal-housing',HOME_PORTAL.x,HOME_PORTAL.z,this.homePortal.collisionBoxes,()=>this.requestTravel(),()=>this.portalAvailable());
    this.homeFacilities.add(this.homePortalFacility);
    this.home.add(this.homePortal.group);this.toys.visible=this.soccerWorld.visible=false;scene.add(this.home,this.toys,this.soccerWorld);
    this.shadows.add(this.homePortal.group,this.homePortal.lightingEnvelope);
  }
  get facilities(){return this.inSoccer?this.soccerFacilities:this.inToys?this.toyFacilities:this.homeFacilities;}
  /** The active world's portal is a normal facility candidate for E/touch. */
  get portalFacility():PortalFacility {return this.inSoccer?this.soccerPortalFacility!:this.inToys?this.returnPortalFacility!:this.homePortalFacility;}
  reset() {
    this.menu.hide();this.onMenuClose();
    const portal=this.inSoccer?SOCCER_PORTAL:TRACK_PORTAL;
    const toyArrivalZ=this.current!=='home'?portalArrivalZ(portal.z,this.body.center.z,this.camera.position.z):0;
    const toyArrivalYaw=this.current!=='home'?cameraFacingYaw(this.body.center.x,this.body.center.z,this.camera.position.x,this.camera.position.z):0;
    this.facilities.reset();this.body.reset();
    if(this.current!=='home'){this.arrivalYaw=toyArrivalYaw;this.place(portal.x,toyArrivalZ,toyArrivalYaw);}else this.arrivalYaw=0;
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
    b.previous.set(b.x);b.updateCenter();b.updateSurface();
  }
  step(h:number) {
    this.cooldown=Math.max(0,this.cooldown-h);
  }
  private portalAvailable() {
    return !this.loading&&!this.menu.opened&&this.cooldown<=0&&!this.body.grab&&!this.facilities.active;
  }
  private requestTravel() {
    if(!this.portalAvailable())return false;
    this.onMenuOpen();this.menu.show(this.current);
    return true;
  }
  onMenuClose:()=>void=()=>{};
  update(dt:number) {(this.inSoccer?this.soccerPortal:this.inToys?this.returnPortal:this.homePortal)?.update(dt);if(this.inSoccer)this.soccer?.updateFrame(dt);this.soccer?.updateOptics(this.renderer,this.inSoccer);}
  private async travel(destination:WorldId) {
    this.loading=true;this.onMove();
    document.querySelector('#loading')!.classList.remove('hidden');
    this.stage(destination==='home'?'Going home':destination==='toys'?'Unpacking the toy road':'Unpacking the little stadium');
    // Give the existing loading card a painted frame before construction/compile.
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    if(this.disposed)return;
    if(destination==='toys'&&!this.tricycle) {
      const {TricycleFacility}=await import('./toy-track/facilities/tricycle/facility.ts');
      if(this.disposed)return;
      this.tricycle=new TricycleFacility(this.toys,this.body,this.shadows);this.toyFacilities.add(this.tricycle);
      this.returnPortal=new JellyPortal(TRACK_PORTAL.x,TRACK_PORTAL.z);this.toys.add(this.returnPortal.group);
      this.shadows.add(this.returnPortal.group,this.returnPortal.lightingEnvelope);
      this.returnPortalFacility=new PortalFacility(this.body,'toy-portal-housing',TRACK_PORTAL.x,TRACK_PORTAL.z,this.returnPortal.collisionBoxes,()=>this.requestTravel(),()=>this.portalAvailable());
      this.toyFacilities.add(this.returnPortalFacility);
      this.toyFacilities.warmupCollisions();
    }
    if(destination==='soccer'&&!this.soccer) {
      const {SoccerFacility}=await import('./soccer/facility.ts');if(this.disposed)return;
      const {disposeGrassTextures,loadGrassTextures}=await import('./soccer/turf.ts');
      const grass=await loadGrassTextures();
      if(this.disposed){disposeGrassTextures(grass);return;}
      this.soccer=new SoccerFacility(this.soccerWorld,this.body,this.shadows,grass,{camera:this.camera,fail:this.fail});this.soccerFacilities.add(this.soccer);
      this.soccerPortal=new JellyPortal(SOCCER_PORTAL.x,SOCCER_PORTAL.z);this.soccerWorld.add(this.soccerPortal.group);this.shadows.add(this.soccerPortal.group,this.soccerPortal.lightingEnvelope);
      this.soccerPortalFacility=new PortalFacility(this.body,'soccer-portal-housing',SOCCER_PORTAL.x,SOCCER_PORTAL.z,this.soccerPortal.collisionBoxes,()=>this.requestTravel(),()=>this.portalAvailable());
      this.soccerFacilities.add(this.soccerPortalFacility);this.soccerFacilities.warmupCollisions();
    }
    this.facilities.resetForTravel();this.current=destination;
    this.home.visible=destination==='home';this.toys.visible=this.inToys;this.soccerWorld.visible=this.inSoccer;
    this.homeFacilities.enabled=destination==='home';this.toyFacilities.enabled=this.inToys;this.soccerFacilities.enabled=this.inSoccer;
    const portal=this.inSoccer?SOCCER_PORTAL:this.inToys?TRACK_PORTAL:HOME_PORTAL;
    this.placeAtPortal(portal);this.cooldown=1;
    // Update after placement so cross-world attachments snap to the destination
    // body before the hidden first render and GPU warmup.
    this.homeFacilities.update();this.toyFacilities.update();this.soccerFacilities.update();
    await this.onReady();this.stage('Settling into the little world');
    this.soccer?.updateFrame(0);this.soccer?.updateOptics(this.renderer,this.inSoccer);
    const shadowRevision=this.shadows.update(this.renderer);
    this.shadows.surfaces.update(this.renderer,shadowRevision);
    await warmMainScenePipelines(this.renderer,this.scene,this.camera);
    if(this.disposed)return;
    this.renderer.render(this.scene,this.camera);
    await (this.renderer.backend as unknown as {device:GPUDevice}).device.queue.onSubmittedWorkDone();
    if(this.disposed)return;
    document.querySelector('#loading')!.classList.add('hidden');this.loading=false;
  }
  dispose(){this.disposed=true;this.menu.dispose();this.toyFacilities.dispose();this.soccerFacilities.dispose();this.homePortal.dispose();this.returnPortal?.dispose();this.soccerPortal?.dispose();this.home.removeFromParent();this.toys.removeFromParent();this.soccerWorld.removeFromParent();}
}
