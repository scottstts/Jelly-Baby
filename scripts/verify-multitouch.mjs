import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3, Mesh } from 'three/webgpu';
import { Input } from '../src/game/input.ts';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { Locomotion } from '../src/game/locomotion.ts';
import { loadModel } from './load-model.mjs';

// Exercise the actual input handlers without starting a renderer or dev server.
const document=new globalThis.EventTarget();
document.querySelector=()=>null;document.querySelectorAll=()=>[];
globalThis.document=document;globalThis.window=new globalThis.EventTarget();
function setup(useJS=false) {
  const body=new SoftBody(loadModel());assert(body.kernel,'accelerated solver is available');
  if(useJS)body.kernel=null;
  const canvas=new globalThis.EventTarget(),captured=new Set(),classes=new Set();
  canvas.style={};canvas.ownerDocument=document;canvas.getRootNode=()=>document;
  canvas.getBoundingClientRect=()=>({left:0,top:0,width:400,height:600});
  canvas.classList={add:name=>classes.add(name),remove:name=>classes.delete(name),toggle:(name,on)=>on?classes.add(name):classes.delete(name)};
  canvas.setPointerCapture=id=>captured.add(id);canvas.hasPointerCapture=id=>captured.has(id);
  canvas.releasePointerCapture=id=>{
    captured.delete(id);
    // Synchronous lost capture also checks release-handler reentrancy.
    input.end(event(id,'lostpointercapture'));
  };
  const camera=new PerspectiveCamera(40,400/600,.001,10);camera.position.set(0,.12,.22);
  const input=new Input(camera,canvas,body,new Mesh(body.surface.geometry),new Locomotion(body),{unlock:async()=>{}});
  const event=(id,type='pointerdown',dx=0,dy=0,pointerType='touch')=>{
    const point=new Vector3(id===1?-.009:.009,.045,0).project(camera);
    return {pointerId:id,pointerType,button:0,buttons:1,type,
      clientX:(point.x+1)*200+dx,clientY:(1-point.y)*300+dy,
      preventDefault(){},stopImmediatePropagation(){}};
  };
  const step=()=>{input.step(PHYS.step);body.step(PHYS.step);input.afterPhysicsStep();};
  return {input,body,camera,captured,event,step};
}

const results=[];
for(const useJS of [false,true]) {
  const {input,body,camera,captured,event,step}=setup(useJS);
  input.begin(event(1));input.begin(event(2));
  assert.equal(body.grabs.length,2,'two fingers bind separate surface grips');
  assert.equal(captured.size,2);assert.equal(input.controls.enabled,false);
  const [left,right]=body.grabs,initialSeparation=left.point.distanceTo(right.point);
  const cameraStart=camera.position.clone(),rightTarget=right.target.clone();
  input.pointerMove(event(1,'pointermove',-55,-25));
  step();assert(right.target.distanceTo(rightTarget)<1e-12,'moving one finger does not change the other target');
  input.pointerMove(event(2,'pointermove',55,-25));
  for(let i=0;i<60;i++){step();input.update(PHYS.step);}
  assert(left.point.distanceTo(right.point)>initialSeparation*1.2,`opposing grips stretch the body: ${initialSeparation} -> ${left.point.distanceTo(right.point)}, targets ${left.target.distanceTo(right.target)}, JS=${useJS}`);
  assert.deepEqual(camera.position,cameraStart,'camera stays frozen during stretching');
  assert(body.isFinite());assert(body.minimumJacobian()>=.12,'stretch preserves element orientation');
  results.push(body.x.slice());
  input.end(event(1,'pointerup',-60,-25));
  assert.equal(body.grabs.length,2,'release endpoint remains until physics consumes it');
  step();assert.deepEqual(body.grabs,[right],'lifting one finger keeps the other grip');
  assert.equal(input.controls.enabled,false);assert.equal(captured.size,1);
  input.pointerMove(event(2,'pointermove',65,-40));step();
  input.end(event(2,'pointercancel'));step();
  assert.equal(body.grabs.length,0);assert.equal(input.controls.enabled,true);assert.equal(captured.size,0);
  input.dispose();
}
let maxDifference=0;
for(let i=0;i<results[0].length;i++)maxDifference=Math.max(maxDifference,Math.abs(results[0][i]-results[1][i]));
assert(maxDifference<.00002,`native and JS multitouch solvers agree: ${maxDifference}`);

for(const cleanup of ['blur','visibility','reset','escape','dispose','lostcapture','quickrelease']) {
  const {input,body,captured,event,step}=setup();
  input.begin(event(1));input.begin(event(2));
  if(cleanup==='quickrelease') {
    input.end(event(1,'pointerup',-50,-25));input.end(event(2,'pointerup',50,-25));
    step();assert.equal(body.grabs.length,2,'zero-step flicks receive two physics samples');
    step();assert(body.energy()>0,'quick flick transfers momentum');
  } else if(cleanup==='lostcapture') {
    input.end(event(1,'lostpointercapture'));step();step();
    assert.equal(body.grabs.length,1,'lost capture releases only the affected finger');
    input.clear();
  } else if(cleanup==='blur')globalThis.window.dispatchEvent(new globalThis.Event('blur'));
  else if(cleanup==='visibility') {
    document.hidden=true;document.dispatchEvent(new globalThis.Event('visibilitychange'));document.hidden=false;
  } else if(cleanup==='reset'){body.reset();input.update(PHYS.step);}
  else if(cleanup==='escape')input.keyDown({code:'Escape'});
  else input.dispose();
  assert.equal(body.grabs.length,0,`${cleanup} clears grabs`);
  assert.equal(captured.size,0,`${cleanup} releases captures`);
  assert.equal(input.controls.enabled,true,`${cleanup} restores orbit`);
  input.dispose();
}
{
  const {input,body,event,step}=setup();
  input.begin(event(1));input.begin(event(2));input.begin(event(3));
  assert.equal(body.grabs.length,3,'multitouch is not limited to two fingers');
  input.end(event(2,'pointerup'));step();step();
  assert.equal(body.grabs.length,2,'removing a middle grip preserves the remaining grips');
  input.dispose();
}
{
  const {input,body,event,step}=setup();
  input.begin(event(1,'pointerdown',0,0,'mouse'));
  input.begin(event(2));assert.equal(body.grabs.length,1,'mouse remains single-grip');
  input.pointerMove({...event(1,'pointermove',0,0,'mouse'),buttons:0});step();step();
  assert.equal(body.grabs.length,0,'missing mouse-up recovery is preserved');
  input.dispose();
}
console.log('Multitouch input, independent release, cleanup, and native/JS physics passed.',{maxDifference});
