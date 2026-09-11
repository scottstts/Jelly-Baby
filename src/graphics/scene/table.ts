import * as THREE from 'three/webgpu';
import { texture, positionWorld, float, vec2, vec3, normalMap, uniform } from 'three/tsl';
import type { RefractiveLightField } from '../optics/refractive-light.js';
import type { FacilityShadows } from '../../facilities/shadows.ts';

export async function makeTable(optics:RefractiveLightField,light:{color:THREE.Color;windowFraction:number;irradiance:number},facilities:FacilityShadows) {
  const fraction=uniform(light.windowFraction),irradiance=uniform(light.irradiance/Math.PI),color=uniform(light.color.clone());
  const loader=new THREE.TextureLoader();
  const urls=[new URL('../../assets/wood_texture/wood_base.jpg',import.meta.url).href,
    new URL('../../assets/wood_texture/wood_normal.png',import.meta.url).href,
    new URL('../../assets/wood_texture/wood_roughness.jpg',import.meta.url).href];
  const [base,normal,roughness]=await Promise.all(urls.map(url=>loader.loadAsync(url)));
  base.colorSpace=THREE.SRGBColorSpace;
  for(const t of [base,normal,roughness]) {t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;}
  const uv=positionWorld.xz.div(2.5).add(.5);
  const opticalUV=positionWorld.xz.sub(optics.originNode).div(optics.spanNode);
  const inside=float(opticalUV.x.greaterThan(0).and(opticalUV.x.lessThan(1)).and(opticalUV.y.greaterThan(0)).and(opticalUV.y.lessThan(1)));
  const shadowUV=positionWorld.xz.sub(optics.shadowOriginNode).div(optics.shadowSpanNode);
  const shadowInside=float(shadowUV.x.greaterThan(0).and(shadowUV.x.lessThan(1)).and(shadowUV.y.greaterThan(0)).and(shadowUV.y.lessThan(1)));
  const shadow=texture(optics.shadowTexture,shadowUV).r.mul(shadowInside);
  const contactUV=positionWorld.xz.sub(optics.contactOriginNode).div(optics.shadowSpanNode);
  const contactInside=float(contactUV.x.greaterThan(0).and(contactUV.x.lessThan(1)).and(contactUV.y.greaterThan(0)).and(contactUV.y.lessThan(1)));
  const contact=texture(optics.shadowTexture,contactUV).g.mul(contactInside);
  const albedo=texture(base,uv).rgb;
  const material=new THREE.MeshPhysicalNodeMaterial({metalness:0,roughness:.26,clearcoat:.38,clearcoatRoughness:.23});
  const facilityUV=facilities.worldToUVNode.mul(vec3(positionWorld.xz,1)).xy;
  const facilityInside=float(facilityUV.x.greaterThan(0).and(facilityUV.x.lessThan(1)).and(facilityUV.y.greaterThan(0)).and(facilityUV.y.lessThan(1)));
  // A deterministic tent filter softens the finite window's occlusion. No
  // temporal noise, transparent sorting, or nearly coplanar depth comparisons.
  let facilityMask=vec2(0,0).add(0);
  for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++) {
    const weight=(x===0?2:1)*(y===0?2:1)/16;
    facilityMask=facilityMask.add(texture(facilities.target.texture,facilityUV.add(vec2(x,y).mul(1.5/512))).rg.mul(weight));
  }
  const facilityShadow=facilityMask.x.mul(facilityInside),facilityContact=facilityMask.y.mul(facilityInside);
  const visibility=float(1).sub(shadow).mul(float(1).sub(facilityShadow));
  material.colorNode=albedo.mul(float(1).sub(float(1).sub(visibility).mul(fraction))).mul(float(1).sub(contact.mul(.40))).mul(float(1).sub(facilityContact.mul(.35)));
  // Plane UV-v points toward -Z; the metre-scaled world UV points toward +Z.
  material.normalNode=normalMap(texture(normal,uv),vec2(.27,-.27));
  material.roughnessNode=texture(roughness,uv).r.mul(.30).add(.12);
  material.emissiveNode=albedo.mul(texture(optics.lightTexture,opticalUV).rgb).mul(irradiance).mul(color).mul(inside).mul(float(1).sub(facilityShadow));
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(200,200),material);
  mesh.rotation.x=-Math.PI/2;mesh.position.y=-.00005;
  return {mesh,setLighting:(light:{color:THREE.Color;windowFraction:number;irradiance:number})=>{fraction.value=light.windowFraction;irradiance.value=light.irradiance/Math.PI;color.value.copy(light.color);},dispose:()=>{mesh.geometry.dispose();material.dispose();[base,normal,roughness].forEach(t=>t.dispose());}};
}
