import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { positionLocal, vec3 } from 'three/tsl';
import { BED } from './physics.ts';
import { BedBlanket } from './blanket.ts';
import type { CollisionBox } from '../../../../facilities/collision.ts';
import { updateBlanketNormals } from './normals.ts';

/** Rounded oak cot, upholstered mattress, piped pillow and woven sage coverlet. */
export class Bed {
  readonly group=new THREE.Group();
  readonly boxes:CollisionBox[]=[];
  private readonly fabric:THREE.BufferGeometry;
  private readonly blanket:BedBlanket;
  private version=-1;
  constructor(blanket:BedBlanket){
    this.blanket=blanket;
    this.group.position.set(BED.x,0,BED.z);
    const wood=new THREE.MeshPhysicalNodeMaterial({color:'#bf986c',roughness:.46,clearcoat:.2});
    wood.colorNode=vec3(wood.color.r,wood.color.g,wood.color.b).mul(positionLocal.z.mul(3100).add(positionLocal.x.mul(90).sin().mul(2)).sin().mul(.045).add(.955));
    const cream=new THREE.MeshStandardNodeMaterial({color:'#f0e5ce',roughness:.94});
    const piping=new THREE.MeshStandardNodeMaterial({color:'#d5c49c',roughness:.85});
    const brass=new THREE.MeshStandardNodeMaterial({color:'#b48d4e',metalness:.72,roughness:.3});
    const fabric=new THREE.MeshPhysicalNodeMaterial({color:'#879b86',roughness:.96,sheen:.45,sheenColor:'#d1dec1',side:THREE.DoubleSide});
    const weave=positionLocal.x.mul(15000).sin().mul(positionLocal.z.mul(15000).sin()).mul(.024).add(.976);
    const stripe=positionLocal.x.mul(550).sin().smoothstep(.87,.96).mul(.11).add(.89);
    fabric.colorNode=vec3(fabric.color.r,fabric.color.g,fabric.color.b).mul(weave).mul(stripe);
    const box=(w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material,r=.002,collision=true)=>{
      const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,4,r),mat);mesh.position.set(x,y,z);this.group.add(mesh);
      if(collision)this.boxes.push({center:new THREE.Vector3(BED.x+x,y,BED.z+z),halfSize:new THREE.Vector3(w/2,h/2,d/2),xAxis:new THREE.Vector3(1,0,0),yAxis:new THREE.Vector3(0,1,0),zAxis:new THREE.Vector3(0,0,1)});
      return mesh;
    };
    for(const x of [-.050,.050])for(const z of [-.066,.066]){
      box(.010,.024,.010,x,.012,z,wood,.002);
      box(.0105,.004,.0105,x,.003,z,brass,.001,false);
    }
    for(const x of [-.052,.052])box(.008,.014,.142,x,.023,0,wood);
    for(const z of [-.069,.069])box(.106,.014,.008,0,.023,z,wood);
    for(let i=0;i<7;i++)box(.102,.004,.014,0,.025,-.058+i*.019,wood,.001,false);
    box(.106,.013,.136,0,.0295,0,cream,.005);
    box(.111,.039,.008,0,.046,-.073,wood,.004);
    box(.093,.022,.002,0,.047,-.0678,piping,.004,false);
    box(.112,.008,.012,0,.066,-.073,wood,.004);
    box(.111,.018,.008,0,.035,.073,wood,.003);
    const pillow=box(.072,.012,.031,0,.041,-.046,cream,.005,false);pillow.rotation.y=-.045;
    // Continuous inset piping belongs to the cushion, with softly rounded corners.
    const points:THREE.Vector3[]=[];
    for(let i=0;i<64;i++){const a=i/64*Math.PI*2;points.push(new THREE.Vector3(Math.sign(Math.cos(a))*Math.abs(Math.cos(a))**.4*.035,.041, -.046+Math.sign(Math.sin(a))*Math.abs(Math.sin(a))**.4*.0145));}
    this.group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),96,.00045,6,true),piping));
    this.fabric=new THREE.BufferGeometry();
    blanket.renderedPositions.set(blanket.positions);
    this.fabric.setAttribute('position',new THREE.BufferAttribute(blanket.renderedPositions,3).setUsage(THREE.DynamicDrawUsage));
    const indices:number[]=[];
    for(let z=0;z<blanket.rows-1;z++)for(let x=0;x<blanket.columns-1;x++){
      const a=z*blanket.columns+x,b=a+1,c=a+blanket.columns,d=c+1;indices.push(a,c,b,b,c,d);
    }
    this.fabric.setIndex(indices);this.fabric.computeVertexNormals();
    const cover=new THREE.Mesh(this.fabric,fabric);cover.frustumCulled=false;cover.userData.curvedShadowReceiver=true;this.group.add(cover);
    this.group.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=true;object.receiveShadow=true;}});
  }
  update(){if(this.version===this.blanket.renderVersion)return;this.version=this.blanket.renderVersion;this.fabric.attributes.position.needsUpdate=true;updateBlanketNormals(this.fabric,this.blanket.columns,this.blanket.rows);this.fabric.computeBoundingSphere();}
  dispose(){const materials=new Set<THREE.Material>();this.group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();materials.add(o.material as THREE.Material);}});materials.forEach(m=>m.dispose());this.group.removeFromParent();}
}
