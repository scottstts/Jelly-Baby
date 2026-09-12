import * as THREE from 'three/webgpu';
import { float, normalWorldGeometry, positionWorld, texture, uniform, vec3 } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import type { RefractiveLightField } from './refractive-light.js';
import type { FacilityShadows } from '../../facilities/shadows.ts';
import { groundReceiver } from '../scene/ground-receiver.ts';

export type CausticLighting={color:THREE.Color;irradiance:number};
type ReceiverOptions={albedo?:Node<'vec3'>;visibility?:Node<'float'>};
type CausticMaterial=THREE.MeshStandardNodeMaterial|THREE.MeshPhysicalNodeMaterial;

/** Shared receiver-side binding for the existing floor-projected jelly caustic field. */
export class CausticReceivers {
  readonly irradianceNode=uniform(0);
  readonly colorNode=uniform(new THREE.Color());
  readonly optics:RefractiveLightField;
  private readonly materials=new Set<THREE.Material>();
  private readonly meshes=new Map<THREE.Mesh,ReceiverOptions>();
  private readonly sources:CausticReceivers[]=[];
  readonly enabledNode=uniform(1);
  private readonly grounds:{mesh:THREE.Mesh;albedo:Node<'vec3'>;facilities:FacilityShadows;fraction:Node<'float'>;height:number}[]=[];

  constructor(optics:RefractiveLightField,light:CausticLighting) {
    this.optics=optics;this.setLighting(light);
  }

  /** Register opted-in meshes under a root. The caustic generator itself is unchanged. */
  add(root:THREE.Object3D,options:ReceiverOptions={}) {
    root.traverse(object=>{if(object instanceof THREE.Mesh&&object.receiveCaustics)this.register(object,options);});
  }

  /** Register one mesh after setting `mesh.receiveCaustics = true`. */
  register(mesh:THREE.Mesh,options:ReceiverOptions={}) {
    if(!mesh.receiveCaustics)return;
    if(!this.meshes.has(mesh))this.meshes.set(mesh,options);
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])this.registerMaterial(material,options);
    for(const source of this.sources)source.register(mesh,options);
  }

  addSource(optics:RefractiveLightField) {
    const source=new CausticReceivers(optics,{color:this.colorNode.value,irradiance:this.irradianceNode.value*Math.PI});
    for(const [mesh,options] of this.meshes)source.register(mesh,options);
    this.sources.push(source);
    for(const ground of this.grounds)this.bindGround(ground);
    return source;
  }

  registerGround(mesh:THREE.Mesh,albedo:Node<'vec3'>,facilities:FacilityShadows,fraction:Node<'float'>,height=0) {
    const ground={mesh,albedo,facilities,fraction,height};this.grounds.push(ground);
    const visibility=this.bindGround(ground);
    mesh.receiveCaustics=true;this.register(mesh,{albedo,visibility});
  }

  private bindGround(ground:typeof this.grounds[number]) {
    const result=groundReceiver(ground.albedo,this.optics,ground.facilities,ground.fraction,ground.height,this.sources);
    const material=ground.mesh.material as THREE.MeshPhysicalNodeMaterial;
    material.colorNode=result.color;material.needsUpdate=true;return result.visibility;
  }

  private registerMaterial(material:THREE.Material,options:ReceiverOptions) {
    if(this.materials.has(material))return;
    if(!(material instanceof THREE.MeshStandardNodeMaterial)&&!(material instanceof THREE.MeshPhysicalNodeMaterial))return;
    const lit=material as CausticMaterial;
    // NodeMaterial's public typings intentionally expose colorNode/emissiveNode
    // as broad Node unions. For lit materials both slots are RGB-valued at
    // runtime, so normalize that boundary once instead of feeding the union
    // back through vec3(), whose overloads reject color/generic Node types.
    const materialColor=(lit.colorNode??uniform(lit.color)) as Node<'vec3'>;
    const albedo=options.albedo??materialColor;
    const visibility=options.visibility??float(1);
    // The texture stores irradiance where refracted rays reach y=0. Sampling it
    // with raw world XZ extrudes every bright floor texel vertically, which made
    // tall props glow all the way up their sides. Reconstruct the corresponding
    // floor point for this fragment along the measured light direction instead.
    // This keeps the existing caustic field unchanged while making raised
    // reception spatially consistent with the direction that produced it.
    const lightDirection=this.optics.lightDirectionNode as unknown as Node<'vec3'>;
    const floorDistance=positionWorld.y.max(0).negate().div(lightDirection.y.min(-1e-4));
    const projectedXZ=positionWorld.xz.add(lightDirection.xz.mul(floorDistance));
    const uv=projectedXZ.sub(this.optics.originNode).div(this.optics.spanNode);
    const inside=float(uv.x.greaterThan(0).and(uv.x.lessThan(1)).and(uv.y.greaterThan(0)).and(uv.y.lessThan(1)));
    const sample=texture(this.optics.lightTexture,uv);
    // lightTexture is calibrated as irradiance on a horizontal receiver. Convert
    // that response to the actual geometric surface orientation, but never let
    // an approximate raised receiver become brighter than the established floor
    // result. Horizontal upward-facing surfaces therefore remain exactly 1.0.
    const horizontalFacing=lightDirection.y.abs().max(1e-4);
    const surfaceFacing=normalWorldGeometry.dot(lightDirection.negate()).max(0);
    const incidence=surfaceFacing.div(horizontalFacing).clamp(0,1);
    const strength=this.irradianceNode.mul(this.enabledNode).mul(inside).mul(visibility).mul(incidence);
    // Keep RGB products component-wise. @types/three's fluent mul overloads
    // are scalar-biased for vec3 nodes even though TSL supports vec3*vec3.
    const caustic=vec3(
      albedo.x.mul(sample.r).mul(this.colorNode.r),
      albedo.y.mul(sample.g).mul(this.colorNode.g),
      albedo.z.mul(sample.b).mul(this.colorNode.b),
    ).mul(strength);
    const emissive=lit.emissiveNode as Node<'vec3'>|null;
    lit.emissiveNode=emissive?emissive.add(caustic):caustic;
    lit.needsUpdate=true;this.materials.add(material);
  }

  setLighting(light:CausticLighting) {
    this.irradianceNode.value=light.irradiance/Math.PI;this.colorNode.value.copy(light.color);
    for(const source of this.sources)source.setLighting(light);
  }

  dispose(){for(const source of this.sources)source.dispose();this.sources.length=0;this.grounds.length=0;this.meshes.clear();this.materials.clear();}
}
