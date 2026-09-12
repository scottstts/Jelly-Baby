import assert from 'node:assert/strict';
import { PerspectiveCamera, Spherical, Vector3 } from 'three/webgpu';
import { SoccerCameraPitch } from '../src/worlds/soccer/camera.ts';

class ControlsStub {
  target=new Vector3();
  listeners=new Map();
  addEventListener(kind,fn){let list=this.listeners.get(kind);if(!list){list=new Set();this.listeners.set(kind,list);}list.add(fn);}
  removeEventListener(kind,fn){this.listeners.get(kind)?.delete(fn);}
  dispatch(kind){for(const fn of this.listeners.get(kind)??[])fn();}
  update(){}
}

function polar(camera,controls) {
  return new Spherical().setFromVector3(camera.position.clone().sub(controls.target));
}
function settle(controller,camera,seconds=2) {
  for(let i=0;i<Math.ceil(seconds*60);i++)controller.update(camera,1/60);
}

const camera=new PerspectiveCamera(45,1,0.01,10),controls=new ControlsStub(),controller=new SoccerCameraPitch(controls);
const start=new Spherical(.40,1.02,.67);camera.position.setFromSpherical(start);
controller.setFieldState(camera,true);settle(controller,camera);
let current=polar(camera,controls);
assert(Math.abs(current.phi-1.46)<.002,'field entry eases to the preserved soccer grazing angle');
assert(Math.abs(current.theta-start.theta)<1e-9,'soccer camera never chases player heading');
assert(Math.abs(current.radius-start.radius)<1e-9,'soccer camera does not change orbit distance');
controller.setFieldState(camera,false);settle(controller,camera);
current=polar(camera,controls);assert(Math.abs(current.phi-start.phi)<.002,'field exit eases back to the captured normal pitch');

controls.dispatch('start');controller.setFieldState(camera,true);const manual=polar(camera,controls);controls.dispatch('end');settle(controller,camera);
current=polar(camera,controls);
assert(Math.abs(current.phi-manual.phi)<1e-9&&Math.abs(current.theta-manual.theta)<1e-9,'a field transition crossed during a manual drag never snaps after release');
controller.dispose();
console.log('Soccer camera preserves the grazing angle while removing heading chase, zoom changes and drag-release snapback.');
