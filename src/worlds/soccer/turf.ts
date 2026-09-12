import * as THREE from 'three/webgpu';
import type Node from 'three/src/nodes/core/Node.js';
import { abs, add, bumpMap, float, max, mix, mul, normalLocal, normalMap, normalize, positionLocal, sin, texture, vec2, vec3 } from 'three/tsl';
import { enamel } from '../../graphics/shared/toy-parts.ts';

export const GRASS_TILE_METERS=.16;

export type GrassTextureSet={
  base:THREE.Texture;
  normal:THREE.Texture;
  roughness:THREE.Texture;
  displacement:THREE.Texture;
};

const grassTextureURLs=[
  new URL('../../assets/grass_texture/grass_base.jpg',import.meta.url).href,
  new URL('../../assets/grass_texture/grass_normal.jpg',import.meta.url).href,
  new URL('../../assets/grass_texture/grass_roughness.jpg',import.meta.url).href,
  new URL('../../assets/grass_texture/grass_displacement.jpg',import.meta.url).href,
];

function configureGrassTexture(map:THREE.Texture,colorSpace:THREE.ColorSpace=THREE.NoColorSpace) {
  map.colorSpace=colorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;
  map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;
  map.generateMipmaps=true;map.anisotropy=8;map.needsUpdate=true;return map;
}

/** The browser path loads the authored four-map package before Soccer is built. */
export async function loadGrassTextures():Promise<GrassTextureSet> {
  if(typeof document==='undefined'||typeof Image==='undefined'||typeof document.createElementNS!=='function')return createFallbackGrassTextures();
  const loader=new THREE.TextureLoader();
  const [base,normal,roughness,displacement]=await Promise.all(grassTextureURLs.map(url=>loader.loadAsync(url)));
  configureGrassTexture(base,THREE.SRGBColorSpace);
  configureGrassTexture(normal);configureGrassTexture(roughness);configureGrassTexture(displacement);
  return {base,normal,roughness,displacement};
}

function solidTexture(r:number,g:number,b:number,colorSpace:THREE.ColorSpace=THREE.NoColorSpace) {
  return configureGrassTexture(new THREE.DataTexture(new Uint8Array([r,g,b,255]),1,1,THREE.RGBAFormat),colorSpace);
}

/** Node geometry checks construct the stadium without a DOM/Image loader. */
export function createFallbackGrassTextures():GrassTextureSet {
  return {
    base:solidTexture(58,128,47,THREE.SRGBColorSpace),
    normal:solidTexture(128,128,255),
    roughness:solidTexture(150,150,150),
    displacement:solidTexture(128,128,128),
  };
}

export function disposeGrassTextures(textures:GrassTextureSet) {
  new Set(Object.values(textures)).forEach(texture=>texture.dispose());
}

export function turfMaterial(grass:GrassTextureSet) {
  const material=enamel(0x43883d,.59),p=positionLocal;
  // The tile size is expressed in metres: the 2 x 3.08 m pitch receives
  // 12.5 x 19.25 square repeats without stretching the authored grass.
  const uv=p.xz.div(GRASS_TILE_METERS);
  const base=texture(grass.base,uv).rgb;
  const sourceRoughness=texture(grass.roughness,uv).r;
  const sourceDisplacement=texture(grass.displacement,uv).r;
  const sourceNormal=normalMap(texture(grass.normal,uv),vec2(.42,-.42)) as unknown as Node<'vec3'>;
  const heightNormal=bumpMap(sourceDisplacement,float(.0009)) as unknown as Node<'vec3'>;
  const displacement=sourceDisplacement.sub(.5).mul(.0018);
  material.clearcoat=.3;material.clearcoatRoughness=.37;
  const stripe=sin(p.z.mul(Math.PI/.22)).mul(.019);
  const edge=max(abs(p.x).sub(.992),abs(p.z).sub(1.532));
  const center=abs(p.xz.length().sub(.255)),halfway=abs(p.z);
  const boxX=abs(abs(p.x).sub(.40)),boxZ=abs(abs(p.z).sub(1.19));
  const penalty=abs(p.x).lessThan(.40).and(boxZ.lessThan(.003)).or(abs(p.z).greaterThan(1.19).and(boxX.lessThan(.003)));
  const paint=float(edge.greaterThan(0).or(center.lessThan(.0035)).or(halfway.lessThan(.0035)).or(penalty));
  const green=base.mul(float(1).add(stripe));
  material.colorNode=mix(green,vec3(.86,.88,.68),paint);
  material.roughnessNode=sourceRoughness.mul(.34).add(.38);
  // NodeMaterial position displacement makes the height map affect the
  // actual turf silhouette; keep bevels and the underside fixed to the slab.
  material.positionNode=positionLocal.add(vec3(0,displacement.mul(float(normalLocal.y.greaterThan(.5))),0));
  material.normalNode=normalize(add(mul(sourceNormal,float(.78)),mul(heightNormal,float(.22))));
  return material;
}
