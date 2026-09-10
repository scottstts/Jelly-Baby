import * as T from 'three/webgpu';
import { atan, cos, float, mix, sin, uniform, uv, vec3 } from 'three/tsl';
import { batch, disposeParts, enamel, part, rounded } from './toy-parts.ts';
import { closedTube, solidLoft } from './manufactured-geometry.ts';

export const HOME_PORTAL={x:0,z:-.255};
export class JellyPortal {
  readonly group=new T.Group();
  private readonly clock=uniform(0);
  private readonly ribbons=new T.Group();
  constructor(x:number,z:number,keepParts=false) {
    this.group.name='jelly-portal';
    this.group.position.set(x,.080,z);
    const material=new T.MeshPhysicalNodeMaterial({roughness:.19,clearcoat:1,metalness:.05,side:T.DoubleSide});
    const p=uv().sub(.5),radius=p.length(),angle=atan(p.y,p.x);
    const wave=sin(angle.mul(5).add(radius.mul(44)).sub(this.clock.mul(2.5))).mul(.5).add(.5);
    material.colorNode=mix(vec3(.12,.65,.58),mix(vec3(.92,.19,.38),vec3(.55,.26,.88),cos(angle.add(this.clock)).mul(.5).add(.5)),wave);
    material.emissiveNode=material.colorNode.mul(.14);
    material.roughnessNode=float(.15).add(wave.mul(.16));
    const membrane=part(this.group,new T.CylinderGeometry(.064,.064,.0016,96),material);membrane.rotation.x=Math.PI/2;membrane.name='vortex-membrane';
    const casing=new T.Group();casing.name='portal-casing';this.group.add(casing);
    const pearl=enamel(0xf4dcb1),brass=new T.MeshPhysicalNodeMaterial({color:0xc6a36d,metalness:.55,roughness:.3});
    // Matched inner/outer profiles own the aperture, front lip and back wall.
    const profile=[[.063,-.003],[.063,.003],[.065,.005],[.076,.005],[.079,.002],[.079,-.004],[.076,-.006],[.066,-.006]];
    const rings=Array.from({length:96},(_,i)=>{const a=i*Math.PI/48;return profile.map(([r,depth])=>[r*Math.cos(a),r*Math.sin(a),depth]);});
    part(casing,solidLoft(rings,true),pearl).name='aperture-housing';
    this.group.add(this.ribbons);
    for(let i=0;i<3;i++) {
      const phase=i*Math.PI*2/3;
      const path=Array.from({length:144},(_,j)=>{const a=j*Math.PI/72,r=.071+.0035*Math.cos(3*a+phase);return new T.Vector3(r*Math.cos(a),r*Math.sin(a),.007+.0035*Math.sin(3*a+phase));});
      part(this.ribbons,closedTube(path,.0022,10,true),enamel([0xff8296,0x78dfc6,0xc3a0ff][i])).name=`continuous-jelly-braid-${i}`;
    }
    for(const side of [-1,1]) {
      rounded(casing,[.038,.008,.032],pearl,side*.048,-.076,-.003,.003).name=`plinth-${side}`;
      rounded(casing,[.014,.022,.010],pearl,side*.048,-.062,-.009,.003).name=`housing-socket-${side}`;
      for(const dz of [-.013,.007])part(casing,new T.SphereGeometry(.002,10,8),brass,side*.048,-.071,dz).name=`socket-pin-${side}-${dz}`;
    }
    for(let i=0;i<12;i++) {
      const a=i*Math.PI/6;
      const jewel=part(casing,new T.SphereGeometry(.0012,10,8),brass,.077*Math.cos(a),.077*Math.sin(a),-.0045);jewel.name=`inlaid-rivet-${i}`;
    }
    casing.userData.keepParts=keepParts;batch(casing);
  }
  update(dt:number) {this.clock.value+=dt;this.ribbons.rotation.z+=dt*.38;}
  dispose(){disposeParts(this.group);}
}
