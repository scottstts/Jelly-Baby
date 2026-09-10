import * as T from 'three/webgpu';
import { float, mix, positionLocal, uv, vec2, vec3 } from 'three/tsl';
import { trackPoint, trackCurve, TRACK_WIDTH, ROAD_HEIGHT, CURB_HEIGHT } from '../game/toy-track-layout.ts';
import { solidLoft } from './manufactured-geometry.ts';
import { enamel, part } from './toy-parts.ts';

export function makeToyRoad(root:T.Group) {
  const half=TRACK_WIDTH/2;
  // One continuous closed slab: top, underside, chamfers and raised curbs.
  const section=[[-half-.006,0],[-half-.006,CURB_HEIGHT-.002],[-half-.004,CURB_HEIGHT],[-half+.002,CURB_HEIGHT],
    [-half+.004,CURB_HEIGHT-.002],[-half+.004,ROAD_HEIGHT+.001],[-half+.005,ROAD_HEIGHT],
    [half-.005,ROAD_HEIGHT],[half-.004,ROAD_HEIGHT+.001],[half-.004,CURB_HEIGHT-.002],
    [half-.002,CURB_HEIGHT],[half+.004,CURB_HEIGHT],[half+.006,CURB_HEIGHT-.002],[half+.006,0]];
  const rings=Array.from({length:512},(_,i)=>section.map(([offset,y])=>{const p=trackPoint(i/512,offset);return [p.x,y,p.z];}));
  const geometry=solidLoft(rings,true);
  // Store longitudinal distance and lateral offset per emitted vertex. Paint is
  // part of the road shader, never a stack of near-coplanar geometry.
  const p=geometry.attributes.position,roadUV=new Float32Array(p.count*2);
  const centers=Array.from({length:512},(_,i)=>trackPoint(i/512));
  for(let i=0;i<p.count;i++) {
    let best=Infinity,k=0;
    for(let j=0;j<512;j++){const d=(p.getX(i)-centers[j].x)**2+(p.getZ(i)-centers[j].z)**2;if(d<best){best=d;k=j;}}
    const tangent=trackCurve.getTangentAt(k/512),c=centers[k];
    roadUV[i*2]=k/512*trackCurve.getLength();roadUV[i*2+1]=(p.getX(i)-c.x)*tangent.z-(p.getZ(i)-c.z)*tangent.x;
  }
  geometry.setAttribute('uv',new T.BufferAttribute(roadUV,2));
  const material=enamel(0x74aaa8,.48);
  // Position-derived start checker has continuous coordinates across the loop seam.
  const start=trackPoint(0),tangent=trackCurve.getTangentAt(0),delta=positionLocal.xz.sub(vec2(start.x,start.z));
  const along=delta.dot(vec2(tangent.x,tangent.z)),across=delta.dot(vec2(tangent.z,-tangent.x));
  const atStart=along.abs().lessThan(.014).and(across.abs().lessThan(half-.008));
  const checker=along.add(.014).div(.014).floor().add(across.add(half).div(.014).floor()).mod(2);
  const paint=mix(vec3(.08,.16,.18),vec3(.97,.88,.68),checker);
  const curb=positionLocal.y.greaterThan(ROAD_HEIGHT+.0001);
  const dash=uv().y.abs().lessThan(.0015).and(uv().x.mod(.038).lessThan(.017));
  const seam=uv().x.mod(trackCurve.getLength()/16).lessThan(.0007);
  const road=mix(mix(vec3(.18,.39,.38),vec3(.08,.19,.18),float(seam)),vec3(.97,.88,.68),float(dash));
  material.colorNode=mix(mix(road,paint,float(atStart)),vec3(.79,.36,.27),float(curb));
  part(root,geometry,material).name='closed-road-with-integral-curbs';
}
