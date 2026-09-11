import * as THREE from 'three/webgpu';
import { float, positionWorld, texture, uniform, vec3 } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import type { RefractiveLightField } from './refractive-light.js';

export type CausticLighting={color:THREE.Color;irradiance:number};
type ReceiverOptions={albedo?:Node<'vec3'>;visibility?:Node<'float'>};
type CausticMaterial=THREE.MeshStandardNodeMaterial|THREE.MeshPhysicalNodeMaterial;

/** Shared receiver-side binding for the existing floor-projected jelly caustic field. */
export class CausticReceivers {
  readonly irradianceNode=uniform(0);
  readonly colorNode=uniform(new THREE.Color());
  private readonly optics:RefractiveLightField;
  private readonly materials=new Set<THREE.Material>();

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
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])this.registerMaterial(material,options);
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
    const uv=positionWorld.xz.sub(this.optics.originNode).div(this.optics.spanNode);
    const inside=float(uv.x.greaterThan(0).and(uv.x.lessThan(1)).and(uv.y.greaterThan(0)).and(uv.y.lessThan(1)));
    const sample=texture(this.optics.lightTexture,uv);
    const strength=this.irradianceNode.mul(inside).mul(visibility);
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
  }

  dispose(){this.materials.clear();}
}
