import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera } from 'three/webgpu';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { Facilities } from '../src/facilities/manager.ts';
import { WorldTravel } from '../src/worlds/travel.ts';
import { HOME_PORTAL } from '../src/worlds/main/layout.ts';
import { PORTAL_ARRIVAL_DISTANCE, TRACK_PORTAL, cameraFacingYaw, portalArrivalZ } from '../src/worlds/toy-track/portal-layout.ts';
import { FIELD, SOCCER_PORTAL } from '../src/worlds/soccer/layout.ts';

assert.equal(portalArrivalZ(.6,.5,.8),.6+PORTAL_ARRIVAL_DISTANCE,'arrival follows a camera on the positive portal side');
assert.equal(portalArrivalZ(.6,.7,.4),.6-PORTAL_ARRIVAL_DISTANCE,'arrival follows a camera on the negative portal side');
assert(Math.abs(cameraFacingYaw(0,0,.12,.25)-Math.atan2(.12,.25))<1e-12,'portal arrival yaw faces the orbit camera');

const elements=[];
const element=()=>{const listeners={};const value={hidden:false,className:'',textContent:'',children:[],append(...nodes){this.children.push(...nodes);},remove(){},setAttribute(){},addEventListener(name,fn){listeners[name]=fn;},click(){listeners.click?.();},focus(){globalThis.document.activeElement=this;},showModal(){this.open=true;},close(){this.open=false;},classList:{add(){},remove(){}}};elements.push(value);return value;};
const app=element(),loading=element();
globalThis.document={createElement:element,querySelector:selector=>selector==='#loading'?loading:app};
globalThis.window={addEventListener(){}};
globalThis.requestAnimationFrame=callback=>globalThis.queueMicrotask(callback);
let compiles=0,renders=0,ready=0,moves=0,failure;
const renderer={compileAsync:async()=>{compiles++;},render(){renders++;},backend:{device:{queue:{onSubmittedWorkDone:async()=>{}}}}};
const body=new SoftBody(loadModel()),home=new Facilities(body),scene=new Scene();
let persistentResets=0,ordinaryResets=0;
const dummy=(id,persistent=false)=>({id,label:id,active:false,interactionDistance:Infinity,persistAcrossTravel:persistent,interact(){return false;},step(){},update(){},reset(){if(persistent)persistentResets++;else ordinaryResets++;},dispose(){}});
home.add(dummy('ordinary'));home.add(dummy('persistent',true));
let restX=0,restZ=0;for(let i=0;i<body.mass.length;i++){const w=body.mass[i]/body.totalMass;restX+=body.rest[i*3]*w;restZ+=body.rest[i*3+2]*w;}
let facingNode=0,facingRadius=-1;for(let i=0;i<body.mass.length;i++){const dx=body.rest[i*3]-restX,dz=body.rest[i*3+2]-restZ,r=dx*dx+dz*dz;if(r>facingRadius){facingRadius=r;facingNode=i;}}
const restDx=body.rest[facingNode*3]-restX,restDz=body.rest[facingNode*3+2]-restZ;
const camera=new PerspectiveCamera();camera.position.set(body.center.x+.12,body.center.y+.10,body.center.z+.25);
const worlds=new WorldTravel(scene,body,{add(){},update(){return 0;},surfaces:{update(){}}},home,renderer,camera,()=>{},error=>{failure=error;});
const cameraOffset=camera.position.clone().sub(body.center);
worlds.onMove=()=>{moves++;cameraOffset.copy(camera.position).sub(body.center);};
worlds.onReady=()=>{ready++;camera.position.copy(body.center).add(cameraOffset);};
function place(x,z){const dx=x-body.center.x,dz=z-body.center.z;for(let j=0;j<body.x.length;j+=3){body.x[j]+=dx;body.x[j+2]+=dz;}body.updateCenter();}
async function waitForTravel(){for(let i=0;i<200&&worlds.loading;i++)await new Promise(resolve=>globalThis.setTimeout(resolve,5));if(failure)throw failure;assert(!worlds.loading,'transition completes');}
place(HOME_PORTAL.x,HOME_PORTAL.z+.01);worlds.step(1.1);
assert.equal(worlds.portalFacility.action,'Use Portal');
assert.equal(worlds.portalFacility.mobileAction,'Use Portal');
worlds.facilities.update();
assert.equal(elements.find(item=>item.className==='facility-hint')?.textContent,'Press E to Use Portal');
assert.equal(elements.find(item=>item.className==='facility-button')?.textContent,'Use Portal');
place(HOME_PORTAL.x+.10,HOME_PORTAL.z-.01);worlds.step(.01);
assert.equal(moves,0,'walking past the portal does not teleport');
place(HOME_PORTAL.x,HOME_PORTAL.z+.01);assert(Number.isFinite(worlds.portalFacility.interactionDistance),'portal becomes the nearby facility candidate');
assert(worlds.portalFacility.interact(),'portal interaction opens destinations');assert(worlds.menu.opened&&!worlds.loading&&!worlds.inToys);elements.find(e=>e.textContent==='Play Tricycle').click();await waitForTravel();
assert(worlds.inToys&&worlds.toys.visible&&!worlds.home.visible);
assert.equal(ordinaryResets,1,'ordinary home facilities reset when leaving through the portal');
assert.equal(persistentResets,0,'portal-persistent equipment is not reset when leaving its home world');
assert(!home.enabled&&worlds.toyFacilities.enabled);
assert(Math.abs(body.center.x-TRACK_PORTAL.x)<1e-8);
assert(Math.abs(body.center.z-(TRACK_PORTAL.z+PORTAL_ARRIVAL_DISTANCE))<1e-8);
assert((body.center.z-TRACK_PORTAL.z)*(camera.position.z-TRACK_PORTAL.z)>0,'baby arrives on the same portal side as the camera');
const cameraDirection=camera.position.clone().sub(body.center).setY(0).normalize();
assert(Math.abs(Math.sin(worlds.arrivalYaw)-cameraDirection.x)<1e-10&&Math.abs(Math.cos(worlds.arrivalYaw)-cameraDirection.z)<1e-10,'baby faces the camera immediately after portal travel');
const c=Math.cos(worlds.arrivalYaw),s=Math.sin(worlds.arrivalYaw),node=facingNode*3;
assert(Math.abs((body.x[node]-body.center.x)-(restDx*c+restDz*s))<1e-8&&Math.abs((body.x[node+2]-body.center.z)-(restDz*c-restDx*s))<1e-8,'teleported soft body is physically rotated to the camera-facing yaw');
const bike=worlds.tricycle;assert(bike);
place(TRACK_PORTAL.x,TRACK_PORTAL.z+.01);worlds.step(.01);assert.equal(moves,1,'arrival cooldown prevents bounce-back');assert.equal(worlds.portalFacility.interactionDistance,Infinity,'arrival cooldown hides the portal affordance');
worlds.step(1.1);assert(Number.isFinite(worlds.portalFacility.interactionDistance));assert(worlds.portalFacility.interact(),'return portal opens destinations');elements.find(e=>e.textContent==='Home').click();await waitForTravel();
assert(!worlds.inToys&&home.enabled&&!worlds.toyFacilities.enabled);
assert.equal(compiles,1,'the already-warmed home scene does not recompile on return');assert.equal(renders,2);assert.equal(ready,2);
place(HOME_PORTAL.x,HOME_PORTAL.z-.01);worlds.step(1.1);assert(worlds.portalFacility.interact(),'later portal visits reuse the facility');elements.find(e=>e.textContent==='Play Tricycle').click();await waitForTravel();
assert(worlds.inToys);assert.equal(worlds.tricycle,bike,'later visits reuse geometry');
bike.physics.speed=.2;worlds.reset();assert.equal(bike.physics.speed,0);assert(worlds.inToys,'reset stays in selected world');
place(TRACK_PORTAL.x,TRACK_PORTAL.z+.01);worlds.step(1.1);worlds.portalFacility.interact();elements.find(e=>e.textContent==='Play Soccer').click();await waitForTravel();
assert(worlds.inSoccer&&worlds.soccerWorld.visible&&!worlds.toys.visible&&!worlds.home.visible);assert.equal(worlds.facilities,worlds.soccerFacilities);
assert(Math.abs(body.center.x-SOCCER_PORTAL.x)<1e-8);assert((body.center.z-SOCCER_PORTAL.z)*(camera.position.z-SOCCER_PORTAL.z)>0);
const soccer=worlds.soccer;assert(soccer);
for(const detail of soccer.goalie.face.details.filter(d=>d.kind==='eye')) {
  const p=detail.mesh.geometry.attributes.position;let y=0,z=0;for(let i=0;i<p.count;i++){y+=p.getY(i)/p.count;z+=p.getZ(i)/p.count;}
  assert(y>FIELD.y+.040&&y<FIELD.y+.055&&z>-1.43&&z<-1.39,'goalie face binds locally and follows its on-foot placed head');
}
soccer.physics.score=3;worlds.reset();assert(worlds.inSoccer&&!soccer.active&&soccer.physics.score===0);
place(SOCCER_PORTAL.x,SOCCER_PORTAL.z+.01);worlds.step(1.1);worlds.portalFacility.interact();elements.find(e=>e.textContent==='Home').click();await waitForTravel();assert.equal(worlds.current,'home');
place(HOME_PORTAL.x,HOME_PORTAL.z+.01);worlds.step(1.1);worlds.portalFacility.interact();elements.find(e=>e.textContent==='Play Soccer').click();await waitForTravel();assert.equal(worlds.soccer,soccer,'soccer geometry reuses its first build');
assert.equal(compiles,2,'each lazy destination compiles exactly once');assert.equal(renders,6,'every transition still receives a hidden first render');assert.equal(ready,6);
worlds.dispose();home.dispose();assert.equal(scene.children.length,0);
console.log('Portal aperture, camera-side arrival and facing, persistent equipment, loading, round trip, ownership, arrival cooldown, reuse, reset and disposal passed.');
