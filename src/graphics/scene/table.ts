import * as THREE from 'three/webgpu';
import { texture, positionWorld, vec2, normalMap, uniform } from 'three/tsl';
import type { RefractiveLightField } from '../optics/refractive-light.js';
import type { CausticReceivers } from '../optics/caustic-receivers.ts';
import type { FacilityShadows } from '../../facilities/shadows.ts';

export type TableTextures={base:THREE.Texture;normal:THREE.Texture;roughness:THREE.Texture};

export async function loadTableTextures():Promise<TableTextures> {
  const loader=new THREE.TextureLoader();
  const urls=[new URL('../../assets/wood_texture/wood_base.jpg',import.meta.url).href,
    new URL('../../assets/wood_texture/wood_normal.png',import.meta.url).href,
    new URL('../../assets/wood_texture/wood_roughness.jpg',import.meta.url).href];
  const [base,normal,roughness]=await Promise.all(urls.map(url=>loader.loadAsync(url)));
  base.colorSpace=THREE.SRGBColorSpace;
  for(const t of [base,normal,roughness]) {t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;}
  return {base,normal,roughness};
}

export function makeTable(_optics:RefractiveLightField,light:{color:THREE.Color;windowFraction:number;irradiance:number},facilities:FacilityShadows,caustics:CausticReceivers,textures:TableTextures) {
  const fraction=uniform(light.windowFraction);
  const {base,normal,roughness}=textures;
  const uv=positionWorld.xz.div(2.5).add(.5);
  const albedo=texture(base,uv).rgb;
  const material=new THREE.MeshPhysicalNodeMaterial({metalness:0,roughness:.26,clearcoat:.38,clearcoatRoughness:.23});
  // Plane UV-v points toward -Z; the metre-scaled world UV points toward +Z.
  material.normalNode=normalMap(texture(normal,uv),vec2(.27,-.27));
  material.roughnessNode=texture(roughness,uv).r.mul(.30).add(.12);
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(200,200),material);
  mesh.rotation.x=-Math.PI/2;mesh.position.y=-.00005;mesh.receiveCaustics=true;
  // Keep the table's established facility-shadow mask while moving the actual
  // caustic sampling into the same reusable receiver path as scene objects.
  caustics.registerGround(mesh,albedo,facilities,fraction);
  return {mesh,setLighting:(light:{windowFraction:number})=>{fraction.value=light.windowFraction;},dispose:()=>{mesh.geometry.dispose();material.dispose();[base,normal,roughness].forEach(t=>t.dispose());}};
}
