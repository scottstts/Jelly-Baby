import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { color, uniform } from 'three/tsl';
import { CausticReceivers } from '../src/graphics/optics/caustic-receivers.ts';

const lightTexture=new THREE.Texture();
const optics={
  lightTexture,
  originNode:uniform(new THREE.Vector2(-.1,-.1)),
  spanNode:uniform(new THREE.Vector2(.2,.2)),
};
const light={color:new THREE.Color(.8,.7,.6),irradiance:4};
const receivers=new CausticReceivers(optics,light);

const material=new THREE.MeshPhysicalNodeMaterial({color:0x6f8f60});
const mesh=new THREE.Mesh(new THREE.BoxGeometry(.02,.02,.02),material);
assert.equal(mesh.receiveCaustics,undefined,'caustic reception is opt-in for arbitrary meshes');
receivers.register(mesh);
assert.equal(material.emissiveNode,null,'an unmarked mesh is not modified');
mesh.receiveCaustics=true;receivers.register(mesh);
assert(material.emissiveNode,'receiveCaustics enables the shared material caustic term');
const once=material.emissiveNode;receivers.register(mesh);
assert.equal(material.emissiveNode,once,'registering the same material twice never doubles caustic energy');

const glowingMaterial=new THREE.MeshPhysicalNodeMaterial({color:0xffffff});
const originalGlow=color(0x203040);glowingMaterial.emissiveNode=originalGlow;
const glowing=new THREE.Mesh(new THREE.SphereGeometry(.01,8,6),glowingMaterial);glowing.receiveCaustics=true;
receivers.register(glowing);
assert.notEqual(glowingMaterial.emissiveNode,originalGlow,'caustics add to an existing emissive node instead of replacing it');

const group=new THREE.Group(),standard=new THREE.MeshStandardNodeMaterial({color:0xbb8844});
const child=new THREE.Mesh(new THREE.BoxGeometry(.01,.01,.01),standard);child.receiveCaustics=true;group.add(child);
receivers.add(group);assert(standard.emissiveNode,'root registration finds opted-in descendant PBR meshes');

const night={color:new THREE.Color(.25,.4,.9),irradiance:1.5};receivers.setLighting(night);
assert.equal(receivers.irradianceNode.value,night.irradiance/Math.PI);
assert(receivers.colorNode.value.equals(night.color),'lighting switches update the shared receiver color without rebuilding materials');

receivers.dispose();
for(const item of [mesh,glowing,child]){item.geometry.dispose();item.material.dispose();}
lightTexture.dispose();
console.log('Universal caustic receiver opt-in, deduplication, emissive preservation and lighting updates passed');
