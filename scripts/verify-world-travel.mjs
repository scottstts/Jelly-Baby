import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera } from 'three/webgpu';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { Facilities } from '../src/game/facilities.ts';
import { WorldTravel } from '../src/game/world-travel.ts';
import { HOME_PORTAL } from '../src/graphics/jelly-portal.ts';
import { PORTAL_ARRIVAL_DISTANCE, TRACK_PORTAL, cameraFacingYaw, portalArrivalZ } from '../src/game/toy-world-layout.ts';

assert.equal(portalArrivalZ(.6,.5,.8),.6+PORTAL_ARRIVAL_DISTANCE,'arrival follows a camera on the positive portal side');
assert.equal(portalArrivalZ(.6,.7,.4),.6-PORTAL_ARRIVAL_DISTANCE,'arrival follows a camera on the negative portal side');
assert(Math.abs(cameraFacingYaw(0,0,.12,.25)-Math.atan2(.12,.25))<1e-12,'portal arrival yaw faces the orbit camera');

const element=()=>({hidden:false,className:'',textContent:'',append(){},remove(){},setAttribute(){},addEventListener(){},classList:{add(){},remove(){}}});
const app=element(),loading=element();
globalThis.document={createElement:element,querySelector:selector=>selector==='#loading'?loading:app};
globalThis.window={addEventListener(){}};
globalThis.requestAnimationFrame=callback=>globalThis.queueMicrotask(callback);
let compiles=0,renders=0,ready=0,moves=0,failure;
const renderer={compileAsync:async()=>{compiles++;},render(){renders++;},backend:{device:{queue:{onSubmittedWorkDone:async()=>{}}}}};
const body=new SoftBody(loadModel()),home=new Facilities(body),scene=new Scene();
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
place(HOME_PORTAL.x+.10,HOME_PORTAL.z-.01);worlds.step(.01);
assert.equal(moves,0,'passing outside the opening does not teleport');
place(HOME_PORTAL.x,HOME_PORTAL.z-.01);worlds.step(.01);
place(HOME_PORTAL.x,HOME_PORTAL.z+.01);worlds.step(.01);await waitForTravel();
assert(worlds.inToys&&worlds.toys.visible&&!worlds.home.visible);
assert(!home.enabled&&worlds.toyFacilities.enabled);
assert(Math.abs(body.center.x-TRACK_PORTAL.x)<1e-8);
assert(Math.abs(body.center.z-(TRACK_PORTAL.z+PORTAL_ARRIVAL_DISTANCE))<1e-8);
assert((body.center.z-TRACK_PORTAL.z)*(camera.position.z-TRACK_PORTAL.z)>0,'baby arrives on the same portal side as the camera');
const cameraDirection=camera.position.clone().sub(body.center).setY(0).normalize();
assert(Math.abs(Math.sin(worlds.arrivalYaw)-cameraDirection.x)<1e-10&&Math.abs(Math.cos(worlds.arrivalYaw)-cameraDirection.z)<1e-10,'baby faces the camera immediately after portal travel');
const c=Math.cos(worlds.arrivalYaw),s=Math.sin(worlds.arrivalYaw),node=facingNode*3;
assert(Math.abs((body.x[node]-body.center.x)-(restDx*c+restDz*s))<1e-8&&Math.abs((body.x[node+2]-body.center.z)-(restDz*c-restDx*s))<1e-8,'teleported soft body is physically rotated to the camera-facing yaw');
const bike=worlds.tricycle;assert(bike);
place(TRACK_PORTAL.x,TRACK_PORTAL.z+.01);worlds.step(.01);assert.equal(moves,1,'arrival cooldown prevents bounce-back');
place(TRACK_PORTAL.x,TRACK_PORTAL.z-.01);worlds.step(1.1);await waitForTravel();
assert(!worlds.inToys&&home.enabled&&!worlds.toyFacilities.enabled);
assert.equal(compiles,2);assert.equal(renders,2);assert.equal(ready,2);
place(HOME_PORTAL.x,HOME_PORTAL.z-.01);worlds.step(1.1);await waitForTravel();
assert(worlds.inToys);assert.equal(worlds.tricycle,bike,'later visits reuse geometry');
bike.physics.speed=.2;worlds.reset();assert.equal(bike.physics.speed,0);assert(worlds.inToys,'reset stays in selected world');
worlds.dispose();home.dispose();assert.equal(scene.children.length,0);
console.log('Portal aperture, camera-side arrival and facing, loading, round trip, ownership, arrival cooldown, reuse, reset and disposal passed.');
