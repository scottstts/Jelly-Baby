import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat } from 'three/webgpu';
import { abs, bumpMap, float, max, mix, positionLocal, sin, texture, vec3 } from 'three/tsl';
import { enamel } from '../../graphics/shared/toy-parts.ts';

/** Dense short ribbons form the plastic pile below the explicit silhouette fibers.
 * Mipmaps integrate the microgeometry at distance instead of aliasing tiny blades.
 */
export function plasticPileTexture() {
  const size=512,data=new Uint8Array(size*size*4),cells=64;
  const hash=(x:number,y:number)=>{let n=Math.imul((x+cells)%cells,374761393)^Math.imul((y+cells)%cells,668265263);n=Math.imul(n^(n>>>13),1274126177);return (n>>>0)/4294967296;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const px=x/size*cells,py=y/size*cells,cx=Math.floor(px),cy=Math.floor(py);let height=0,tone=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
      const gx=cx+dx,gy=cy+dy,r=hash(gx,gy),angle=r*Math.PI*2;
      const ux=px-gx-.2-.6*hash(gx+19,gy),uy=py-gy-.2-.6*hash(gx,gy+29);
      const along=ux*Math.cos(angle)+uy*Math.sin(angle),across=-ux*Math.sin(angle)+uy*Math.cos(angle);
      const ribbon=Math.max(0,1-Math.abs(across)/.24)*Math.max(0,1-(along/.75)**2);
      const value=Math.sqrt(ribbon)*(.45+.55*r);if(value>height){height=value;tone=r;}
    }
    const i=(y*size+x)*4;data[i]=Math.round(height*255);data[i+1]=Math.round((.30+.7*tone)*255);data[i+2]=Math.round((.45+.3*height)*255);data[i+3]=255;
  }
  const map=new DataTexture(data,size,size,RGBAFormat);map.wrapS=map.wrapT=RepeatWrapping;map.magFilter=LinearFilter;map.minFilter=LinearMipmapLinearFilter;map.generateMipmaps=true;map.anisotropy=8;map.needsUpdate=true;return map;
}

export function turfMaterial(pile:DataTexture,blade=false) {
  const material=enamel(0x43883d,.59),p=positionLocal,sample=texture(pile,p.xz.div(.16));
  material.clearcoat=.3;material.clearcoatRoughness=.37;
  const stripe=sin(p.z.mul(Math.PI/.22)).mul(.019);
  const edge=max(abs(p.x).sub(.992),abs(p.z).sub(1.532));
  const center=abs(p.xz.length().sub(.255)),halfway=abs(p.z);
  const boxX=abs(abs(p.x).sub(.40)),boxZ=abs(abs(p.z).sub(1.19));
  const penalty=abs(p.x).lessThan(.40).and(boxZ.lessThan(.003)).or(abs(p.z).greaterThan(1.19).and(boxX.lessThan(.003)));
  const paint=float(edge.greaterThan(0).or(center.lessThan(.0035)).or(halfway.lessThan(.0035)).or(penalty));
  const green=mix(vec3(.037,.13,.026),vec3(.13,.34,.063),sample.r.mul(.6).add(sample.g.mul(.4))).add(stripe);
  material.colorNode=mix(green,vec3(.86,.88,.68).mul(sample.r.mul(.18).add(.82)),paint);
  material.roughnessNode=sample.b.mul(.28).add(.42);
  if(!blade)material.normalNode=bumpMap(sample.r,float(.0012));
  return material;
}
