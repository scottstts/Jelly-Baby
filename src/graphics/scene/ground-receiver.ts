import { float, positionWorld, texture, vec2, vec3 } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import type { RefractiveLightField } from '../optics/refractive-light.js';
import type { FacilityShadows } from '../../facilities/shadows.ts';

/** The floor's shadow/contact shader, shared by every horizontal ground receiver. */
export function groundReceiver(albedo:Node<'vec3'>,optics:RefractiveLightField,facilities:FacilityShadows,fraction:Node<'float'>,height=0,additional:readonly {optics:RefractiveLightField;enabledNode:Node<'float'>}[]=[]) {
  const opticalMask=(optics:RefractiveLightField)=>{
  const direction=optics.lightDirectionNode as unknown as Node<'vec3'>;
  const projected=positionWorld.xz.sub(direction.xz.mul(height).div(direction.y));
  const shadowUV=projected.sub(optics.shadowOriginNode).div(optics.shadowSpanNode);
  const shadowInside=float(shadowUV.x.greaterThan(0).and(shadowUV.x.lessThan(1)).and(shadowUV.y.greaterThan(0)).and(shadowUV.y.lessThan(1)));
  const shadow=texture(optics.shadowTexture,shadowUV).r.mul(shadowInside);
  const contactUV=positionWorld.xz.sub(optics.contactOriginNode).div(optics.shadowSpanNode);
  const contactInside=float(contactUV.x.greaterThan(0).and(contactUV.x.lessThan(1)).and(contactUV.y.greaterThan(0)).and(contactUV.y.lessThan(1)));
  const contact=texture(optics.shadowTexture,contactUV).g.mul(contactInside);
    return {shadow,contact};
  };
  const primary=opticalMask(optics);
  let shadow=primary.shadow,contact=primary.contact;
  for(const source of additional){
    const mask=opticalMask(source.optics);
    shadow=float(1).sub(float(1).sub(shadow).mul(float(1).sub(mask.shadow.mul(source.enabledNode))));
    contact=contact.max(mask.contact.mul(source.enabledNode));
  }
  const facilityUV=facilities.worldToUVNode.mul(vec3(positionWorld.xz,1)).xy;
  const facilityInside=float(facilityUV.x.greaterThan(0).and(facilityUV.x.lessThan(1)).and(facilityUV.y.greaterThan(0)).and(facilityUV.y.lessThan(1)));
  let facilityMask=vec2(0,0).add(0);
  for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++) {
    const weight=(x===0?2:1)*(y===0?2:1)/16;
    facilityMask=facilityMask.add(texture(facilities.target.texture,facilityUV.add(vec2(x,y).mul(facilities.shadowTexelNode).mul(1.5))).rg.mul(weight));
  }
  const facilityShadow=facilityMask.x.mul(facilityInside),facilityContact=facilityMask.y.mul(facilityInside);
  const visibility=float(1).sub(shadow).mul(float(1).sub(facilityShadow));
  return {
    color:albedo.mul(float(1).sub(float(1).sub(visibility).mul(fraction))).mul(float(1).sub(contact.mul(.40))).mul(float(1).sub(facilityContact.mul(.35))),
    visibility:float(1).sub(facilityShadow),
  };
}
