import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3, Mesh } from 'three/webgpu';
import { Input } from '../src/app/input.ts';
import { FixedStepper } from '../src/app/fixed-step.ts';
import { Locomotion } from '../src/app/locomotion.ts';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { FacilityCollision } from '../src/facilities/collision.ts';
import { deformSurface } from '../src/physics/deform-surface.js';
import { loadModel } from './load-model.mjs';

// Real input -> fixed-step cadence -> locomotion/physics -> release -> surface.
// Updating a raw target every solver substep misses the held/coalesced commands
// that caused the mobile collapse, so commands arrive only once per frame here.
const document=new globalThis.EventTarget();document.querySelector=()=>null;document.querySelectorAll=()=>[];
globalThis.document=document;globalThis.window=new globalThis.EventTarget();
const referenceSurface=loadModel().surface;
for(const {name,hz,grips,hold,useJS} of [
  {name:'three-finger shake at 30 Hz',hz:30,grips:3,hold:10},
  {name:'two-finger shake through 50 ms hitches',hz:20,grips:2,hold:4},
  {name:'three-finger shake at 60 Hz',hz:60,grips:3,hold:4},
  {name:'JavaScript fallback',hz:30,grips:3,hold:2.5,useJS:true},
]) {
  const body=new SoftBody(loadModel());assert(body.kernel);if(useJS)body.kernel=null;
  const rig=new Locomotion(body),clock=new FixedStepper(PHYS.step);
  for(let i=0;i<80;i++){rig.step(PHYS.step);body.step(PHYS.step);}body.updateSurface();
  const canvas=new globalThis.EventTarget(),captured=new Set();
  canvas.style={};canvas.ownerDocument=document;canvas.getRootNode=()=>document;
  canvas.getBoundingClientRect=()=>({left:0,top:0,width:400,height:600});
  canvas.classList={add(){},remove(){},toggle(){}};
  canvas.setPointerCapture=id=>captured.add(id);canvas.hasPointerCapture=id=>captured.has(id);
  canvas.releasePointerCapture=id=>captured.delete(id);
  const camera=new PerspectiveCamera(40,400/600,.001,10);camera.position.set(0,.12,.22);
  const input=new Input(camera,canvas,body,new Mesh(body.surface.geometry),rig,{unlock:async()=>{}});
  try {
    const starts=Array.from({length:grips},(_,k)=>{
      const point=new Vector3(k===0?-.009:k===1?.009:0,k===2?.061:.045,0).project(camera);
      return {pointerId:k+1,pointerType:'touch',button:0,buttons:1,type:'pointerdown',
        clientX:(point.x+1)*200,clientY:(1-point.y)*300,preventDefault(){},stopImmediatePropagation(){}};
    });
    for(const e of starts)input.begin(e);assert.equal(body.grabs.length,grips);
    const previous=body.x.slice(),cameraStart=camera.position.clone(),frameTimes=[];
    let minimumVolume=Infinity,maximumVolume=0,frozenFrames=0,maximumFrozen=0;
    for(let frame=0;frame<(hold+4)*hz;frame++) {
      const t=frame/hz;
      if(frame<hold*hz)for(let k=0;k<grips;k++)input.pointerMove({...starts[k],type:'pointermove',
        clientX:starts[k].clientX+190*Math.sin(t*39+k*2.1),clientY:starts[k].clientY-60+210*Math.sin(t*31+k*2.1)});
      if(frame===hold*hz)for(const e of starts)input.end({...e,type:'pointerup'});
      const start=performance.now();
      const steps=clock.advance(1/hz,()=>{
        input.step(PHYS.step);rig.step(PHYS.step);body.step(PHYS.step);rig.afterStep();input.afterPhysicsStep();
        assert(body.isFinite(),`${name}: finite positions and velocities`);
        assert(body.lastMinJacobian>=.12,`${name}: never accept an inverted step`);
        assert.equal(body.stepFraction,1,`${name}: consume each full timestep`);
      });
      if(frame<hold*hz)frameTimes.push(performance.now()-start);
      assert.equal(steps,240/hz);
      if(body.surfaceDirty)body.updateSurface();input.update(1/hz);
      const volume=body.volumeRatio();minimumVolume=Math.min(minimumVolume,volume);maximumVolume=Math.max(maximumVolume,volume);
      assert(volume>.7&&volume<1.3,`${name}: retain the jelly's physical volume`);
      if(frame<hold*hz) {
        let delta=0;for(let i=0;i<body.x.length;i++)delta=Math.max(delta,Math.abs(body.x[i]-previous[i]));
        frozenFrames=delta<1e-7?frozenFrames+1:0;maximumFrozen=Math.max(maximumFrozen,frozenFrames);
        assert.deepEqual(camera.position,cameraStart,`${name}: grabbing still freezes the camera`);
      }
      previous.set(body.x);
      if(frame===Math.floor(hold*hz/2)) {
        deformSurface(referenceSurface,body.x,body.nodalF,body.center);
        assert.deepEqual(body.surface.positions,referenceSurface.positions,`${name}: unchanged full-resolution embedding`);
        assert.deepEqual(body.surface.geometry.attributes.normal.array,referenceSurface.geometry.attributes.normal.array,`${name}: unchanged normals`);
      }
    }
    assert(body.guardedSteps>0,`${name}: exercise the bounded recovery path`);
    assert(maximumFrozen<3,`${name}: hard commands continue moving the body`);
    assert.equal(body.grabs.length,0);assert.equal(captured.size,0);assert(input.controls.enabled);
    assert(body.volumeRatio()>.9&&body.volumeRatio()<1.1,`${name}: recover original volume after release`);
    assert(body.surface.geometry.boundingBox.max.y-body.surface.geometry.boundingBox.min.y>.055,`${name}: recover body height`);
    assert(body.sleeping&&body.energy()===0,`${name}: released body settles instead of staying trapped in repair`);
    const resting=body.x.slice();for(let i=0;i<20;i++){rig.step(PHYS.step);body.step(PHYS.step);}
    assert.deepEqual(body.x,resting,`${name}: genuine sleep holds the recovered pose exactly`);
    console.log('PASS',name,{minimumVolume,maximumVolume,guardedSteps:body.guardedSteps,
      physicsFrameMs:{mean:frameTimes.reduce((a,b)=>a+b,0)/frameTimes.length,p95:[...frameTimes].sort((a,b)=>a-b)[Math.floor(frameTimes.length*.95)],max:Math.max(...frameTimes)}});
  } finally {input.dispose();body.surface.geometry.dispose();}
}

// Facility projections run after body.step(). A contact must not publish an
// inverted cage or overwrite the solver's valid recovery reference.
for(const useJS of [false,true]) {
  const body=new SoftBody(loadModel());if(useJS)body.kernel=null;
  body.step(PHYS.step);
  const collision=new FacilityCollision(body);
  assert(collision.resolveBoxes([{center:{x:0,y:.04,z:0},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},zAxis:{x:0,y:0,z:1},halfSize:{x:.012,y:.025,z:.012}}]));
  assert(body.minimumJacobian()>=.12,'facility contact output is admissible before rendering');
  body.previous.fill(.04);body.x.fill(.04);body.stabilizeContacts();
  assert(body.minimumJacobian()>=.12,'an invalid external edit cannot replace the saved valid state');
  body.reset();body.step(PHYS.step);assert(body.minimumJacobian()>=.12);
}
console.log('PASS — post-solver contacts, invalid-reference protection and reset for WASM and JavaScript.');
