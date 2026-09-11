import * as THREE from 'three/webgpu';
import type { FaceSkin } from './face-skin.ts';

/** A thin wet membrane, attached at the nose, inflated by a damped breathing mode. */
export class SleepBubble {
  private readonly mesh:THREE.Mesh;
  private radius=0;
  private speed=0;
  private readonly sample=new Float64Array(6);
  private readonly normal=new THREE.Vector3();
  private readonly axis=new THREE.Vector3(0,0,1);
  constructor(group:THREE.Group){
    const geometry=new THREE.SphereGeometry(1,32,24);
    // Narrow the attached pole into a neck; the far end retains a round meniscus.
    const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++){const z=p.getZ(i),neck=.64+.36*(z+1)/2;p.setXYZ(i,p.getX(i)*neck,p.getY(i)*neck,z+1);}
    geometry.computeVertexNormals();
    const material=new THREE.MeshPhysicalNodeMaterial({color:'#e3f1d4',transparent:true,opacity:.34,roughness:.055,metalness:0,ior:1.335,clearcoat:1,clearcoatRoughness:.025,iridescence:.22,iridescenceIOR:1.335,iridescenceThicknessRange:[120,240],depthWrite:false});
    this.mesh=new THREE.Mesh(geometry,material);this.mesh.name='sleep-bubble';this.mesh.renderOrder=3;this.mesh.frustumCulled=false;this.mesh.visible=false;group.add(this.mesh);
  }
  reset(){this.radius=0;this.speed=0;this.mesh.visible=false;}
  update(dt:number,sleep:number,time:number,skin:FaceSkin){
    const target=sleep*(.0035+.0024*(.5+.5*Math.sin(time*Math.PI*2/3.8-.5)));
    const steps=Math.max(1,Math.ceil(dt/(1/120))),h=Math.min(dt,.05)/steps;
    for(let i=0;i<steps;i++){this.speed+=(90*(target-this.radius)-16*this.speed)*h;this.radius=Math.max(0,this.radius+this.speed*h);}
    this.mesh.visible=this.radius>.00008;if(!this.mesh.visible)return;
    skin.sample(.0027,.042,.00035,this.sample);
    this.mesh.position.set(this.sample[0],this.sample[1],this.sample[2]);
    this.normal.set(this.sample[3],this.sample[4],this.sample[5]);this.mesh.quaternion.setFromUnitVectors(this.axis,this.normal);
    const wobble=Math.max(-.08,Math.min(.08,this.speed*5));
    this.mesh.scale.set(this.radius*(1+wobble),this.radius*(1-wobble),this.radius*1.18);
  }
}
