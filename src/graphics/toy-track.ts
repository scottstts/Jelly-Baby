import * as T from 'three/webgpu';
import { batch, disposeParts, enamel, part, rod, rounded } from './toy-parts.ts';
import { box, obstacles, trackCurve, trackPoint, TRACK_WIDTH, ROAD_HEIGHT, CURB_HEIGHT } from '../game/toy-track-layout.ts';
import { makeToyRoad } from './toy-road.ts';
import { turned } from './manufactured-geometry.ts';
import type { CollisionBox } from '../physics/facility-collision.ts';

/** A manufactured ribbon with inset seams, contrasting rolled edges and tabletop props. */
export class ToyTrack {
  readonly group=new T.Group();
  readonly boxes:CollisionBox[]=[];
  readonly obstacleBoxes:CollisionBox[]=[];
  constructor(keepParts=false) {
    this.group.name='toy-track';this.group.userData.keepParts=keepParts;
    const coral=enamel(0xe7917f),cream=enamel(0xffecc5),ink=enamel(0x38555b),gold=enamel(0xd8b36c);
    makeToyRoad(this.group);
    const tangent=trackCurve.getTangentAt(0);
    // Walking contacts follow the same cross-section as the manufactured road.
    for(let i=0;i<128;i++) {
      const t=(i+.5)/128,p=trackPoint(t),v=trackCurve.getTangentAt(t),yaw=Math.atan2(v.x,v.z),length=trackCurve.getLength()/128+.001;
      this.boxes.push(box(p.x,ROAD_HEIGHT/2,p.z,TRACK_WIDTH,ROAD_HEIGHT,length,yaw));
      for(const side of [-1,1]){const q=trackPoint(t,side*(TRACK_WIDTH/2+.001));this.boxes.push(box(q.x,CURB_HEIGHT/2,q.z,.010,CURB_HEIGHT,length,yaw));}
    }
    const blue=enamel(0x659bbd),red=enamel(0xd77565),pink=enamel(0xf1b4ad),rubber=enamel(0x536268,.7);
    for(const obstacle of obstacles) {
      const g=new T.Group();g.name=obstacle.kind;this.group.add(g);g.position.set(obstacle.x,ROAD_HEIGHT,obstacle.z);g.rotation.y=obstacle.yaw;
      let size:number[];
      if(obstacle.kind==='brick') {
        size=[.052,.023,.027];rounded(g,size,red,0,.0115,0);
        for(let x=0;x<4;x++)for(let z=0;z<2;z++)part(g,new T.CylinderGeometry(.0044,.0044,.004,16),red,(x-1.5)*.012,.025,(z-.5)*.012);
      } else if(obstacle.kind==='pen') {
        size=[.012,.012,.125];const barrel=part(g,new T.CylinderGeometry(.005,.005,.096,12),blue,0,.006,0);barrel.rotation.x=Math.PI/2;
        const tip=part(g,new T.ConeGeometry(.005,.018,12),gold,0,.006,.057);tip.rotation.x=Math.PI/2;
        rounded(g,[.004,.002,.030],gold,.003,.011,-.031,.0007);
      } else if(obstacle.kind==='bottle') {
        size=[.042,.115,.042];
        const profile=[[0,0],[.016,0],[.021,.005],[.021,.066],[.019,.081],[.009,.09],[.009,.103],[0,.103]];
        part(g,turned(profile,28),enamel(0xa6d6db,.23));
        part(g,new T.CylinderGeometry(.0213,.0213,.026,28),cream,0,.048,0);
        part(g,new T.CylinderGeometry(.011,.011,.012,24),blue,0,.107,0);
        for(const y of [.012,.02,.072]){const ring=part(g,new T.TorusGeometry(.0205,.001,6,28),blue,0,y,0);ring.rotation.x=Math.PI/2;}
        rounded(g,[.017,.013,.001],blue,0,.048,.0215,.001);
      } else if(obstacle.kind==='eraser') {
        size=[.051,.018,.026];rounded(g,size,pink,0,.009,0,.004);rounded(g,[.023,.0184,.0264],cream,0,.009,0,.001);
        for(let i=0;i<3;i++)rounded(g,[.012,.0003,.001],blue,0,.0184,(i-1)*.003,.0001);
      } else {
        size=[.037,.044,.037];part(g,new T.CylinderGeometry(.013,.013,.036,24),pink,0,.022,0);
        for(const y of [.004,.040])part(g,new T.CylinderGeometry(.020,.020,.006,24),cream,0,y,0);
        for(let i=0;i<12;i++){const ring=part(g,new T.TorusGeometry(.013,.0006,5,24),coral,0,.009+i*.0023,0);ring.rotation.x=Math.PI/2;}
      }
      const obstacleBox=box(obstacle.x,ROAD_HEIGHT+size[1]/2,obstacle.z,...size as [number,number,number],obstacle.yaw);
      this.boxes.push(obstacleBox);this.obstacleBoxes.push(obstacleBox);
    }
    // Hand-painted wooden village in the infield; doors, chimneys and roofs read at riding height.
    for(const [x,z,color] of [[-.12,-.08,0xe4b370],[.035,-.13,0xc78582],[.17,.04,0x80aaa0],[-.14,.13,0x81a6bd]]) {
      const g=new T.Group();g.position.set(x,0,z);this.group.add(g);
      const walls=enamel(color);rounded(g,[.069,.050,.056],walls,0,.025,0,.003);
      const roof=new T.Shape();roof.moveTo(-.041,0);roof.lineTo(0,.030);roof.lineTo(.041,0);roof.closePath();
      const roofMesh=part(g,new T.ExtrudeGeometry(roof,{depth:.067,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.001,bevelThickness:.001}),red,0,.05,-.0335);
      roofMesh.name='painted pitched roof';rounded(g,[.012,.018,.012],cream,.023,.066,-.012);
      rounded(g,[.013,.026,.002],ink,0,.014,.029);
      for(const side of [-1,1]){rounded(g,[.013,.014,.002],cream,side*.023,.031,.029);rounded(g,[.001,.014,.0005],gold,side*.023,.031,.0305);}
      const houseBox=box(x,.041,z,.083,.082,.07);this.boxes.push(houseBox);this.obstacleBoxes.push(houseBox);
      for(let i=0;i<4;i++)rounded(this.group,[.014,.001,.010],cream,x,.0006,z+.044+i*.015,.003);
    }
    for(let i=0;i<14;i++) {
      const t=i/14,p=trackPoint(t,i%2?.14:-.14);
      if(p.distanceTo(new T.Vector3(.47,0,.40))<.18)continue;
      part(this.group,new T.CylinderGeometry(.002,.003,.026,8),gold,p.x,.013,p.z);
      part(this.group,new T.SphereGeometry(.014,12,8),i%2?blue:coral,p.x,.034,p.z).scale.set(.8,1.4,.8);
      part(this.group,new T.CylinderGeometry(.013,.015,.004,12),cream,p.x,.002,p.z);
    }
    // Start bunting and a low pit mat, kept clear of the driving line.
    for(const side of [-1,1]) {
      const p=trackPoint(0,side*.106);rod(this.group,p.clone(),p.clone().setY(.14),.002,gold);
      part(this.group,new T.SphereGeometry(.004,10,8),coral,p.x,.14,p.z);
    }
    const a=trackPoint(0,-.106).setY(.137),b=trackPoint(0,.106).setY(.137);rod(this.group,a,b,.0008,rubber);
    for(let i=0;i<9;i++) {
      const p=a.clone().lerp(b,(i+.5)/9);const shape=new T.Shape();shape.moveTo(-.008,0);shape.lineTo(.008,0);shape.lineTo(0,-.018);shape.closePath();
      const flag=part(this.group,new T.ShapeGeometry(shape),i%2?coral:cream,p.x,p.y,p.z);flag.material.side=T.DoubleSide;flag.rotation.y=Math.atan2(tangent.x,tangent.z);
    }
    batch(this.group);
  }
  dispose(){disposeParts(this.group);}
}
