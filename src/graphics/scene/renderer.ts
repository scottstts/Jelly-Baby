import * as THREE from 'three/webgpu';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export async function createRenderer(fail:(e:unknown)=>void) {
  if(!window.isSecureContext)throw new Error('Please open this game over HTTPS or localhost.');
  if(!navigator.gpu)throw new Error('This browser does not support WebGPU. Open in a WebGPU-capable browser.');
  const renderer=new THREE.WebGPURenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  // r185 normally installs a WebGL fallback factory. Reject before it is invoked.
  (renderer as unknown as {_getFallback:null})._getFallback=null;
  let fatal:Error|null=null;
  const lost=renderer.onDeviceLost.bind(renderer),error=renderer.onError.bind(renderer);
  renderer.onDeviceLost=info=>{
    lost(info);fatal=new Error(`WebGPU device lost: ${info.message}`);fail(fatal);
    void renderer.setAnimationLoop(null);
  };
  renderer.onError=info=>{
    const gpuInfo=info as unknown as {type:string;message:string};
    error(info);fatal=new Error(`WebGPU ${gpuInfo.type}: ${gpuInfo.message}`);fail(fatal);
    void renderer.setAnimationLoop(null);
  };
  await renderer.init();
  if(fatal)throw fatal;
  if(!(renderer.backend as unknown as {isWebGPUBackend:boolean}).isWebGPUBackend)throw new Error('WebGPU is required.');
  let disposing=false;
  const dispose=renderer.dispose.bind(renderer);
  renderer.dispose=()=>{disposing=true;dispose();};
  const device=(renderer.backend as unknown as {device:GPUDevice}).device;
  void device.lost.then(info=>{
    // Three forwards non-destroyed loss. A destruction outside our teardown is fatal too.
    if(info.reason==='destroyed'&&!disposing){fail(new Error('WebGPU device was unexpectedly destroyed'));void renderer.setAnimationLoop(null);}
  });
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1.05;
  renderer.domElement.tabIndex=0;
  renderer.domElement.setAttribute('aria-label','Jelly baby. Use the touch joystick or WASD to walk, Space to jump. Press E or use the Play button near a facility; use the same action to get off. Drag the baby to stretch; drag the table to orbit.');
  return renderer;
}

export function resizeView(renderer:THREE.WebGPURenderer,camera:THREE.PerspectiveCamera,controls:OrbitControls) {
  if(window.innerWidth<=0||window.innerHeight<=0)return;
  const width=Math.max(1,window.innerWidth),height=Math.max(1,window.innerHeight);
  const dpr=Math.min(window.devicePixelRatio,1.7,Math.sqrt(4_000_000/(width*height)));
  renderer.setDrawingBufferSize(width,height,Number.isFinite(dpr)&&dpr>0?dpr:1);
  camera.aspect=width/height;
  camera.fov=2*Math.atan(Math.tan(18*Math.PI/180)*Math.max(1,.85/camera.aspect))*180/Math.PI;
  // Every visible ray meets the tabletop. The horizon never enters the frame.
  controls.maxPolarAngle=Math.PI/2-THREE.MathUtils.degToRad(camera.fov)/2-.10;
  camera.setViewOffset(width,height,0,height*(width<700?.075:.025),width,height);
  camera.updateProjectionMatrix();controls.update();
}
