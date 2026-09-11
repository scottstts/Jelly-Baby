import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { Locomotion } from '../src/app/locomotion.ts';
import { Baby, ABSORPTION } from '../src/graphics/character/baby.ts';
import { RefractiveLightField } from '../src/graphics/optics/refractive-light.js';
import { Vector3, Raycaster } from 'three/webgpu';
import { deformSurface } from '../src/physics/deform-surface.js';

const body=new SoftBody(loadModel()),rig=new Locomotion(body),baby=new Baby(body);
const optics=new RefractiveLightField(body.cage.opticalSurface,new Vector3(.49,-.75,-.44).normalize(),ABSORPTION);
const time=fn=>{const start=performance.now();fn();return performance.now()-start;};
for(let i=0;i<240;i++){rig.step(PHYS.step);body.step(PHYS.step);}
for(const state of ['walk','stretch']) {
  rig.move.set(0,0,state==='walk'?1:0);
  if(state==='stretch') {
    let id=0;for(let i=1;i<body.mass.length;i++)if(body.rest[i*3+1]>body.rest[id*3+1])id=i;
    const point=new Vector3().fromArray(body.x,id*3);
    body.grab={weights:[[id,1]],point:point.clone(),target:point.clone().add(new Vector3(.13,.12,0)),lambda:new Float64Array(3)};
  }
  const timing={physics:[],surface:[],face:[],pick:[],transport:[],thickness:[]};
  for(let frame=0;frame<45;frame++) {
    timing.physics.push(time(()=>{for(let i=0;i<4;i++){rig.step(PHYS.step);body.step(PHYS.step);}}));
    timing.surface.push(time(()=>body.updateSurface()));timing.face.push(time(()=>baby.update()));
    if(frame%15===0) {
      const ray=new Raycaster(body.center.clone().add(new Vector3(0,0,.2)),new Vector3(0,0,-1));
      timing.pick.push(time(()=>ray.intersectObject(baby.mesh)));
      timing.transport.push(time(()=>{deformSurface(body.cage.opticalSurface,body.x,body.nodalF);optics.update(body);}));
      timing.thickness.push(time(()=>optics.updateViewThickness({position:body.center.clone().add(new Vector3(.08,.13,.19))})));
    }
  }
  console.log(state,Object.fromEntries(Object.entries(timing).map(([key,values])=>[key,{mean:+(values.reduce((a,b)=>a+b,0)/values.length).toFixed(2),max:+Math.max(...values).toFixed(2)}])));
}
