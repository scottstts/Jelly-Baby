import assert from 'node:assert/strict';
import { Vector3 } from 'three/webgpu';
import { SoftBody } from '../src/physics/soft-body.js';
import { surfaceGrab, advanceGrabTarget } from '../src/physics/grab.ts';
import { FacilityCollision } from '../src/facilities/collision.ts';
import { SoccerStadium } from '../src/worlds/soccer/stadium.ts';
import { StadiumCollisionGrid } from '../src/worlds/soccer/collision-grid.ts';
import { FIELD, FIELD_RAMP } from '../src/worlds/soccer/layout.ts';
import { loadModel } from './load-model.mjs';

const stadium=new SoccerStadium(true),body=new SoftBody(loadModel()),collision=new FacilityCollision(body),grid=new StadiumCollisionGrid(stadium.boxes,body),h=1/240;
collision.registerBoxes(stadium.boxes);
// Sample the actual margin-expanded collision surfaces from table to pitch.
// The previous geometry looked flush but the turf's larger contact margin
// created a 1.65 mm invisible riser at the top strip.
function supportHeight(z) {
  let height=.00015;
  for(const box of stadium.boxes) {
    if(box.yAxis.y<.9)continue;
    const margin=box.margin??.002,dx=FIELD_RAMP.x-box.center.x,dz=z-box.center.z;
    const dy=(box.halfSize.y+margin-dx*box.yAxis.x-dz*box.yAxis.z)/box.yAxis.y;
    if(Math.abs(dx*box.xAxis.x+dy*box.xAxis.y+dz*box.xAxis.z)>box.halfSize.x+margin)continue;
    if(Math.abs(dx*box.zAxis.x+dy*box.zAxis.y+dz*box.zAxis.z)>box.halfSize.z+margin)continue;
    height=Math.max(height,box.center.y+dy);
  }
  return height;
}
let previous=supportHeight(FIELD_RAMP.end+.04);
for(let z=FIELD_RAMP.end+.03975;z>FIELD_RAMP.start-.01;z-=.00025) {
  const height=supportHeight(z);
  assert(Math.abs(height-previous)<.0002,`walkable support must stay continuous at z=${z}: ${previous} -> ${height}`);
  previous=height;
}
const results=[];
for(const offset of [-.08,0,.08])for(const height of [.008,.035,.065])for(const duration of [.5,2,4]) {
  body.reset();
  for(let j=0;j<body.x.length;j+=3){body.x[j]+=FIELD_RAMP.x+offset;body.x[j+2]+=FIELD_RAMP.end+.065;}
  body.previous.set(body.x);body.updateCenter();
  const step=()=>{body.step(h);collision.resolveBoxes(grid.near(body));};
  for(let i=0;i<120;i++)step();
  body.updateSurface();
  // Grab a visible front-facing triangle near the requested height, not an
  // arbitrary first triangle that can lift the whole body clear of the lip.
  const p=body.surface.positions,ix=body.surface.indices,point=new Vector3(),candidate=new Vector3(),wanted=new Vector3(FIELD_RAMP.x+offset,height,body.center.z+.035);
  let nearest=Infinity,face;
  for(let i=0;i<ix.length;i+=3){candidate.set(0,0,0);for(let k=0;k<3;k++)candidate.add(new Vector3().fromArray(p,ix[i+k]*3));candidate.multiplyScalar(1/3);const d=candidate.distanceToSquared(wanted);if(d<nearest){nearest=d;point.copy(candidate);face={a:ix[i],b:ix[i+1],c:ix[i+2]};}}
  const grab=surfaceGrab(body,face,point);assert(grab);body.grab=grab;
  const origin=grab.target.clone(),desired=origin.clone();
  for(let i=0;i<(duration+1)/h;i++) {
    desired.copy(origin);desired.z-=.36*Math.min(1,(i+1)*h/duration);
    advanceGrabTarget(grab.target,desired,h,grab.point);step();
  }
  body.updateSurface();let rearZ=-Infinity;
  for(let j=2;j<body.surface.positions.length;j+=3)rearZ=Math.max(rearZ,body.surface.positions[j]);
  results.push({offset,height,duration,z:body.center.z,rearZ});
}
for(const result of results)assert(result.rearZ<FIELD.length/2,`grab at x offset ${result.offset}, height ${result.height} m over ${result.duration}s must carry the whole jelly across the field lip (rear z=${result.rearZ})`);
console.log(`Continuous ramp/table/turf support and ${results.length} grabbed traversals passed; minimum whole-body clearance ${(1000*(FIELD.length/2-Math.max(...results.map(result=>result.rearZ)))).toFixed(1)} mm.`);
collision.dispose();stadium.dispose();
