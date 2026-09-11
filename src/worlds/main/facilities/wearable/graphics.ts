import * as THREE from 'three/webgpu';
import {
  abs, attribute, atan, clamp, color, cos, float, fract, length, max, min,
  mix, mx_fractal_noise_float, mx_noise_float, positionLocal, pow,
  sin, smoothstep, step, uv, vec2, vec3,
} from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CollisionBox } from '../../../../facilities/collision.ts';
import {
  HEAD_WEARABLES, WEARABLE_TABLE, type HeadWearableIndex,
} from './physics.ts';
import { makeSwingWoodMaterial } from '../../../../graphics/shared/wood-material.ts';

/* ---------------------------------------------------------------- helpers */

function mulberry32(seed:number) {
  let a=seed>>>0;
  return ()=>{
    a|=0;a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

const rng=mulberry32(20250419);
const UP=new THREE.Vector3(0,1,0);
const ZERO=new THREE.Vector3();
const bakeRoot=new THREE.Group();

function tinted(geometry:THREE.BufferGeometry,tint:THREE.Color) {
  const count=geometry.attributes.position.count,values=new Float32Array(count*3);
  for(let i=0;i<count;i++){values[i*3]=tint.r;values[i*3+1]=tint.g;values[i*3+2]=tint.b;}
  geometry.setAttribute('aTint',new THREE.BufferAttribute(values,3));
  return geometry;
}

function bakeMesh(mesh:THREE.Mesh,geometries:THREE.BufferGeometry[],tint:THREE.Color,jitter=.06) {
  mesh.updateWorldMatrix(true,false);
  const geometry=mesh.geometry.clone();geometry.applyMatrix4(mesh.matrixWorld);
  tinted(geometry,tint.clone().multiplyScalar(1+(rng()*2-1)*jitter));geometries.push(geometry);
}

/* ------------------------------------------------------- source geometries */

function makePetalGeometry(length:number,width:number,segmentsWidth=7,segmentsLength=11) {
  const geometry=new THREE.PlaneGeometry(width,length,segmentsWidth,segmentsLength);
  geometry.translate(0,length*.5,0);
  const positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++) {
    const x0=positions.getX(i),y=positions.getY(i),t=Math.max(0,y/length);
    const outline=Math.pow(Math.max(0,Math.sin(Math.PI*Math.pow(t,.68))),.85);
    const x=x0*(.16+.84*outline);
    let z=x*x/(width*width)*.34*length;
    z+=Math.sin(t*Math.PI)*.08*length;z+=Math.pow(t,2)*.26*length;
    positions.setXYZ(i,x,y,z);
  }
  geometry.computeVertexNormals();return geometry;
}

function makeLeafGeometry(length:number,width:number,segmentsWidth=5,segmentsLength=9) {
  const geometry=new THREE.PlaneGeometry(width,length,segmentsWidth,segmentsLength);
  geometry.translate(0,length*.5,0);
  const positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++) {
    const x0=positions.getX(i),y=positions.getY(i),t=Math.max(0,y/length);
    const outline=Math.pow(Math.max(0,Math.sin(Math.PI*Math.pow(t,.60))),.9);
    const x=x0*(.06+.94*outline);
    let z=Math.abs(x)*.85;z+=Math.sin(t*Math.PI)*.10*length;
    positions.setXYZ(i,x,y,z);
  }
  geometry.computeVertexNormals();return geometry;
}

class VineCurve extends THREE.Curve<THREE.Vector3> {
  private readonly radius:number;
  private readonly tubeRadius:number;
  private readonly wraps:number;
  private readonly phase:number;
  constructor(radius:number,tubeRadius:number,wraps:number,phase:number) {
    super();this.radius=radius;this.tubeRadius=tubeRadius;this.wraps=wraps;this.phase=phase;
  }
  getPoint(t:number,target=new THREE.Vector3()) {
    const angle=t*Math.PI*2,wrap=t*this.wraps*Math.PI*2+this.phase;
    const ca=Math.cos(angle),sa=Math.sin(angle),offset=Math.cos(wrap)*this.tubeRadius;
    return target.set(ca*(this.radius+offset),Math.sin(wrap)*this.tubeRadius,sa*(this.radius+offset));
  }
}

function bendBrim(geometry:THREE.BufferGeometry) {
  const positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++) {
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
    const d=Math.max(0,z-.75)/.85;
    positions.setY(i,y+.16*Math.pow(d,1.9)+.015*d*Math.abs(x));
  }
}

/* ------------------------------------------------------------- materials */

const thin=(distance:Node<'float'>,width:number)=>smoothstep(width,width*2.2,distance).oneMinus();

function makePetalMaterial() {
  const material=new THREE.MeshPhysicalNodeMaterial({
    side:THREE.DoubleSide,roughness:.55,sheen:1,sheenRoughness:.42,
    sheenColor:new THREE.Color(0xffddcb),specularIntensity:.4,
  });
  const tint=attribute<'vec3'>('aTint','vec3'),u=uv(),p=positionLocal,t=u.y;
  const gradient=smoothstep(.05,.72,t);
  const base=tint.mul(.42).add(color(.105,.05,.058));
  let output=mix(base,tint,gradient);
  const vein=pow(abs(sin(u.x.sub(.5).mul(16).sub(t.mul(2.4)))),24)
    .mul(smoothstep(.10,.45,t)).mul(.15);
  output=output.mul(vein.oneMinus());
  output=output.add(mx_noise_float(p.mul(50)).mul(.03));
  output=output.add(smoothstep(0,.09,u.x.sub(.5).abs()).oneMinus().mul(.05));
  material.colorNode=output;
  material.roughnessNode=float(.58).sub(smoothstep(.55,1,t).mul(.20)).add(mx_noise_float(p.mul(90)).mul(.05));
  return material;
}

function makeLeafMaterial() {
  const material=new THREE.MeshPhysicalNodeMaterial({
    side:THREE.DoubleSide,roughness:.45,sheen:.5,sheenRoughness:.5,sheenColor:new THREE.Color(0xa9c07f),
  });
  const tint=attribute<'vec3'>('aTint','vec3'),u=uv(),p=positionLocal,mid=u.x.sub(.5).abs(),t=u.y;
  const body=tint.mul(smoothstep(0,1,t).mul(.45).add(.68));
  const midrib=smoothstep(.012,.05,mid).oneMinus();
  const side=pow(abs(sin(mid.mul(46).sub(t.mul(10)))),20).mul(smoothstep(.12,.55,t)).mul(.13);
  let output=body.add(midrib.mul(.14)).add(side).add(mx_noise_float(p.mul(30)).mul(.05));
  output=mix(output,output.mul(.78),smoothstep(.34,.5,mid));
  material.colorNode=output;material.roughnessNode=float(.45).add(mx_noise_float(p.mul(70)).mul(.10));
  return material;
}

function makeVineMaterial() {
  const material=new THREE.MeshPhysicalNodeMaterial({roughness:.72});
  const tint=attribute<'vec3'>('aTint','vec3'),u=uv(),p=positionLocal;
  const ridges=fract(u.x.mul(150)).mul(2).sub(1).abs();
  const shade=ridges.mul(ridges).mul(.20).add(.80);
  material.colorNode=mix(tint.mul(.55),tint.mul(1.18),shade).add(mx_noise_float(p.mul(45)).mul(.07));
  material.roughnessNode=float(.72).add(mx_noise_float(p.mul(35)).mul(.10));return material;
}

function makePollenMaterial() {
  const material=new THREE.MeshPhysicalNodeMaterial({roughness:.85});
  const tint=attribute<'vec3'>('aTint','vec3'),p=positionLocal;
  material.colorNode=tint.mul(mx_noise_float(p.mul(70)).mul(.35).add(.85)).add(mx_fractal_noise_float(p.mul(160)).mul(.05));
  return material;
}

function makeDomeMaterial() {
  const material=new THREE.MeshPhysicalNodeMaterial({
    roughness:.85,sheen:.55,sheenRoughness:.65,sheenColor:new THREE.Color(0xf4ecd8),
  });
  const u=uv(),p=positionLocal;
  const weave=sin(u.x.mul(360)).mul(sin(u.y.mul(560))),micro=mx_fractal_noise_float(p.mul(90));
  let output=mix(color(0xd8caa9),color(0xefe5cb),weave.mul(.5).add(.5).mul(.10).add(micro.mul(.5).add(.5).mul(.12)));
  const q=vec2(p.x,p.y.add(.06)).mul(7.2),radius=length(q),angle=atan(q.y,q.x);
  const emblemZone=smoothstep(.9,1.25,radius).oneMinus();
  const starLength=pow(abs(cos(angle.mul(2.5))),3).mul(.16).add(.34);
  const star=smoothstep(-.03,.03,starLength.sub(radius));
  const dash=step(.55,fract(angle.mul(1.909))),ring=thin(abs(radius.sub(.78)),.045).mul(dash);
  const emblem=clamp(star.mul(.95).add(ring),0,1).mul(emblemZone);
  output=mix(output,color(0x6e7d58),emblem);
  const seamFraction=fract(u.x.mul(6)),seamDistance=min(seamFraction,seamFraction.oneMinus());
  const seamFade=smoothstep(.70,.95,u.y).oneMinus();
  output=mix(output,output.mul(.90),thin(seamDistance,.022).mul(seamFade).mul(emblemZone));
  const stitch=thin(seamDistance,.0075).mul(step(.5,fract(u.y.mul(30)))).mul(seamFade).mul(emblemZone);
  output=mix(output,color(0xb49f72),stitch);
  const dashHeight=step(.5,fract(u.x.mul(220)));
  output=mix(output,color(0xb49f72),max(
    thin(abs(u.y.sub(.045)),.007),thin(abs(u.y.sub(.082)),.007),
  ).mul(dashHeight));
  material.colorNode=output;material.roughnessNode=float(.86).sub(weave.mul(.05)).add(micro.mul(.08));return material;
}

function makeBrimMaterial() {
  const material=new THREE.MeshPhysicalNodeMaterial({
    side:THREE.DoubleSide,roughness:.8,sheen:.5,sheenRoughness:.6,sheenColor:new THREE.Color(0xdfe4cf),
  });
  const p=positionLocal,w=sin(p.x.mul(110)).mul(sin(p.z.mul(110))),micro=mx_fractal_noise_float(p.mul(60));
  material.colorNode=mix(color(0x76845e),color(0x8b9970),w.mul(.5).add(.5).mul(.10).add(micro.mul(.5).add(.5).mul(.12)));
  material.roughnessNode=float(.80).sub(w.mul(.05)).add(micro.mul(.08));return material;
}

function makeThreadMaterial() {
  const material=new THREE.MeshPhysicalNodeMaterial({roughness:.62});
  material.colorNode=color(0xebe0c4).mul(sin(uv().x.mul(300)).mul(.5).add(.5).mul(.18).add(.86));return material;
}

function makeFeltMaterial() {
  const material=new THREE.MeshPhysicalNodeMaterial({
    roughness:.6,sheen:.9,sheenRoughness:.5,sheenColor:new THREE.Color(0x8d8070),
  });
  const p=positionLocal,fuzz=mx_fractal_noise_float(p.mul(150)),blotch=mx_fractal_noise_float(p.mul(7));
  material.colorNode=color(0x38322b).mul(blotch.mul(.5).add(.5).mul(.22).add(.90)).add(fuzz.mul(.015));
  material.roughnessNode=float(.60).add(fuzz.mul(.16));return material;
}

function makeSatinMaterial() {
  const material=new THREE.MeshPhysicalNodeMaterial({
    roughness:.3,sheen:1,sheenRoughness:.28,sheenColor:new THREE.Color(0x9c8c74),
  });
  const sheen=pow(sin(uv().x.mul(600)).mul(.5).add(.5),3).mul(.08);
  const dark=new THREE.Color(0x191512),highlight=new THREE.Color(0x8a7a63);
  material.colorNode=vec3(dark.r,dark.g,dark.b).add(vec3(highlight.r,highlight.g,highlight.b).mul(sheen));
  material.roughnessNode=clamp(float(.30).sub(sheen.mul(1.2)),.12,.5);return material;
}

function makeStandardPlain(hex:number,roughness:number,noiseScale:number,noiseAmount:number) {
  const material=new THREE.MeshStandardNodeMaterial({roughness:roughness});
  const noise=mx_fractal_noise_float(positionLocal.mul(noiseScale));
  material.colorNode=color(hex).mul(noise.mul(.5).add(.5).mul(noiseAmount).add(1-noiseAmount*.5));
  material.roughnessNode=float(roughness).add(noise.mul(.08));return material;
}

/* ------------------------------------------------------- reference assets */

function buildCrown(petalMaterial:THREE.Material,leafMaterial:THREE.Material,vineMaterial:THREE.Material,pollenMaterial:THREE.Material) {
  const radius=1.05,petalGeometries:THREE.BufferGeometry[]=[],centerGeometries:THREE.BufferGeometry[]=[];
  const leafGeometries:THREE.BufferGeometry[]=[],budGeometries:THREE.BufferGeometry[]=[];
  const coreGeometry=new THREE.TorusGeometry(radius,.062,18,160);coreGeometry.rotateX(Math.PI/2);
  const core=new THREE.Mesh(tinted(coreGeometry,new THREE.Color(0x4f3c2b)),vineMaterial);
  const firstVine=new THREE.Mesh(tinted(new THREE.TubeGeometry(new VineCurve(radius,.078,56,0),720,.030,8),new THREE.Color(0x8a6a45)),vineMaterial);
  const secondVine=new THREE.Mesh(tinted(new THREE.TubeGeometry(new VineCurve(radius,.078,56,Math.PI),720,.030,8),new THREE.Color(0x715637)),vineMaterial);
  const palette=[0xe08e86,0xf1e4cc,0xe8c274,0xd9776e].map(value=>new THREE.Color(value));
  const pollen=new THREE.Color(0xe0a83c),pollenDeep=new THREE.Color(0xb97f2a),budColor=new THREE.Color(0xc96a62);

  const buildFlower=(angle:number,scale:number,tint:THREE.Color)=>{
    const head=new THREE.Group(),out=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
    const face=out.clone().multiplyScalar(.62).addScaledVector(UP,.85).normalize();
    head.position.set(out.x*radius,Math.sin(angle*3.1)*.03,out.z*radius);
    head.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(ZERO,face.clone().negate(),UP));head.rotateZ(rng()*Math.PI*2);bakeRoot.add(head);
    const outer=makePetalGeometry(.36*scale,.245*scale,7,11),inner=makePetalGeometry(.23*scale,.17*scale,5,9);
    const ring=(geometry:THREE.BufferGeometry,count:number,pitch:number,ringRadius:number,z0:number)=>{
      for(let i=0;i<count;i++) {
        const mesh=new THREE.Mesh(geometry),ringAngle=i/count*Math.PI*2+(rng()-.5)*.18;
        mesh.position.set(Math.cos(ringAngle)*ringRadius,Math.sin(ringAngle)*ringRadius,z0);mesh.rotation.order='ZXY';
        mesh.rotation.set(pitch+(rng()-.5)*.16,0,ringAngle-Math.PI/2);head.add(mesh);bakeMesh(mesh,petalGeometries,tint);
      }
    };
    ring(outer,6,.30,.030*scale,.008*scale);ring(inner,5,.72,.012*scale,.020*scale);
    const centerGeometry=new THREE.SphereGeometry(.052*scale,14,10);centerGeometry.scale(1,1,.55);
    const center=new THREE.Mesh(centerGeometry);center.position.set(0,0,.045*scale);head.add(center);bakeMesh(center,centerGeometries,pollen,.04);
    const stamenGeometry=new THREE.SphereGeometry(.013*scale,8,6);
    for(let i=0;i<7;i++) {
      const stamen=new THREE.Mesh(stamenGeometry),stamenAngle=i/7*Math.PI*2;
      stamen.position.set(Math.cos(stamenAngle)*.035*scale,Math.sin(stamenAngle)*.035*scale,.058*scale);
      head.add(stamen);bakeMesh(stamen,centerGeometries,pollenDeep,.08);
    }
    bakeRoot.remove(head);
  };
  const buildBud=(angle:number)=>{
    const scale=.16+rng()*.07,holder=new THREE.Group(),out=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
    const direction=out.clone().multiplyScalar(.75).addScaledVector(UP,.5).normalize();
    holder.position.set(out.x*(radius-.01),Math.sin(angle*2+.7)*.02,out.z*(radius-.01));holder.quaternion.setFromUnitVectors(UP,direction);holder.rotateY(rng()*Math.PI*2);bakeRoot.add(holder);
    const points=[[.001,0],[.30,.06],[.62,.28],[.80,.62],[.66,.86],[.34,.98],[.001,1.04]].map(point=>new THREE.Vector2(point[0]*scale,point[1]*scale));
    const body=new THREE.Mesh(new THREE.LatheGeometry(points,12));holder.add(body);bakeMesh(body,budGeometries,budColor,.05);
    const sepal=makeLeafGeometry(scale*1.1,scale*.5,4,6);
    for(let k=0;k<3;k++) {
      const leaf=new THREE.Mesh(sepal);leaf.rotation.order='ZXY';leaf.rotation.set(.9,0,k*2.094);leaf.position.y=.02;holder.add(leaf);
      bakeMesh(leaf,leafGeometries,new THREE.Color().setHSL(.25,.38,.30),.08);
    }
    bakeRoot.remove(holder);
  };
  const buildRingLeaf=(angle:number)=>{
    const length=.5+rng()*.28,mesh=new THREE.Mesh(makeLeafGeometry(length,length*.46,5,9));
    const out=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle)),up=.15+rng()*.5-(rng()<.3?.45:0);
    const direction=out.clone().addScaledVector(UP,up).normalize();
    mesh.position.set(out.x*(radius-.02),Math.sin(angle*2.4)*.03-.01,out.z*(radius-.02));mesh.quaternion.setFromUnitVectors(UP,direction);mesh.rotateY(rng()*Math.PI*2);bakeRoot.add(mesh);
    bakeMesh(mesh,leafGeometries,new THREE.Color().setHSL(.23+rng()*.07,.30+rng()*.18,.30+rng()*.14),.04);bakeRoot.remove(mesh);
  };
  for(let i=0;i<7;i++)buildFlower((i+.35+rng()*.3)/7*Math.PI*2,.9+rng()*.45,palette[i%palette.length]);
  for(let i=0;i<5;i++)buildBud((i+.5)/5*Math.PI*2+.63);
  for(let i=0;i<16;i++)buildRingLeaf((i+rng())/16*Math.PI*2);
  const crown=new THREE.Group();
  const merge=(geometries:THREE.BufferGeometry[],material:THREE.Material,name:string)=>{
    const merged=mergeGeometries(geometries,false);if(!merged)throw new Error(`Unable to merge ${name} geometry`);
    const mesh=new THREE.Mesh(merged,material);mesh.name=`flower-crown-${name}`;mesh.castShadow=mesh.receiveShadow=true;crown.add(mesh);
  };
  merge(petalGeometries,petalMaterial,'petals');merge(centerGeometries,pollenMaterial,'pollen');merge(leafGeometries,leafMaterial,'leaves');merge(budGeometries,petalMaterial,'buds');
  [core,firstVine,secondVine].forEach((mesh,index)=>{mesh.name=`flower-crown-vine-${index}`;mesh.castShadow=mesh.receiveShadow=true;crown.add(mesh);});
  return crown;
}

function buildCap(domeMaterial:THREE.Material,brimMaterial:THREE.Material,threadMaterial:THREE.Material,brassMaterial:THREE.Material) {
  void brassMaterial;
  const cap=new THREE.Group();
  let domeGeometry=new THREE.SphereGeometry(1,64,36,0,Math.PI*2,0,2.06);domeGeometry.rotateY(-Math.PI/6);domeGeometry.scale(.985,.80,1);
  const dome=new THREE.Mesh(domeGeometry,domeMaterial);
  const bindingGeometry=new THREE.TorusGeometry(.878,.026,10,96);bindingGeometry.rotateX(Math.PI/2);
  const binding=new THREE.Mesh(bindingGeometry,brimMaterial);binding.position.y=-.375;
  const a=.86,capLength=1.60,half=THREE.MathUtils.degToRad(76),a0=Math.PI/2-half,a1=Math.PI/2+half,shape=new THREE.Shape();
  shape.absarc(0,0,a,a0,a1,false);shape.bezierCurveTo(-a*1.28,capLength*.55,-a*.62,capLength,0,capLength);shape.bezierCurveTo(a*.62,capLength,a*1.28,capLength,a*Math.cos(a0),a*Math.sin(a0));
  const brimGeometry=new THREE.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:true,bevelThickness:.02,bevelSize:.026,bevelSegments:3,curveSegments:48,steps:1});
  brimGeometry.rotateX(Math.PI/2);brimGeometry.translate(0,.0125,0);bendBrim(brimGeometry);
  const brim=new THREE.Mesh(brimGeometry,brimMaterial);brim.position.y=-.412;
  const points=shape.getPoints(120).map(point=>new THREE.Vector3(point.x,-.02,point.y));
  const pipeGeometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true,'catmullrom',.5),420,.016,8,true);
  bendBrim(pipeGeometry);const pipe=new THREE.Mesh(pipeGeometry,threadMaterial);pipe.position.y=-.412;
  const capOnly=new THREE.Group();capOnly.add(dome,binding,brim,pipe);capOnly.rotation.set(-.14,0,.05);
  [dome,binding,brim,pipe].forEach((mesh,index)=>{mesh.name=`baseball-cap-part-${index}`;mesh.castShadow=mesh.receiveShadow=true;});
  cap.add(capOnly);return cap;
}

function buildTopHat(feltMaterial:THREE.Material,satinMaterial:THREE.Material,linerMaterial:THREE.Material) {
  const hat=new THREE.Group();
  const brimPoints=[[.585,-.040],[.85,-.036],[1.10,-.026],[1.30,-.008],[1.43,.018],[1.51,.055],[1.555,.105],[1.565,.150],[1.55,.180],[1.52,.190],[1.47,.155],[1.40,.115],[1.30,.075],[1.15,.050],[.95,.038],[.75,.032],[.585,.030]].map(point=>new THREE.Vector2(point[0],point[1]));
  const brim=new THREE.Mesh(new THREE.LatheGeometry(brimPoints,128),feltMaterial);
  const crownPoints=[[.655,0],[.660,.05],[.652,.30],[.646,.70],[.648,1.05],[.656,1.25],[.660,1.34],[.652,1.42],[.630,1.475],[.595,1.510],[.550,1.528],[.500,1.536],[.440,1.538],[.360,1.534],[.260,1.530],[.160,1.528],[.080,1.528],[0,1.528]].map(point=>new THREE.Vector2(point[0],point[1]));
  const crown=new THREE.Mesh(new THREE.LatheGeometry(crownPoints,128),feltMaterial);
  const band=new THREE.Mesh(new THREE.CylinderGeometry(.6645,.6705,.235,96,1,true),satinMaterial);band.material.side=THREE.DoubleSide;band.position.y=.145;
  const linerGeometry=new THREE.CircleGeometry(.63,64);linerGeometry.rotateX(-Math.PI/2);const liner=new THREE.Mesh(linerGeometry,linerMaterial);liner.position.y=.05;
  hat.add(brim,crown,band,liner);hat.children.forEach((object,index)=>{object.name=`top-hat-part-${index}`;object.castShadow=object.receiveShadow=true;});return hat;
}

/* ----------------------------------------------------------- dressing table */

type WearableItem={root:THREE.Group;index:HeadWearableIndex};

/** A compact joiner's table plus the exact procedural assets from hat_assets. */
export class WearableTable {
  readonly group=new THREE.Group();
  readonly collisionBoxes:CollisionBox[]=[];
  readonly items:readonly WearableItem[];
  private readonly slot=new THREE.Vector3();
  private readonly spin=new THREE.Quaternion();

  constructor() {
    this.group.name='head-wearable-table';this.group.position.set(WEARABLE_TABLE.x,0,WEARABLE_TABLE.z);
    const timber=makeSwingWoodMaterial();
    const box=(name:string,width:number,height:number,depth:number,x:number,y:number,z:number)=>{
      const mesh=new THREE.Mesh(new RoundedBoxGeometry(width,height,depth,4,.0018),timber);mesh.name=name;mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;this.group.add(mesh);return mesh;
    };
    const topThickness=.008,legWidth=.012,legHeight=WEARABLE_TABLE.top-.001;
    box('wearable-tabletop',WEARABLE_TABLE.width,topThickness,WEARABLE_TABLE.depth,0,WEARABLE_TABLE.top-topThickness/2,0);
    for(const x of [-1,1])for(const z of [-1,1])box('wearable-table-leg',legWidth,legHeight,legWidth,x*(WEARABLE_TABLE.width/2-.012),legHeight/2,z*(WEARABLE_TABLE.depth/2-.012));
    for(const z of [-1,1])box('wearable-table-apron',WEARABLE_TABLE.width-.035,.012,.007,0,.044,z*(WEARABLE_TABLE.depth/2-.012));
    for(const x of [-1,1])box('wearable-table-apron',.007,.012,WEARABLE_TABLE.depth-.035,x*(WEARABLE_TABLE.width/2-.012),.044,0);
    const axisX=new THREE.Vector3(1,0,0),axisY=new THREE.Vector3(0,1,0),axisZ=new THREE.Vector3(0,0,1);
    this.collisionBoxes.push({
      center:new THREE.Vector3(WEARABLE_TABLE.x,WEARABLE_TABLE.top-topThickness/2,WEARABLE_TABLE.z),
      xAxis:axisX.clone(),yAxis:axisY.clone(),zAxis:axisZ.clone(),
      halfSize:new THREE.Vector3(WEARABLE_TABLE.width/2,topThickness/2,WEARABLE_TABLE.depth/2),
    });
    for(const x of [-1,1])for(const z of [-1,1])this.collisionBoxes.push({
      center:new THREE.Vector3(WEARABLE_TABLE.x+x*(WEARABLE_TABLE.width/2-.012),legHeight/2,WEARABLE_TABLE.z+z*(WEARABLE_TABLE.depth/2-.012)),
      xAxis:axisX.clone(),yAxis:axisY.clone(),zAxis:axisZ.clone(),
      halfSize:new THREE.Vector3(legWidth/2,legHeight/2,legWidth/2),
    });

    const petal=makePetalMaterial(),leaf=makeLeafMaterial(),vine=makeVineMaterial(),pollen=makePollenMaterial();
    const dome=makeDomeMaterial(),brim=makeBrimMaterial(),thread=makeThreadMaterial(),felt=makeFeltMaterial(),satin=makeSatinMaterial();
    const brass=makeStandardPlain(0xb6934f,.32,30,.15);brass.metalness=1;
    const liner=makeStandardPlain(0x241b13,.5,20,.3);
    const roots=[
      buildCrown(petal,leaf,vine,pollen),
      buildTopHat(felt,satin,liner),
      buildCap(dome,brim,thread,brass),
    ].map((content,index)=>{const root=new THREE.Group();root.name=HEAD_WEARABLES[index].id;root.add(content);this.group.add(root);return {root,index:index as HeadWearableIndex};});
    this.items=roots;
    for(const item of this.items)this.placeOnTable(item.index);
  }

  setWorn(index:HeadWearableIndex,parent:THREE.Group) {
    const item=this.items[index];parent.attach(item.root);item.root.visible=true;item.root.scale.setScalar(HEAD_WEARABLES[index].scale);
    item.root.updateWorldMatrix(true,true);
  }

  updateWorn(index:HeadWearableIndex,position:THREE.Vector3,orientation:THREE.Quaternion) {
    const item=this.items[index],wearable=HEAD_WEARABLES[index];
    item.root.position.copy(position);
    item.root.quaternion.copy(orientation);
    if(wearable.rotationY!==0) {
      this.spin.setFromAxisAngle(UP,wearable.rotationY);
      item.root.quaternion.multiply(this.spin);
    }
    item.root.scale.setScalar(wearable.scale);item.root.visible=true;
    item.root.updateWorldMatrix(true,true);
  }

  setOnTable(index:HeadWearableIndex) {this.placeOnTable(index);}

  reset() {for(const item of this.items)this.placeOnTable(item.index);}

  private placeOnTable(index:HeadWearableIndex) {
    const item=this.items[index],wearable=HEAD_WEARABLES[index];
    this.group.attach(item.root);this.slot.set(wearable.slotX,WEARABLE_TABLE.top+wearable.tableLift,0);
    item.root.position.copy(this.slot);item.root.rotation.set(0,wearable.rotationY,0);item.root.scale.setScalar(wearable.scale);item.root.visible=true;
    item.root.updateWorldMatrix(true,true);
  }

  dispose() {
    const materials=new Set<THREE.Material>(),seen=new Set<THREE.Object3D>();
    for(const root of [this.group,...this.items.map(item=>item.root)])root.traverse(object=>{
      if(seen.has(object))return;seen.add(object);
      if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}
    });
    materials.forEach(material=>material.dispose());for(const item of this.items)item.root.removeFromParent();this.group.removeFromParent();
  }
}
