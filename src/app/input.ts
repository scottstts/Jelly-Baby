import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SoftBody } from '../physics/soft-body.js';
import type { Locomotion } from './locomotion.ts';
import type { JellySound } from './sound.ts';
import { surfaceGrab, projectGrabTarget, advanceGrabTarget } from '../physics/grab.ts';
import { MAX_GRABS } from '../physics/soft-body-kernel.js';
import { SurfaceBVH } from '../graphics/optics/refractive-light.js';
import { TricycleCamera } from '../worlds/toy-track/facilities/tricycle/camera.ts';
import { SoccerCameraPitch } from '../worlds/soccer/camera.ts';

type PointerGrab={
  grab:NonNullable<ReturnType<typeof surfaceGrab>>;
  pointerType:string;
  plane:THREE.Plane;
  rawTarget:THREE.Vector3;
  releasePending:boolean;
  releaseStepsRemaining:number;
  physicsSteps:number;
  commandVersion:number;
  consumedVersion:number;
};

export class Input {
  /** Facilities temporarily own the body while orbit controls remain available. */
  bodyControlled:()=>boolean=()=>false;
  facilityCameraDistance:()=>number|undefined=()=>undefined;
  vehicleInput:((throttle:number,turn:number)=>void)|undefined;
  ridingVehicle:()=>boolean=()=>false;
  vehicleHeading:()=>number|undefined=()=>undefined;
  soccerOnField:()=>boolean=()=>false;
  shoot:()=>void=()=>{};
  menuOpen:()=>boolean=()=>false;
  private readonly chase:TricycleCamera;
  private readonly soccerCamera:SoccerCameraPitch;
  private vehicleHints=false;
  readonly controls:OrbitControls;
  private keys=new Set<string>();
  private touchKeys=new Map<number,string>();
  private joystickPointer:number|null=null;
  private joystickX=0;
  private joystickZ=0;
  private joystickElement:HTMLButtonElement|null=null;
  private joystickKnob:HTMLElement|null=null;
  private grabs=new Map<number,PointerGrab>();
  private raycaster=new THREE.Raycaster();
  private grabBVH:SurfaceBVH;
  private pointer=new THREE.Vector2();
  private temp=new THREE.Vector3();
  private follow=new THREE.Vector3();
  private abort=new AbortController();
  private canvas:HTMLCanvasElement;
  readonly camera:THREE.PerspectiveCamera;
  readonly body:SoftBody;
  readonly mesh:THREE.Mesh;
  readonly rig:Locomotion;
  readonly sound:JellySound;
  constructor(camera:THREE.PerspectiveCamera,canvas:HTMLCanvasElement,
    body:SoftBody,mesh:THREE.Mesh,rig:Locomotion,sound:JellySound) {
    this.camera=camera;this.body=body;this.mesh=mesh;this.rig=rig;this.sound=sound;
    this.canvas=canvas;this.grabBVH=new SurfaceBVH(body.surface);
    this.controls=new OrbitControls(camera,canvas);
    this.chase=new TricycleCamera(this.controls);
    this.soccerCamera=new SoccerCameraPitch(this.controls);
    const c=this.controls;
    c.target.copy(body.center);this.follow.copy(c.target);
    c.enablePan=false;c.enableDamping=true;c.dampingFactor=.07;
    c.minDistance=.135;c.maxDistance=.42;c.minPolarAngle=.22;c.maxPolarAngle=1.10;
    c.rotateSpeed=.65;c.zoomSpeed=.65;c.update();
    const signal=this.abort.signal;
    canvas.addEventListener('pointerdown',this.begin,{capture:true,signal});
    canvas.addEventListener('pointermove',this.pointerMove,{capture:true,passive:false,signal});
    // Window-level release is deliberate. Pointer capture should deliver these
    // through the canvas, but this closes the failure mode where a browser/OS
    // transition loses that path and leaves a grip wedged forever.
    window.addEventListener('pointerup',this.end,{capture:true,signal});
    window.addEventListener('pointercancel',this.end,{capture:true,signal});
    window.addEventListener('pointerup',this.releaseJoystick,{capture:true,signal});
    window.addEventListener('pointercancel',this.releaseJoystick,{capture:true,signal});
    canvas.addEventListener('lostpointercapture',this.end,{signal});
    window.addEventListener('keydown',this.keyDown,{signal});
    window.addEventListener('keyup',e=>this.keys.delete(e.code),{signal});
    window.addEventListener('blur',this.clear,{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden) this.clear();},{signal});
    this.joystickElement=document.querySelector<HTMLButtonElement>('[data-joystick]');
    this.joystickKnob=this.joystickElement?.querySelector<HTMLElement>('.joystick-knob')??null;
    if(this.joystickElement) {
      this.joystickElement.addEventListener('pointerdown',this.joystickStart,{signal});
      this.joystickElement.addEventListener('pointermove',this.joystickMove,{passive:false,signal});
      this.joystickElement.addEventListener('pointerup',this.releaseJoystick,{signal});
      this.joystickElement.addEventListener('pointercancel',this.releaseJoystick,{signal});
      this.joystickElement.addEventListener('lostpointercapture',this.releaseJoystick,{signal});
    }
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-control]')) {
      button.addEventListener('pointerdown',e=>{
        e.preventDefault();void sound.unlock().catch(()=>{});button.setPointerCapture(e.pointerId);
        const code=button.dataset.control!;
        this.touchKeys.set(e.pointerId,code);button.classList.add('held');
        if(code==='Space'){if(this.soccerOnField())this.shoot();else if(!this.bodyControlled())rig.jump();}
      },{signal});
      const release=(e:PointerEvent)=>{
        this.touchKeys.delete(e.pointerId);button.classList.remove('held');
      };
      button.addEventListener('pointerup',release,{signal});
      button.addEventListener('pointercancel',release,{signal});
      button.addEventListener('lostpointercapture',release,{signal});
    }
  }
  private joystickStart=(e:PointerEvent)=>{
    if(this.joystickPointer!==null||(e.pointerType==='mouse'&&e.button!==0))return;
    e.preventDefault();e.stopPropagation();void this.sound.unlock().catch(()=>{});
    this.joystickPointer=e.pointerId;this.joystickElement?.setPointerCapture(e.pointerId);
    this.joystickElement?.classList.add('held');this.joystickMove(e);
  };
  private joystickMove=(e:PointerEvent)=>{
    const joystick=this.joystickElement;
    if(!joystick||this.joystickPointer!==e.pointerId)return;
    e.preventDefault();e.stopPropagation();
    const rect=joystick.getBoundingClientRect(),knob=this.joystickKnob?.getBoundingClientRect();
    const radius=Math.max(1,Math.min(rect.width,rect.height)/2-(knob?.width??0)/2-5);
    const dx=e.clientX-(rect.left+rect.width/2),dy=e.clientY-(rect.top+rect.height/2);
    const distance=Math.hypot(dx,dy),scale=distance>radius?radius/distance:1;
    const offsetX=dx*scale,offsetY=dy*scale;
    this.joystickX=offsetX/radius;this.joystickZ=-offsetY/radius;
    this.joystickKnob?.style.setProperty('--joystick-x',`${offsetX}px`);
    this.joystickKnob?.style.setProperty('--joystick-y',`${offsetY}px`);
  };
  private releaseJoystick=(e:PointerEvent)=>{
    if(this.joystickPointer!==e.pointerId)return;
    e.preventDefault();
    const joystick=this.joystickElement,id=this.joystickPointer;
    this.joystickPointer=null;this.joystickX=0;this.joystickZ=0;
    this.joystickKnob?.style.setProperty('--joystick-x','0px');
    this.joystickKnob?.style.setProperty('--joystick-y','0px');joystick?.classList.remove('held');
    if(id!==null&&joystick?.hasPointerCapture(id))joystick.releasePointerCapture(id);
  };
  private eventRay(e:PointerEvent) {
    const rect=this.canvas.getBoundingClientRect();
    this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    this.camera.updateMatrixWorld();this.raycaster.setFromCamera(this.pointer,this.camera);
  }
  private captureDragTarget(e:PointerEvent,state:PointerGrab) {
    // The final coalesced sample is the newest physical pointer position. Using
    // it also makes very fast high-polling-rate mouse motion deterministic.
    const samples=e.getCoalescedEvents?.()??[];
    const sample=samples.length?samples[samples.length-1]:e;
    this.eventRay(sample);
    if(projectGrabTarget(this.raycaster.ray,state.plane,this.temp)) {
      state.rawTarget.copy(this.temp);state.commandVersion++;return true;
    }
    return false;
  }
  private begin=(e:PointerEvent)=>{
    if(this.bodyControlled())return;
    if(e.button!==0||this.grabs.has(e.pointerId)||this.body.grabs.length>=MAX_GRABS)return;
    // Only touch can add simultaneous grips; desktop mouse/pen keep one grip.
    if(this.body.grab&&(e.pointerType!=='touch'||[...this.grabs.values()].some(state=>state.pointerType!=='touch')))return;
    this.eventRay(e);
    // Exact picking against the same full-resolution deformed surface that is
    // rendered, but through its refittable BVH instead of Three's O(144k)
    // triangle scan. This changes no grip position or binding semantics.
    this.grabBVH.refit();
    const ray=this.raycaster.ray,o=[ray.origin.x,ray.origin.y,ray.origin.z],d=[ray.direction.x,ray.direction.y,ray.direction.z];
    const hit=this.grabBVH.hit(o,d);if(!hit)return;
    const ix=this.body.surface.indices,offset=hit.t*3;
    const face={a:ix[offset],b:ix[offset+1],c:ix[offset+2]};
    const point=ray.at(hit.distance,new THREE.Vector3());
    void this.sound.unlock().catch(()=>{});
    e.preventDefault();e.stopImmediatePropagation();
    const grab=surfaceGrab(this.body,face,point);if(!grab)return;
    this.body.grabs.push(grab);this.body.wake();
    this.camera.getWorldDirection(this.temp);
    this.grabs.set(e.pointerId,{
      grab,pointerType:e.pointerType,
      plane:new THREE.Plane().setFromNormalAndCoplanarPoint(this.temp,point),rawTarget:point.clone(),
      releasePending:false,releaseStepsRemaining:0,physicsSteps:0,commandVersion:0,consumedVersion:0,
    });
    this.controls.enabled=false;
    this.canvas.setPointerCapture(e.pointerId);this.canvas.classList.add('grabbing');
  };
  private pointerMove=(e:PointerEvent)=>{
    const state=this.grabs.get(e.pointerId);
    if(state&&!state.releasePending) {
      if(e.pointerType==='mouse'&&(e.buttons&1)===0) {
        // Recover even if pointerup/lostpointercapture was swallowed externally.
        this.end(e);return;
      }
      e.preventDefault();e.stopImmediatePropagation();this.captureDragTarget(e,state);
    } else if(!this.body.grab&&e.pointerType==='mouse') {
      this.eventRay(e);
      // Hover is only a cursor hint. Pointer-down resolves the exact visible
      // triangle through the refittable BVH, not a 144k-triangle linear scan.
      this.canvas.style.cursor=this.mesh.geometry.boundingBox&&this.raycaster.ray.intersectsBox(this.mesh.geometry.boundingBox)?'grab':'default';
    }
  };
  private end=(e:PointerEvent)=>{
    const state=this.grabs.get(e.pointerId);
    if(!state||state.releasePending)return;
    // pointerup itself may be the only event carrying an abrupt drag endpoint.
    if(e.type==='pointerup')this.captureDragTarget(e,state);
    e.preventDefault();e.stopImmediatePropagation();
    // Mark released before releasing capture, which may itself dispatch an event.
    state.releasePending=true;
    state.releaseStepsRemaining=state.physicsSteps===0?2:1;
    if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
    this.syncGrabControls();
    // Retain each released grip until physics consumes its final target sample.
  };
  private syncGrabControls() {
    this.controls.enabled=this.body.grabs.length===0;
    this.canvas.classList.toggle('grabbing',[...this.grabs.values()].some(state=>!state.releasePending));
  }
  private finishRelease=(id?:number)=>{
    const ids=id===undefined?[...this.grabs.keys()]:[id];
    for(const pointerId of ids) {
      const state=this.grabs.get(pointerId);if(!state)continue;
      this.grabs.delete(pointerId);
      const index=this.body.grabs.indexOf(state.grab);
      if(index!==-1)this.body.grabs.splice(index,1);
      if(this.canvas.hasPointerCapture(pointerId))this.canvas.releasePointerCapture(pointerId);
    }
    if(id===undefined)this.body.grab=null;
    this.body.wake();this.syncGrabControls();
  };
  private keyDown=(e:KeyboardEvent)=>{
    if(this.menuOpen())return;
    if((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]'))return;
    if(e.code==='Space'&&!this.soccerOnField()&&(e.target as HTMLElement)?.closest('button'))return;
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space'].includes(e.code)) {
      e.preventDefault();this.keys.add(e.code);void this.sound.unlock().catch(()=>{});
    }
    if(e.code==='Space'&&!e.repeat){if(this.soccerOnField())this.shoot();else if(!this.bodyControlled())this.rig.jump();}
    if(e.code==='Escape')this.finishRelease();
  };
  clear=()=>{
    this.keys.clear();this.touchKeys.clear();
    if(this.joystickPointer!==null) {
      const id=this.joystickPointer,joystick=this.joystickElement;
      this.joystickPointer=null;this.joystickX=0;this.joystickZ=0;
      this.joystickKnob?.style.setProperty('--joystick-x','0px');
      this.joystickKnob?.style.setProperty('--joystick-y','0px');joystick?.classList.remove('held');
      if(joystick?.hasPointerCapture(id))joystick.releasePointerCapture(id);
    }
    this.finishRelease();this.rig.move.set(0,0,0);
    document.querySelectorAll('.held').forEach(el=>el.classList.remove('held'));
  };
  private pressed(...codes:string[]) {
    for(const code of codes) {
      if(this.keys.has(code))return true;
      for(const touchCode of this.touchKeys.values())if(touchCode===code)return true;
    }
    return false;
  }
  step(h:number) {
    if(this.menuOpen()){this.rig.move.set(0,0,0);return;}
    let x=Number(this.pressed('KeyD','ArrowRight'))-Number(this.pressed('KeyA','ArrowLeft'))+this.joystickX;
    let z=Number(this.pressed('KeyW','ArrowUp'))-Number(this.pressed('KeyS','ArrowDown'))+this.joystickZ;
    const inputLength=Math.hypot(x,z);
    if(inputLength>1){x/=inputLength;z/=inputLength;}
    this.vehicleInput?.(z,-x);
    if(this.bodyControlled()){this.rig.move.set(0,0,0);return;}
    if(x||z) {
      this.camera.getWorldDirection(this.temp);this.temp.y=0;this.temp.normalize();
      this.rig.move.set(-this.temp.z*x+this.temp.x*z,0,this.temp.x*x+this.temp.z*z);
      if(this.rig.move.lengthSq()>1)this.rig.move.normalize();
    } else this.rig.move.set(0,0,0);
    for(const state of this.grabs.values()) {
      const grab=state.grab;
      advanceGrabTarget(grab.target,state.rawTarget,h,grab.point);
      state.consumedVersion=state.commandVersion;state.physicsSteps++;
    }
  }
  /** Called immediately after body.step() for the same fixed substep. */
  afterPhysicsStep() {
    for(const [id,state] of this.grabs) {
      if(state.releasePending&&state.consumedVersion===state.commandVersion) {
        state.releaseStepsRemaining--;
        if(state.releaseStepsRemaining<=0)this.finishRelease(id);
      }
    }
  }
  update(dt:number) {
    const soccer=this.soccerOnField();
    this.soccerCamera.setFieldState(this.camera,soccer);
    this.controls.maxPolarAngle=this.soccerCamera.needsWidePolarLimit?1.46:Math.PI/2-THREE.MathUtils.degToRad(this.camera.fov)/2-.10;
    this.controls.maxDistance=.42;
    const riding=this.ridingVehicle();
    if(riding!==this.vehicleHints) {
      this.vehicleHints=riding;
      const hint=document.querySelector('.desktop-hints .hint-label');if(hint)hint.textContent=riding?'pedal · steer':'wander';
      this.joystickElement?.setAttribute('aria-label',riding?'Steer and pedal':'Move');
      const jump=document.querySelector<HTMLButtonElement>('.touch-controls .jump');if(jump){jump.disabled=riding;jump.style.opacity=riding?'.3':'';}
    }
    const jump=document.querySelector<HTMLButtonElement>('.touch-controls .jump');if(jump){jump.disabled=riding&&!soccer;jump.style.opacity=riding&&!soccer?'.3':'';jump.setAttribute('aria-label',soccer?'Shoot':'Jump');const caption=jump.querySelector('span');if(caption)caption.textContent=soccer?'shoot':'hop';}
    const labels=document.querySelectorAll('.desktop-hints .hint-label');if(labels[0])labels[0].textContent=soccer?'run':riding?'pedal · steer':'wander';if(labels[1])labels[1].textContent=soccer?'shoot':'hop';
    this.controls.minDistance=this.facilityCameraDistance()??.135;
    // External resets must never leave pointer capture or orbit state wedged.
    for(const [id,state] of this.grabs)if(!this.body.grabs.includes(state.grab))this.finishRelease(id);
    if(this.body.grab)return; // Freeze both orbit and translation for the entire grab.
    const target=this.temp.copy(this.body.center);target.y=Math.max(.025,target.y);
    this.follow.lerp(target,1-Math.exp(-4.5*dt));
    this.temp.copy(this.follow).sub(this.controls.target);
    this.camera.position.add(this.temp);this.controls.target.copy(this.follow);
    this.controls.update();
    this.chase.update(this.camera,this.ridingVehicle()?this.vehicleHeading():undefined,dt);
    this.soccerCamera.update(this.camera,dt);
  }
  recenter() {this.clear();this.rig.reset();}
  teleport() {
    this.recenter();this.temp.copy(this.body.center).sub(this.controls.target);
    this.camera.position.add(this.temp);this.controls.target.copy(this.body.center);this.follow.copy(this.body.center);this.controls.update();
  }
  dispose() {this.clear();this.abort.abort();this.chase.dispose();this.soccerCamera.dispose();this.controls.dispose();}
}
