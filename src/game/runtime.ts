import * as THREE from 'three/webgpu';
import { SoftBody } from '../physics/soft-body.js';
import { PHYS } from '../physics/constants.js';
import { loadBabyCage } from '../physics/baby-cage.ts';
import { RefractiveLightField } from '../graphics/refractive-light.js';
import { Baby, ABSORPTION } from '../graphics/baby.ts';
import { loadEnvironment } from '../graphics/environment.ts';
import { makeTable } from '../graphics/table.ts';
import { Locomotion } from './locomotion.ts';
import { Input } from './input.ts';
import { JellySound } from './sound.ts';
import { createRenderer, resizeView } from '../graphics/renderer.ts';
import { OpticalTransport } from '../graphics/transport.ts';
import { createComposite } from '../graphics/composite.ts';
import { FixedStepper } from './fixed-step.ts';
import { JELLY_FLAVORS } from '../graphics/jelly-flavors.ts';
import { FlavorPicker } from './flavor-picker.ts';
import { Facilities } from './facilities.ts';
import { SwingFacility } from './swing-facility.ts';
import { FacilityShadows } from '../graphics/facility-shadows.ts';
import { LightingMode } from './lighting-mode.ts';
import { BedFacility } from './bed-facility.ts';
import { TrampolineFacility } from './trampoline-facility.ts';
import { CarriedWearableFacility, WearableFacility } from './wearable-facility.ts';
import { warmMainScenePipelines } from '../graphics/render-warmup.ts';
import { WorldTravel } from './world-travel.ts';

export async function startGame(stage:(s:string)=>void,fail:(e:unknown)=>void) {
  stage('Starting WebGPU');
  const renderer=await createRenderer(fail);
  document.querySelector('#viewport')!.appendChild(renderer.domElement);
  // Construct audio before the remaining async scene work so the first mobile
  // gesture can unlock Web Audio even while assets and shaders are settling.
  const sound=new JellySound();
  const scene=new THREE.Scene();
  scene.background=new THREE.Color('#e8d9c3');scene.fog=new THREE.Fog('#e8d9c3',2,12);
  const camera=new THREE.PerspectiveCamera(36,1,.001,40);
  camera.position.set(.111,.170,.256);
  stage('Reading the light');
  const environment=await loadEnvironment(renderer,scene);
  stage('Making a little jelly');
  const body=new SoftBody(await loadBabyCage());
  const baby=new Baby(body);scene.add(baby.group);
  const optics=new RefractiveLightField(body.cage.opticalSurface,environment.incoming,ABSORPTION);
  const facilityShadows=new FacilityShadows(environment.incoming,environment.windowFraction);
  facilityShadows.surfaces.addBaby(baby.mesh);
  const table=await makeTable(optics,environment,facilityShadows);scene.add(table.mesh);
  const composite=createComposite(renderer,scene,camera);
  const rig=new Locomotion(body);
  const facilities=new Facilities(body);
  const worlds=new WorldTravel(scene,body,facilityShadows,facilities,renderer,camera,stage,fail);
  const wearableTable=new WearableFacility(worlds.home,body,baby.group,rig,facilityShadows);
  const bed=new BedFacility(worlds.home,body,facilityShadows);
  rig.onJump=()=>wearableTable.jumpFromNormalLocomotion();
  facilities.add(wearableTable);
  worlds.toyFacilities.add(new CarriedWearableFacility(wearableTable));
  facilities.add(new SwingFacility(worlds.home,body,facilityShadows,sound.facility));
  facilities.add(new TrampolineFacility(worlds.home,body,facilityShadows,sound.facility));
  facilities.add(bed);
  const flavorPicker=new FlavorPicker(flavor=>{
    baby.setFlavor(flavor);optics.setAbsorption(JELLY_FLAVORS[flavor].absorption);
  });
  rig.onContact=(speed,foot)=>sound.contact(speed,foot);
  const physicsClock=new FixedStepper(PHYS.step);
  let lastTime=0,disposed=false;
  const reset=()=>{if(worlds.loading)return;sound.stopFacilities();worlds.reset();input.teleport();rig.yaw=worlds.arrivalYaw;baby.resetFace();physicsClock.reset();};
  const input=new Input(camera,renderer.domElement,body,baby.mesh,rig,sound);
  input.bodyControlled=()=>worlds.loading||!!worlds.facilities.active;
  input.facilityCameraDistance=()=>worlds.facilities.active?.cameraDistance;
  input.vehicleInput=(throttle,turn)=>{const p=worlds.tricycle?.physics;if(p&&worlds.inToys){p.throttle=p.riding?throttle:0;p.turn=p.riding?turn:0;}};
  input.ridingVehicle=()=>worlds.inToys&&(worlds.tricycle?.physics.riding??false);
  input.vehicleHeading=()=>worlds.tricycle?.physics.yaw;
  facilities.onInteract=()=>{input.clear();rig.reset();void sound.unlock().catch(()=>{});};
  worlds.toyFacilities.onInteract=facilities.onInteract;
  worlds.onMove=()=>{input.clear();sound.stopFacilities();physicsClock.reset();};
  worlds.onReady=async()=>{
    input.teleport();rig.yaw=worlds.arrivalYaw;baby.resetFace();physicsClock.reset();
    if(worlds.tricycle){
      worlds.tricycle.physics.onCrash=speed=>sound.contact(speed,false);
      worlds.tricycle.onWalkCurbImpact=speed=>rig.surfaceImpact(speed);
    }
    baby.update();optics.update(renderer,body,true);transport.follow();await transport.update();
  };
  const transport=new OpticalTransport(optics,body,camera,environment.incoming,fail);
  const lightingMode=new LightingMode(renderer,scene,environment,light=>{
    optics.setLightDirection(light.incoming);transport.setLightDirection(light.incoming);
    facilityShadows.setLighting(light.incoming,light.windowFraction);table.setLighting(light);
  },fail);
  const resize=()=>resizeView(renderer,camera,input.controls);
  let resizeFrame=0;
  const resizeObserver=new ResizeObserver(()=>{
    cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(resize);
  });
  resizeObserver.observe(document.querySelector('#viewport')!);resize();
  document.querySelector('#reset')!.addEventListener('click',event=>{
    reset();if((event as MouseEvent).detail>0)(event.currentTarget as HTMLButtonElement).blur();
  });
  document.querySelector('#sound')!.addEventListener('click',event=>{
    const muted=sound.toggle(),button=document.querySelector('#sound')!;
    button.setAttribute('aria-pressed',String(muted));button.setAttribute('aria-label',muted?'Enable sound':'Mute sound');
    button.classList.toggle('muted',muted);void sound.unlock().catch(()=>{});
    if((event as MouseEvent).detail>0)(event.currentTarget as HTMLButtonElement).blur();
  });
  stage('Settling in');
  // Let contact establish itself before displaying the first frame.
  for(let i=0;i<80;i++){rig.step(PHYS.step);body.step(PHYS.step);}
  body.updateSurface();
  stage('Warming collisions');
  facilities.warmupCollisions();
  baby.update();input.update(1);
  const shadowSyncRevision=facilityShadows.update(renderer);
  facilityShadows.surfaces.update(renderer,shadowSyncRevision);
  optics.update(renderer,body,true);
  await transport.update();
  stage('Compiling the material');
  await warmMainScenePipelines(renderer,scene,camera);
  stage('Drawing the first frame');
  composite.render();
  // Fence first-frame GPU work so validation/OOM cannot masquerade as a successful boot.
  const backend=renderer.backend as unknown as {device:GPUDevice};
  await backend.device.queue.onSubmittedWorkDone();
  lastTime=performance.now();
  const frame=(time:number)=>{
    if(disposed)return;
    try {
      const dt=Math.min(.05,Math.max(0,(time-lastTime)/1000));lastTime=time;
      if(document.hidden){physicsClock.reset();return;}
      if(worlds.loading){physicsClock.reset();return;}
      const steps=physicsClock.advance(dt,()=>{
        if(worlds.loading)return;
        const current=worlds.facilities;
        input.step(PHYS.step);current.step(PHYS.step);
        if(!current.active)rig.step(PHYS.step);
        body.step(PHYS.step);wearableTable.syncBedOccupancy(bed.active);current.afterStep();input.afterPhysicsStep();
        if(!current.active)rig.afterStep();
        worlds.step(PHYS.step);
      });
      if(steps&&body.surfaceDirty) {
        if(!body.isFinite())throw new Error('The soft-body simulation produced an invalid state');
        body.updateSurface();
      }
      if(worlds.loading)return;
      worlds.facilities.update();worlds.update(dt);
      baby.update(dt,worlds.facilities.active?.laughing??false,worlds.facilities.active?.sleeping??false,worlds.facilities.crying);
      const shadowSyncRevision=facilityShadows.update(renderer);
      facilityShadows.surfaces.update(renderer,shadowSyncRevision);
      input.update(dt);
      sound.listen(camera);
      const tricycle=worlds.inToys?worlds.tricycle?.physics:undefined;
      if(tricycle)sound.tricycleMotion(tricycle.rollingSpeed,tricycle.position.x,tricycle.position.y+.025,tricycle.position.z);
      transport.follow();
      optics.update(renderer,body);
      table.mesh.position.x=body.center.x;table.mesh.position.z=body.center.z;
      void transport.update().catch(fail);
      composite.render();
    }catch(error){fail(error);}
  };
  await renderer.setAnimationLoop(frame);
  const dispose=()=>{
    if(disposed)return;disposed=true;
    lightingMode.dispose();void renderer.setAnimationLoop(null);input.dispose();sound.dispose();transport.dispose();resizeObserver.disconnect();cancelAnimationFrame(resizeFrame);
    worlds.dispose();facilities.dispose();facilityShadows.dispose();flavorPicker.dispose();composite.dispose();baby.dispose();table.dispose();environment.dispose();optics.dispose();renderer.dispose();
  };
  window.addEventListener('pagehide',event=>{if(!event.persisted)dispose();});
  if(import.meta.hot)import.meta.hot.dispose(dispose);
  return {stop:()=>{disposed=true;worlds.dispose();lightingMode.dispose();input.clear();facilities.dispose();facilityShadows.dispose();flavorPicker.dispose();sound.dispose();transport.dispose();void renderer.setAnimationLoop(null);}};
}
