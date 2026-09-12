import { Matrix4 } from 'three/webgpu';
import { beveledPrismMesh, cleanMesh, recalcNormals, smoothShade, toGeometry } from '../../../scripts/geometry-quality-kit/procedural-mesh.js';

/** A thick, bevelled profile extruded across X; input points are [Z,Y]. */
export function formedProfile(profile:number[][],width:number,bevel=.0006) {
  const data=beveledPrismMesh(profile,-width/2,width/2,bevel,2);cleanMesh(data,1e-8);recalcNormals(data);smoothShade(data,38);
  const geometry=toGeometry(data);
  // Kit [Z,Y,X] authors → emitted [Z,X,Y] → scene [X,Y,Z].
  geometry.applyMatrix4(new Matrix4().set(0,1,0,0,0,0,1,0,1,0,0,0,0,0,0,1));return geometry;
}
