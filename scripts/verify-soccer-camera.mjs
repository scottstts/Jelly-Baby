import assert from 'node:assert/strict';
import { PerspectiveCamera, Spherical, Vector3 } from 'three/webgpu';
import { SoccerCameraPitch } from '../src/worlds/soccer/camera.ts';
import { soccerBox } from '../src/worlds/soccer/layout.ts';

class ControlsStub {
  target=new Vector3();
  maxDistance=.42;
  minDistance=.135;
  listeners=new Map();
  addEventListener(kind,fn){let list=this.listeners.get(kind);if(!list){list=new Set();this.listeners.set(kind,list);}list.add(fn);}
  removeEventListener(kind,fn){this.listeners.get(kind)?.delete(fn);}
  dispatch(kind){for(const fn of this.listeners.get(kind)??[])fn();}
  update(){}
}

function polar(camera,controls) {
  return new Spherical().setFromVector3(camera.position.clone().sub(controls.target));
}
function settle(controller,camera,seconds=2,obstacles=[]) {
  for(let i=0;i<Math.ceil(seconds*60);i++)controller.update(camera,1/60,obstacles);
}

const camera=new PerspectiveCamera(45,1,0.01,10),controls=new ControlsStub(),controller=new SoccerCameraPitch(controls);
const start=new Spherical(.24,1.02,.67);camera.position.setFromSpherical(start);
controller.setFieldState(camera,true);controller.update(camera,1/60);
let easing=polar(camera,controls);
assert(easing.phi>start.phi&&easing.phi<1.46,'field entry eases the grazing angle instead of snapping');
assert(easing.radius>start.radius&&easing.radius<controls.maxDistance,'field entry eases the zoom-out with the angle');
settle(controller,camera);
let current=polar(camera,controls);
assert(Math.abs(current.phi-1.46)<.002,'field entry eases to the preserved soccer grazing angle');
assert(Math.abs(current.theta-start.theta)<1e-9,'soccer camera never chases player heading');
assert(Math.abs(current.radius-controls.maxDistance)<.0005,'field entry eases to the maximum orbit distance');
controller.setFieldState(camera,false);settle(controller,camera);
current=polar(camera,controls);assert(Math.abs(current.phi-start.phi)<.002,'field exit eases back to the captured normal pitch');
assert(Math.abs(current.radius-start.radius)<.0005,'field exit eases back to the captured normal distance');

controls.dispatch('start');controller.setFieldState(camera,true);const manual=polar(camera,controls);controls.dispatch('end');settle(controller,camera);
current=polar(camera,controls);
assert(Math.abs(current.phi-manual.phi)<1e-9&&Math.abs(current.theta-manual.theta)<1e-9,'a field transition crossed during a manual drag never snaps after release');
controller.dispose();

const obstacleCamera=new PerspectiveCamera(45,1,.01,10),obstacleControls=new ControlsStub(),obstacleController=new SoccerCameraPitch(obstacleControls);
obstacleCamera.position.setFromSpherical(new Spherical(.24,1.46,0));
const wall=soccerBox(0,.05,.20,.30,.12,.02);
obstacleController.setFieldState(obstacleCamera,true);settle(obstacleController,obstacleCamera,2,[wall]);
let blocked=polar(obstacleCamera,obstacleControls);
assert(blocked.radius<.19,'a field wall pulls the camera in front of the jelly');
wall.center.z=1;settle(obstacleController,obstacleCamera,2,[wall]);
blocked=polar(obstacleCamera,obstacleControls);
assert(Math.abs(blocked.radius-obstacleControls.maxDistance)<.0005,'the camera restores its default field distance after the wall clears');
obstacleController.dispose();
console.log('Soccer camera eases to the grazing angle and maximum distance, preserves heading and drag-release behavior, and clears field-wall occlusion.');
