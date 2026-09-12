import * as T from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { closedTube, moldedBox } from './manufactured-geometry.ts';

export const enamel=(color:number,roughness=.28)=>new T.MeshPhysicalNodeMaterial({color,roughness,clearcoat:.65,clearcoatRoughness:.2});
export function part(root:T.Object3D,geometry:T.BufferGeometry,material:T.Material,x=0,y=0,z=0) {
  const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);return mesh;
}
export function rounded(root:T.Object3D,size:number[],material:T.Material,x=0,y=0,z=0,r=.002) {
  // Submillimetre paint/seams need flat quads, not hundreds of bevel triangles.
  const geometry=r<.0006?new T.BoxGeometry(size[0],size[1],size[2]):moldedBox(size,r);
  return part(root,geometry,material,x,y,z);
}
export function rod(root:T.Object3D,a:T.Vector3,b:T.Vector3,r:number,material:T.Material) {
  const mesh=part(root,new T.CylinderGeometry(r,r,a.distanceTo(b),10),material);
  mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());return mesh;
}
export function tube(root:T.Object3D,points:number[][],r:number,material:T.Material) {
  const path=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
  return part(root,closedTube(path.getPoints(32),r),material);
}
/** Bake only static assemblies, sharing one draw per finish. */
export function batch(root:T.Group) {
  if(root.userData.keepParts)return;
  root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),buckets=new Map<T.Material,T.BufferGeometry[]>();
  root.traverse(o=>{if(o instanceof T.Mesh&&!Array.isArray(o.material)){
    const list=buckets.get(o.material)??[];
    // Keep authored indices. Expanding every source to non-indexed triangles
    // duplicates vertex data, makes large static assemblies expensive to build,
    // and increases the final GPU vertex workload without changing appearance.
    // Give the few non-indexed sources a one-to-one index instead so a bucket
    // can still be merged by BufferGeometryUtils with identical attributes.
    const geometry=o.geometry.clone();
    if(!geometry.index) {
      const count=geometry.getAttribute('position').count;
      const Index=count>65535?Uint32Array:Uint16Array,index=new Index(count);
      for(let i=0;i<count;i++)index[i]=i;
      geometry.setIndex(new T.BufferAttribute(index,1));
    }
    list.push(geometry.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld)));buckets.set(o.material,list);o.geometry.dispose();
  }});root.clear();
  for(const [material,geometries] of buckets){const merged=mergeGeometries(geometries);if(!merged)throw new Error('Toy assembly could not be batched');part(root,merged,material);geometries.forEach(g=>g.dispose());}
}
export function disposeParts(root:T.Group) {
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
  root.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.removeFromParent();
}
