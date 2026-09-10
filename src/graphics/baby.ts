import * as THREE from 'three/webgpu';
import { attribute } from 'three/tsl';
import { BabyFace } from './baby-face.ts';
import type { SoftBody } from '../physics/soft-body.js';
import { DEFAULT_JELLY_FLAVOR, JELLY_FLAVORS, type JellyFlavorName } from './jelly-flavors.ts';

export const ABSORPTION=JELLY_FLAVORS[DEFAULT_JELLY_FLAVOR].absorption;

export class Baby {
  readonly mesh:THREE.Mesh;
  readonly group=new THREE.Group();
  private readonly face:BabyFace;
  private readonly jellyMaterial:THREE.MeshPhysicalNodeMaterial;
  readonly body:SoftBody;
  constructor(body:SoftBody) {
    this.body=body;
    const material=new THREE.MeshPhysicalNodeMaterial({
      color:JELLY_FLAVORS[DEFAULT_JELLY_FLAVOR].surface,roughness:.085,metalness:0,transmission:1,thickness:.035,
      ior:1.35,dispersion:.025,attenuationDistance:.035,
      clearcoat:.42,clearcoatRoughness:.05,envMapIntensity:1.05,
      transparent:false,side:THREE.FrontSide,flatShading:false,
    });
    this.jellyMaterial=material;
    this.setFlavor(DEFAULT_JELLY_FLAVOR);
    material.thicknessNode=attribute('opticalThickness','float');
    this.mesh=new THREE.Mesh(body.surface.geometry,material);
    this.mesh.renderOrder=1;
    this.mesh.frustumCulled=false;this.group.add(this.mesh);
    this.face=new BabyFace(body,this.group);
    this.update();
  }
  setFlavor(flavor:JellyFlavorName) {
    const look=JELLY_FLAVORS[flavor],distance=this.jellyMaterial.attenuationDistance;
    this.jellyMaterial.color.set(look.surface);
    this.jellyMaterial.attenuationColor.setRGB(
      Math.exp(-look.absorption[0]*distance),Math.exp(-look.absorption[1]*distance),Math.exp(-look.absorption[2]*distance),
      THREE.LinearSRGBColorSpace,
    );
  }
  update(dt=0,playing=false,sleeping=false,crying=false) { this.face.update(dt,playing,sleeping,crying); }
  resetFace() { this.face.reset(); }
  dispose() {
    this.group.traverse(object=>{
      if(object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials=Array.isArray(object.material)?object.material:[object.material];
        materials.forEach(m=>m.dispose());
      }
    });
  }
}
