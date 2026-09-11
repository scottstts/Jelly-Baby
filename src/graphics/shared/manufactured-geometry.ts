import * as T from 'three/webgpu';
import { loft, cleanMesh, recalcNormals, smoothShade, toGeometry, tubeAlong, roundedBoxMesh, revolve } from '../../../scripts/geometry-quality-kit/procedural-mesh.js';

export function moldedBox(size:number[],radius:number) {
  const [x,y,z]=size,data=roundedBoxMesh([-x/2,-z/2,-y/2,x/2,z/2,y/2],Math.min(radius,Math.min(x,y,z)*.35),3);
  cleanMesh(data,1e-8);recalcNormals(data);smoothShade(data,38);return toGeometry(data);
}
export function turned(profile:number[][],segments=32) {
  const data=revolve(profile,segments);cleanMesh(data,1e-8);recalcNormals(data);smoothShade(data,40);return toGeometry(data);
}

/** Polygon-first kit authors Z-up. Convert once at the boundary, including winding. */
export function solidLoft(rings:number[][][],closed=false) {
  const data=loft(rings.map(r=>r.map(([x,y,z])=>[x,z,y])),{closeU:closed,closeV:true,capStart:!closed,capEnd:!closed});
  cleanMesh(data,1e-8);recalcNormals(data);smoothShade(data,38);
  const geometry=toGeometry(data);geometry.userData.meshData=data;return geometry;
}
export function closedTube(points:T.Vector3[],radius:number,segments=12,closed=false) {
  const profile=Array.from({length:segments},(_,i)=>[radius*Math.cos(i*2*Math.PI/segments),radius*Math.sin(i*2*Math.PI/segments)]);
  const data=tubeAlong(points.map(p=>[p.x,p.z,p.y]),profile,{cap:true,closePath:closed});
  cleanMesh(data,1e-8);recalcNormals(data);smoothShade(data,40);
  const geometry=toGeometry(data);geometry.userData.meshData=data;return geometry;
}
/** A formed sheet with an inner wall, outer wall and owned end/rim faces. */
export function wheelFender(radius:number,width:number,thickness:number) {
  const rings=Array.from({length:41},(_,i)=>{
    const a=-.18+(Math.PI+.36)*i/40;
    return [[-width/2,radius*Math.sin(a),radius*Math.cos(a)],
      [width/2,radius*Math.sin(a),radius*Math.cos(a)],
      [width/2,(radius+thickness)*Math.sin(a),(radius+thickness)*Math.cos(a)],
      [-width/2,(radius+thickness)*Math.sin(a),(radius+thickness)*Math.cos(a)]];
  });return solidLoft(rings);
}
