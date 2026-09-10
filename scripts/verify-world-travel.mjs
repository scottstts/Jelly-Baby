import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera } from 'three/webgpu';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { Facilities } from '../src/game/facilities.ts';
import { WorldTravel } from '../src/game/world-travel.ts';
import { HOME_PORTAL, TRACK_PORTAL } from '../src/graphics/jelly-portal.ts';

const element=()=>({hidden:false,className:'',textContent:'',append(){},remove(){},setAttribute(){},addEventListener(){},classList:{add(){},remove(){}}});
const app=element(),loading=element();
globalThis.document={createElement:element,querySelector:selector=>selector==='#loading'?loading:app};
globalThis.window={addEventListener(){}};
globalThis.requestAnimationFrame=callback=>globalThis.queueMicrotask(callback);
let compiles=0,renders=0,ready=0,moves=0,failure;
const renderer={compileAsync:async()=>{compiles++;},render(){renders++;},backend:{device:{queue:{onSubmittedWorkDone:async()=>{}}}}};
const body=new SoftBody(loadModel()),home=new Facilities(body),scene=new Scene();
const worlds=new WorldTravel(scene,body,{add(){},update(){return 0;},surfaces:{update(){}}},home,renderer,new PerspectiveCamera(),()=>{},error=>{failure=error;});
worlds.onMove=()=>moves++;worlds.onReady=()=>ready++;
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
assert(Math.abs(body.center.z-(TRACK_PORTAL.z-.10))<1e-8);
const bike=worlds.tricycle;assert(bike);
place(TRACK_PORTAL.x,TRACK_PORTAL.z+.01);worlds.step(.01);assert.equal(moves,1,'arrival cooldown prevents bounce-back');
place(TRACK_PORTAL.x,TRACK_PORTAL.z-.01);worlds.step(1.1);await waitForTravel();
assert(!worlds.inToys&&home.enabled&&!worlds.toyFacilities.enabled);
assert.equal(compiles,2);assert.equal(renders,2);assert.equal(ready,2);
place(HOME_PORTAL.x,HOME_PORTAL.z-.01);worlds.step(1.1);await waitForTravel();
assert(worlds.inToys);assert.equal(worlds.tricycle,bike,'later visits reuse geometry');
bike.physics.speed=.2;worlds.reset();assert.equal(bike.physics.speed,0);assert(worlds.inToys,'reset stays in selected world');
worlds.dispose();home.dispose();assert.equal(scene.children.length,0);
console.log('Portal aperture, loading, round trip, ownership, arrival cooldown, reuse, reset and disposal passed.');
