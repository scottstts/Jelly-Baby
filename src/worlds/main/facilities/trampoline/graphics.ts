import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRAMPOLINE } from './physics.ts';

/** Small upholstered rebounder with a stitched bed, coil springs and tubular legs. */
export class Trampoline {
  readonly group=new THREE.Group();
  private readonly bed:THREE.Mesh;
  private readonly weights:number[]=[];
  private lastCompression=NaN;
  constructor() {
    this.group.position.set(TRAMPOLINE.x,0,TRAMPOLINE.z);
    const pad=new THREE.MeshPhysicalNodeMaterial({color:'#a3ae7c',roughness:.72,clearcoat:.06});
    const fabric=new THREE.MeshStandardNodeMaterial({color:'#465144',roughness:.94,side:THREE.DoubleSide});
    const metal=new THREE.MeshStandardNodeMaterial({color:'#c0b394',metalness:.75,roughness:.32});
    const rubber=new THREE.MeshStandardNodeMaterial({color:'#687157',roughness:.85});
    const thread=new THREE.MeshStandardNodeMaterial({color:'#e1d5b0',roughness:.9});
    const seam=new THREE.MeshStandardNodeMaterial({color:'#869368',roughness:.95});
    const legFinish=new THREE.MeshStandardNodeMaterial({color:'#b5ad91',metalness:.55,roughness:.46});
    const ring=(radius:number,tube:number,y:number,material:THREE.Material,arc=Math.PI*2,start=0)=>{
      const mesh=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,10,64,arc),material);
      mesh.rotation.x=Math.PI/2;mesh.rotation.z=start;mesh.position.y=y;this.group.add(mesh);return mesh;
    };
    ring(.093,.0035,TRAMPOLINE.height-.005,metal);
    // Closed upholstered annulus: a broad crown, rounded shoulders and a real
    // underside. Stitch lines sit on the cushion instead of cutting holes in it.
    const cushionProfile=(angle:number)=>new THREE.Vector2(
      TRAMPOLINE.rimMajorRadius+TRAMPOLINE.rimMinorRadius*Math.sign(Math.cos(angle))*Math.abs(Math.cos(angle))**.55,
      TRAMPOLINE.height+TRAMPOLINE.rimCenterOffset+TRAMPOLINE.rimHalfHeight*Math.sign(Math.sin(angle))*Math.abs(Math.sin(angle))**.65,
    );
    const profile=Array.from({length:49},(_,i)=>cushionProfile(i/48*Math.PI*2));
    profile[48]=profile[0].clone();
    const cushion=new THREE.Mesh(new THREE.LatheGeometry(profile,128),pad);
    cushion.name='trampoline-cushion';this.group.add(cushion);
    for(let i=0;i<8;i++) {
      const angle=i*Math.PI/4,points:THREE.Vector3[]=[];
      for(let j=0;j<=24;j++) {
        const p=cushionProfile(j/24*Math.PI);
        points.push(new THREE.Vector3(Math.cos(angle)*p.x,p.y+.00012,Math.sin(angle)*p.x));
      }
      const stitching=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,.00018,5,false),seam);
      this.group.add(stitching);
    }
    ring(.0812,.00045,TRAMPOLINE.height+.003,thread);
    ring(.1008,.00045,TRAMPOLINE.height+.003,thread);
    const vertices:number[]=[],indices:number[]=[],uvs:number[]=[],segments=64,rings=16;
    for(let r=0;r<=rings;r++)for(let s=0;s<=segments;s++) {
      const f=r/rings,a=s/segments*Math.PI*2;
      vertices.push(Math.cos(a)*TRAMPOLINE.matRadius*f,TRAMPOLINE.height,Math.sin(a)*TRAMPOLINE.matRadius*f);
      uvs.push(.5+Math.cos(a)*f*.5,.5+Math.sin(a)*f*.5);
      const t=Math.max(0,Math.min(1,(f-.55)/.45));this.weights.push(1-t*t*(3-2*t));
      if(r<rings&&s<segments){const k=r*(segments+1)+s;indices.push(k,k+1,k+segments+1,k+1,k+segments+2,k+segments+1);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    this.bed=new THREE.Mesh(geometry,fabric);this.group.add(this.bed);
    ring(TRAMPOLINE.matRadius,.001,TRAMPOLINE.height,thread);
    for(let i=0;i<32;i++) {
      const angle=i/32*Math.PI*2,points:THREE.Vector3[]=[];
      for(let j=0;j<=48;j++) {
        const t=j/48,r=.076+t*.014,coil=t*Math.PI*10;
        const tangent=Math.sin(coil)*.0012;
        points.push(new THREE.Vector3(Math.cos(angle)*r-Math.sin(angle)*tangent,TRAMPOLINE.height+Math.cos(coil)*.0012,Math.sin(angle)*r+Math.cos(angle)*tangent));
      }
      const coil=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),48,.00045,5,false),metal);this.group.add(coil);
    }
    // Molded saddle feet have flat soles and a concave channel fitted around
    // the bottom tube. The profile is extruded along the tube, not a scaled ball.
    const saddle=new THREE.Shape();
    saddle.moveTo(-.0055,.00045);saddle.lineTo(.0055,.00045);
    saddle.lineTo(.0055,.007);saddle.quadraticCurveTo(.0055,.008,.0045,.008);
    saddle.lineTo(.004,.008);saddle.quadraticCurveTo(.0034,.008,.0034,.006);
    saddle.absarc(0,.006,.0034,0,Math.PI,true);
    saddle.quadraticCurveTo(-.0034,.008,-.004,.008);saddle.lineTo(-.0045,.008);
    saddle.quadraticCurveTo(-.0055,.008,-.0055,.007);saddle.closePath();
    const footGeometry=new THREE.ExtrudeGeometry(saddle,{depth:.013,steps:1,curveSegments:12,bevelEnabled:true,bevelSize:.00035,bevelThickness:.00035,bevelSegments:2});
    footGeometry.translate(0,0,-.0065);
    for(let i=0;i<3;i++) {
      const a=i*Math.PI*2/3,halfSpan=.027,radial=Math.sqrt(.093**2-halfSpan**2);
      const point=(u:number,y:number)=>new THREE.Vector3(Math.cos(a)*radial-Math.sin(a)*u,y,Math.sin(a)*radial+Math.cos(a)*u);
      // Planar U-hoops: straight uprights/rungs with tangent rounded corners.
      const path=new THREE.CurvePath<THREE.Vector3>();
      path.add(new THREE.LineCurve3(point(-halfSpan,.038),point(-halfSpan,.013)));
      path.add(new THREE.QuadraticBezierCurve3(point(-halfSpan,.013),point(-halfSpan,.006),point(-.020,.006)));
      path.add(new THREE.LineCurve3(point(-.020,.006),point(.020,.006)));
      path.add(new THREE.QuadraticBezierCurve3(point(.020,.006),point(halfSpan,.006),point(halfSpan,.013)));
      path.add(new THREE.LineCurve3(point(halfSpan,.013),point(halfSpan,.038)));
      const leg=new THREE.Mesh(new THREE.TubeGeometry(path,64,.0032,12,false),legFinish);
      leg.name='trampoline-leg';this.group.add(leg);
      for(const u of [-halfSpan,halfSpan]) {
        const collar=new THREE.Mesh(new THREE.CylinderGeometry(.0044,.0044,.009,16),legFinish);
        collar.position.copy(point(u,.032));this.group.add(collar);
        const bolt=new THREE.Mesh(new THREE.CylinderGeometry(.00135,.00135,.001,12),metal);
        bolt.position.copy(point(u,.031)).add(new THREE.Vector3(Math.cos(a)*.0043,0,Math.sin(a)*.0043));
        bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(Math.cos(a),0,Math.sin(a)));this.group.add(bolt);
      }
      for(const u of [-.014,.014]) {
        const foot=new THREE.Mesh(footGeometry,rubber);
        foot.name='trampoline-foot';foot.rotation.y=-a;foot.position.copy(point(u,0));this.group.add(foot);
      }
    }
    this.mergeStaticMeshes();
    this.update(0);
  }
  private mergeStaticMeshes() {
    const byMaterial=new Map<THREE.Material,THREE.BufferGeometry[]>();
    const semanticNames=new Map<THREE.Material,string>();
    const staticMeshes:THREE.Mesh[]=[];
    for(const child of [...this.group.children]){
      if(!(child instanceof THREE.Mesh)||child===this.bed)continue;
      child.updateMatrix();
      const geometry=child.geometry.clone().applyMatrix4(child.matrix);
      const material=Array.isArray(child.material)?child.material[0]:child.material;
      let geometries=byMaterial.get(material);
      if(!geometries){geometries=[];byMaterial.set(material,geometries);}
      if(child.name)semanticNames.set(material,child.name);
      geometries.push(geometry);staticMeshes.push(child);
    }
    for(const mesh of staticMeshes){
      this.group.remove(mesh);mesh.geometry.dispose();
    }
    for(const [material,geometries] of byMaterial){
      const geometry=mergeGeometries(geometries);
      if(!geometry)throw new Error('Trampoline static geometry attributes cannot be merged');
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,material);
      mesh.name=semanticNames.get(material)??'trampoline-static';this.group.add(mesh);
      for(const source of geometries)source.dispose();
    }
  }
  update(compression:number) {
    if(compression===this.lastCompression)return;this.lastCompression=compression;
    const geometry=this.bed.geometry,position=geometry.attributes.position;
    for(let i=0;i<position.count;i++)position.setY(i,TRAMPOLINE.height+compression*this.weights[i]);
    position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
  }
  dispose() {
    const materials=new Set<THREE.Material>();
    this.group.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();materials.add(object.material as THREE.Material);}});
    materials.forEach(material=>material.dispose());
  }
}
