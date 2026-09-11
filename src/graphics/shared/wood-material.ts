import * as THREE from 'three/webgpu';
import { positionLocal, vec3 } from 'three/tsl';

/** The warm procedural timber finish used by the swing frame and dressing table. */
export function makeSwingWoodMaterial() {
  const timber=new THREE.MeshPhysicalNodeMaterial({color:'#bd9464',roughness:.48,clearcoat:.18});
  const grain=positionLocal.x.mul(3400).add(positionLocal.y.mul(38).sin().mul(1.8)).sin().mul(.045).add(.955);
  timber.colorNode=vec3(timber.color.r,timber.color.g,timber.color.b).mul(grain);
  return timber;
}
