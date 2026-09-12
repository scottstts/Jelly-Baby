import * as T from 'three/webgpu';
import type Node from 'three/src/nodes/core/Node.js';
import { float, max, mix, positionLocal, smoothstep, vec3 } from 'three/tsl';
import { batch, disposeParts, enamel, part } from '../../graphics/shared/toy-parts.ts';
import { closedTube, moldedBox, solidLoft } from '../../graphics/shared/manufactured-geometry.ts';
import { FIELD, GOAL, ENTRANCE, FIELD_RAMP, soccerBox } from './layout.ts';
import type { CollisionBox } from '../../facilities/collision.ts';
import { stadiumEntrance } from './entrance.ts';
import { formedProfile } from './craft.ts';
import { plasticPileTexture, turfMaterial } from './turf.ts';

/** Named manufactured solids survive until audit; runtime batches by finish. */
export class SoccerStadium {
  readonly group=new T.Group();
  readonly boxes:CollisionBox[]=[];
  readonly staticParts=new T.Group();
  readonly turf:T.Mesh;
  readonly scoreboard=new T.Group();
  private readonly digits:T.Mesh[][]=[];
  private readonly pile=plasticPileTexture();
  constructor(keepParts=false) {
    this.group.name='soccer-stadium';this.staticParts.name='stadium-parts';this.staticParts.userData.keepParts=keepParts;this.group.add(this.staticParts);
    const cream=enamel(0xf5e6c5,.33),blue=enamel(0x23559c,.29),seatBlue=enamel(0x4688c8,.4),gold=enamel(0xeabf57,.34),coral=enamel(0xdb6755),net=enamel(0xe9e2cd,.7);
    const addBox=(name:string,size:number[],x:number,y:number,z:number,material:T.Material=cream,r=.004,collision=false)=>{
      const mesh=part(this.staticParts,moldedBox(size,r),material,x,y,z);mesh.name=name;
      if(collision)this.boxes.push(soccerBox(x,y,z,...size as [number,number,number]));return mesh;
    };
    // The felt slab is 2 x 3.08 m; paint belongs to its material, never stacked coplanar decals.
    this.turf=part(this.group,moldedBox([FIELD.width,.010,FIELD.length],.001),turfMaterial(this.pile),0,.007,0);this.turf.name='two-metre-pitch';
    this.boxes.push(soccerBox(0,.007,0,2,.010,3.08));
    addBox('pitch-undertray',[2.035,.001,3.08],0,.0015,0,blue,.0003);
    const rampProfile=[[.001,FIELD_RAMP.start],[FIELD.y,FIELD_RAMP.start],[.001,FIELD_RAMP.end]];
    part(this.staticParts,solidLoft([-1,1].map(side=>rampProfile.map(([y,z])=>[FIELD_RAMP.x+side*FIELD_RAMP.width/2,y,z]))),cream).name='field-access-ramp';
    // Thin tilted tread segments match the visible ramp, avoiding a broad
    // wedge AABB that would itself form an invisible vertical step.
    for(let i=0;i<12;i++) {
      const z=FIELD_RAMP.start+(i+.5)/12*.16,y=FIELD.y-(z-FIELD_RAMP.start)/.16*.011,angle=Math.atan(.011/.16);
      const box=soccerBox(FIELD_RAMP.x,y-.0007,z,FIELD_RAMP.width,.0014,.16/12+.001);
      Object.assign(box.yAxis,{x:0,y:Math.cos(angle),z:Math.sin(angle)});Object.assign(box.zAxis,{x:0,y:-Math.sin(angle),z:Math.cos(angle)});box.margin=.00035;this.boxes.push(box);
    }
    // Separate end and side banks with authored corner reveals. Lower boarding is continuous except goals/entry.
    for(const side of [-1,1]) {
      addBox(`side-board-${side}`,[.024,.105,3.10],side*1.022,.0645,0,blue,.005,true);
      addBox(`outer-side-${side}`,[.045,.30,ENTRANCE.z+1.915],side*1.393,.151,(ENTRANCE.z-1.835)/2,cream,.009,true);
      for(let row=0;row<4;row++) {
        const inner=1.057+row*.075,outer=inner+.072,y=.049+row*.056;
        // Terraces have owned solid risers, tread and underside: one extruded profile per row.
        addBox(`side-terrace-${side}-${row}`,[outer-inner,y-.002,3.18],side*(inner+outer)/2,y/2+.001,0,cream,.0015,true);
        for(let seat=0;seat<36;seat++) {
          if(seat%10===0)continue; // Four clear aisle lanes.
          const x=side*(inner+.034),z=-1.52+seat*.087;
          const shell=part(this.staticParts,this.seatGeometry(),row%2?blue:seatBlue,x,y-.003,z);shell.rotation.y=side*Math.PI/2;shell.name=`side-seat-${side}-${row}-${seat}`;
          this.seatCollision(x,y-.003,z,shell.rotation.y);
        }
        for(let aisle=0;aisle<4;aisle++)addBox(`side-step-${side}-${row}-${aisle}`,[.061,.004,.032],side*(inner+.036),y+.002,-1.52+aisle*.87,gold,.001);
      }
      // Thin molded canopy over the outer seats; keyed into the perimeter wall.
      addBox(`side-canopy-${side}`,[.22,.015,3.54],side*1.305,.3085,0,blue,.005,true);
      addBox(`canopy-trim-${side}`,[.008,.012,3.50],side*1.191,.307,0,gold,.002);
    }
    for(const end of [-1,1]) {
      const sections=end===-1?[[-1.034,-GOAL.width/2],[GOAL.width/2,1.034]]:[[-1.034,-GOAL.width/2],[GOAL.width/2,ENTRANCE.x-ENTRANCE.width/2],[ENTRANCE.x+ENTRANCE.width/2,1.034]];
      for(const [index,[a,b]] of sections.entries())addBox(`end-board-${end}-${index}`,[b-a,.105,.024],(a+b)/2,.0645,end*1.562,blue,.004,true);
      const spans=end===-1?[{x:0,width:2.69}]:[{x:-.4975,width:1.695},{x:1.0975,width:.495}];
      for(const [section,span] of spans.entries()) {
        addBox(`end-wall-${end}-${section}`,[span.width,.30,.04],span.x,.151,end===1?ENTRANCE.z: -1.90,cream,.008,true);
        for(let row=0;row<3;row++) {
          const z=end*(end===1?ENTRANCE.z-.26+row*.079:1.65+row*.079),y=.052+row*.067;
          // The scoring net occupies the middle of the first two far banks.
          // Its pocket is a real opening, shared by terrace and seat placement.
          const banks=end===-1&&row<2?[{x:-.7925,width:1.105},{x:.7925,width:1.105}]:[span];
          for(const [bankIndex,bank] of banks.entries()) {
          addBox(`end-terrace-${end}-${section}-${row}-${bankIndex}`,[bank.width,y,.076],bank.x,y/2+.002,z,cream,.003,true);
          const count=Math.floor(bank.width/.087);
          for(let seat=0;seat<count;seat++) {
            if(seat%8===0)continue;
            const shell=part(this.staticParts,this.seatGeometry(),row%2?seatBlue:blue,bank.x-bank.width/2+.045+seat*.087,y-.001,z);
            shell.rotation.y=end===-1?Math.PI:0;shell.name=`end-seat-${end}-${section}-${row}-${bankIndex}-${seat}`;
            this.seatCollision(shell.position.x,shell.position.y,shell.position.z,shell.rotation.y);
          }
          }
        }
        addBox(`end-canopy-${end}-${section}`,[span.width,.015,.13],span.x,.3085,end===1?ENTRANCE.z-.045:-1.855,blue,.005,true);
      }
    }
    stadiumEntrance(this.staticParts,this.boxes,cream,blue,gold,coral);
    // Goals are rounded continuous U frames; strings are closed tubes with declared knotted joins.
    for(const end of [-1,1])this.goal(end,net);
    // A restrained scoreboard mounted on two feet above the far canopy.
    for(const x of [-.18,.18])addBox(`score-support-${x}`,[.012,.045,.018],x,.3385,-1.905,gold,.002,true);
    addBox('scoreboard-shell',[.48,.13,.030],0,.426,-1.905,blue,.007,true);
    addBox('scoreboard-inset',[.444,.094,.004],0,.426,-1.887,cream,.002);
    this.scoreboard.name='score-digits';this.group.add(this.scoreboard);
    for(const digit of [-1,1]) {
      const segments:T.Mesh[]=[];
      for(const [index,[x,y,horizontal]] of [[0,.029,1],[.021,.0145,0],[.021,-.0145,0],[0,-.029,1],[-.021,-.0145,0],[-.021,.0145,0],[0,0,1]].entries()) {
        const mesh=part(this.scoreboard,moldedBox(horizontal?[.031,.005,.002]:[.005,.021,.002],.0008),blue,digit*.036+x,.426+y,-1.883);mesh.name=`digit-${digit}-segment-${index}`;segments.push(mesh);
      }
      this.digits.push(segments);
    }
    this.setScore(0);
    this.makeFibers();batch(this.staticParts);
  }
  private seatGeometry() {
    // One formed L shell, 3 mm thick, with a curved knee instead of intersecting boxes.
    const profile=[[-.027,.003],[.014,.003],[.020,.006],[.024,.012],[.027,.039],[.024,.040],[.021,.013],[.017,.008],[.012,.006],[-.027,.006]];
    return formedProfile(profile,.054,.0006);
  }
  private seatCollision(x:number,y:number,z:number,yaw:number) {
    // Tread and upright remain separate; never fill the air above the seat pan.
    for(const [cy,cz,sy,sz] of [[.0045,-.005,.003,.045],[.024,.023,.030,.006]]) {
      const box=soccerBox(x+Math.sin(yaw)*cz,y+cy,z+Math.cos(yaw)*cz,.054,sy,sz);
      Object.assign(box.xAxis,{x:Math.cos(yaw),y:0,z:-Math.sin(yaw)});Object.assign(box.zAxis,{x:Math.sin(yaw),y:0,z:Math.cos(yaw)});box.margin=.0007;this.boxes.push(box);
    }
  }
  setScore(score:number) {
    const masks=[0b0111111,0b0000110,0b1011011,0b1001111,0b1100110,0b1101101,0b1111101,0b0000111,0b1111111,0b1101111];
    const value=Math.min(99,score).toString().padStart(2,'0');
    this.digits.forEach((segments,i)=>segments.forEach((segment,j)=>{segment.visible=!!(masks[Number(value[i])]&(1<<j));}));
  }
  private goal(end:number,material:T.Material) {
    const w=GOAL.width/2,h=GOAL.height,y=FIELD.y,z=end*FIELD.length/2;
    part(this.staticParts,moldedBox([GOAL.width+.016,.010,GOAL.depth],.001),enamel(0x44843f,.75),0,.007,z+end*GOAL.depth/2).name=`goal-floor-${end}`;
    part(this.staticParts,moldedBox([GOAL.width+.016,.001,GOAL.depth],.0003),material,0,.0015,z+end*GOAL.depth/2).name=`goal-undertray-${end}`;
    const frame=[[-w,y,z],[-w,y+h-.014,z],[-w+.004,y+h-.004,z],[-w+.014,y+h,z],[w-.014,y+h,z],[w-.004,y+h-.004,z],[w,y+h-.014,z],[w,y,z]];
    part(this.staticParts,closedTube(frame.map(p=>new T.Vector3(...p)),GOAL.post,12),material).name=`goal-frame-${end}`;
    for(let i=1;i<frame.length;i++) {
      const a=new T.Vector3(...frame[i-1]),b=new T.Vector3(...frame[i]),direction=b.clone().sub(a),center=a.clone().add(b).multiplyScalar(.5);
      const box=soccerBox(center.x,center.y,center.z,GOAL.post*2,direction.length()+.001,GOAL.post*2);
      direction.normalize();Object.assign(box.yAxis,direction);Object.assign(box.xAxis,{x:direction.y,y:-direction.x,z:0});box.margin=.0005;this.boxes.push(box);
    }
    this.boxes.push(soccerBox(0,.007,z+end*GOAL.depth/2,GOAL.width+.016,.010,GOAL.depth));
    const rear=z+end*GOAL.depth;
    // Fine mesh holes are too small for the jelly: thin net sheets preserve
    // the open goal mouth without replacing the entire goal with a solid box.
    for(const box of [soccerBox(0,y+h/2,rear,GOAL.width,h,.0014),soccerBox(-w,y+h/2,(z+rear)/2,.0014,h,GOAL.depth),soccerBox(w,y+h/2,(z+rear)/2,.0014,h,GOAL.depth),soccerBox(0,y+h,(z+rear)/2,GOAL.width,.0014,GOAL.depth)]){box.margin=.0007;this.boxes.push(box);}
    // A recessed net owns its depth; the nearest strings anchor just behind the front frame.
    for(let i=1;i<28;i++) {
      const x=-w+i*GOAL.width/28;
      const points=[[x,y+.002,rear],[x,y+h-.003,rear],[x,y+h-.003,z+end*.007]];
      part(this.staticParts,closedTube(points.map(p=>new T.Vector3(...p)),.0007,6),material).name=`net-long-${end}-${i}`;
    }
    for(let i=0;i<=10;i++) {
      const height=y+.003+i*(h-.006)/10;
      part(this.staticParts,closedTube([new T.Vector3(-w,height,z+end*.007),new T.Vector3(-w,height,rear),new T.Vector3(w,height,rear),new T.Vector3(w,height,z+end*.007)],.0007,6),material).name=`net-cross-${end}-${i}`;
    }
  }
  private makeFibers() {
    // Deterministic extruded triangular plastic fibers. Batched explicitly because
    // shared shadow proxies operate on ordinary meshes, not instance transforms.
    const positions:number[]=[],normals:number[]=[];let seed=419;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const a=new T.Vector3(),b=new T.Vector3(),n=new T.Vector3();
    for(let i=0;i<26000;i++) {
      const x=(random()-.5)*1.98,z=(random()-.5)*3.06,y=FIELD.y+.00005,h=.0013+random()*.0017,angle=random()*Math.PI*2,r=.00035;
      // Keep painted lines readable by leaving their fibers the same cream as the substrate.
      const vertices=Array.from({length:3},(_,j)=>[x+Math.cos(angle+j*2*Math.PI/3)*r,y,z+Math.sin(angle+j*2*Math.PI/3)*r]);vertices.push([x+.00035*Math.sin(angle),y+h,z+.00035*Math.cos(angle)]);
      for(const face of [[0,1,2],[0,3,1],[1,3,2],[2,3,0]]) {
        a.fromArray(vertices[face[1]]).sub(b.fromArray(vertices[face[0]]));b.fromArray(vertices[face[2]]).sub(n.fromArray(vertices[face[0]]));n.crossVectors(a,b).normalize();
        for(const index of face){positions.push(...vertices[index]);normals.push(n.x,n.y,n.z);}
      }
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
    const mesh=part(this.group,geometry,turfMaterial(this.pile,true));mesh.name='plastic-turf-fibers';mesh.userData.aggregate=true;
  }
  dispose(){disposeParts(this.group);this.pile.dispose();}
}

export function soccerBallGeometry() {return new T.SphereGeometry(.021,40,28);}
export function soccerBallMaterial() {
  const material=enamel(0xfff4dc,.48),p=positionLocal.normalize(),phi=(1+Math.sqrt(5))/2;
  const vertices:number[][]=[];for(const a of [-1,1])for(const b of [-1,1])vertices.push([0,a,b*phi],[a,b*phi,0],[b*phi,0,a]);
  let pentagon:Node<'float'>=float(-1),hexagon:Node<'float'>=float(-1),second:Node<'float'>=float(-1);
  const ico=new T.IcosahedronGeometry(1),ip=ico.attributes.position;
    for(const v of vertices){const n=new T.Vector3(...v).normalize(),dot=p.dot(vec3(n.x,n.y,n.z)).toVar();second=max(second,pentagon.min(dot)).toVar();pentagon=max(pentagon,dot).toVar();}
    for(let i=0;i<ip.count;i+=3){const n=new T.Vector3();for(let j=0;j<3;j++)n.add(new T.Vector3().fromBufferAttribute(ip,i+j));n.normalize();const dot=p.dot(vec3(n.x,n.y,n.z)).add(.015).toVar();second=max(second,hexagon.min(dot)).toVar();hexagon=max(hexagon,dot).toVar();}
  ico.dispose();second=max(second,pentagon.min(hexagon));
  const seam=smoothstep(.001,.006,max(pentagon,hexagon).sub(second));
  const panels=mix(vec3(.90,.86,.73),vec3(.017,.026,.038),float(pentagon.greaterThan(hexagon)));
  material.colorNode=mix(vec3(.12,.14,.13),panels,seam);return material;
}
