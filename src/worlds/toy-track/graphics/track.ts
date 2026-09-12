import * as T from 'three/webgpu';
import { batch, disposeParts, enamel, part, rod, rounded } from '../../../graphics/shared/toy-parts.ts';
import {
  box, obstacles, trackCurve, trackPoint, roadLocation, ROAD_HEIGHT, CURB_HEIGHT,
  CURB_CENTER_OFFSET, CURB_OUTER_EDGE, CURB_WIDTH, TRACK_LOCATION_SEGMENTS, TRACK_RADIUS_SCALE, TRACK_SCENERY_SCALE, TRACK_WIDTH,
} from '../layout.ts';
import { TRACK_PORTAL } from '../portal-layout.ts';
import { makeToyRoad } from './road.ts';
import { moldedBox, turned } from '../../../graphics/shared/manufactured-geometry.ts';
import type { CollisionBox } from '../../../facilities/collision.ts';
import { tricycleBoxCollider, tricycleCircleCollider, type TricycleCollider } from '../facilities/tricycle/collision.ts';

const CURB_NEIGHBOR_SEGMENTS=6;
const CURB_ACTIVE_BOX_COUNT=2*(CURB_NEIGHBOR_SEGMENTS*2+1);
const CURB_ACTIVE_DISTANCE=.11;
const TREE_COLLISION_DIAMETER=.030;
const TREE_COLLISION_HEIGHT=.054;
/** Keep thin decorative floor contacts separate from the tabletop depth plane. */
export const TOY_FLOOR_CLEARANCE=.0012;
const STEP_HEIGHT=.001;

/** A manufactured ribbon with inset seams, contrasting rolled edges and tabletop props. */
export class ToyTrack {
  readonly group=new T.Group();
  /** Solid scenery for the walking baby; the road slab itself is intentionally absent. */
  readonly boxes:CollisionBox[]=[];
  readonly obstacleBoxes:CollisionBox[]=[];
  /** One cheap envelope per decorative tree for jelly collision only. */
  readonly treeBoxes:CollisionBox[]=[];
  readonly vehicleColliders:TricycleCollider[]=[];
  /** Exact-height curb segments used only by walking collision. */
  readonly curbBoxes:CollisionBox[]=[];
  readonly curbActiveBoxCount=CURB_ACTIVE_BOX_COUNT;
  private readonly curbSegments:[CollisionBox[],CollisionBox[]]=[[],[]];
  private readonly activeCurbs:CollisionBox[]=[];
  constructor(keepParts=false) {
    this.group.name='toy-track';this.group.userData.keepParts=keepParts;
    const coral=enamel(0xe7917f),cream=enamel(0xffecc5),ink=enamel(0x38555b),gold=enamel(0xd8b36c);
    // Repeated manufactured pieces are geometrically identical. Build each
    // immutable shell once and let the static batcher clone/apply transforms.
    // This removes procedural mesh cleanup/smoothing work without changing any
    // vertices, materials, placement, collision, or rendered detail.
    const houseWall=moldedBox([.069,.050,.056],.003);
    const chimney=moldedBox([.012,.018,.012],.002);
    const houseDoor=moldedBox([.013,.026,.002],.002);
    const houseWindow=moldedBox([.013,.014,.002],.002);
    const windowBar=moldedBox([.001,.014,.0005],.002);
    const steppingStone=moldedBox([.014,STEP_HEIGHT,.010],.003);
    const roofShape=new T.Shape();roofShape.moveTo(-.041,0);roofShape.lineTo(0,.030);roofShape.lineTo(.041,0);roofShape.closePath();
    const houseRoof=new T.ExtrudeGeometry(roofShape,{depth:.067,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.001,bevelThickness:.001});
    const treeTrunk=new T.CylinderGeometry(.002,.003,.026,8);
    const treeCrown=new T.SphereGeometry(.014,12,8);
    const treePlinth=new T.CylinderGeometry(.013,.015,.004,12);
    const flagShape=new T.Shape();flagShape.moveTo(-.008,0);flagShape.lineTo(.008,0);flagShape.lineTo(0,-.018);flagShape.closePath();
    const flagGeometry=new T.ShapeGeometry(flagShape);
    makeToyRoad(this.group);
    this.makeWalkingCurbs();
    const tangent=trackCurve.getTangentAt(0);
    // Walking collision contains only the raised curb volume, never the 3 mm
    // road slab. Its broad top is intentionally walkable: the baby can jump
    // onto the curb, cross it on foot, then step down onto or off the road.
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
      if(obstacle.kind==='bottle')this.vehicleColliders.push(tricycleCircleCollider(obstacle.x,obstacle.z,.022));
      else if(obstacle.kind==='spool')this.vehicleColliders.push(tricycleCircleCollider(obstacle.x,obstacle.z,.020));
      else if(obstacle.kind!=='pen')this.vehicleColliders.push(tricycleBoxCollider(obstacleBox,obstacle.kind==='brick'?.002:obstacle.kind==='eraser'?.004:0));
    }
    // The infield village scales with the larger world; road obstacles do not.
    for(const [baseX,baseZ,color] of [[-.12,-.08,0xe4b370],[.035,-.13,0xc78582],[.17,.04,0x80aaa0],[-.14,.13,0x81a6bd]]) {
      const x=baseX*TRACK_SCENERY_SCALE,z=baseZ*TRACK_SCENERY_SCALE;
      const g=new T.Group();g.name='scaled-infield-house';g.position.set(x,0,z);g.scale.setScalar(TRACK_SCENERY_SCALE);this.group.add(g);
      const walls=enamel(color);part(g,houseWall,walls,0,.025,0);
      const roofMesh=part(g,houseRoof,red,0,.05,-.0335);
      roofMesh.name='painted pitched roof';part(g,chimney,cream,.023,.066,-.012);
      part(g,houseDoor,ink,0,.014,.029);
      for(const side of [-1,1]){part(g,houseWindow,cream,side*.023,.031,.029);part(g,windowBar,gold,side*.023,.031,.0305);}
      const houseBox=box(x,.041*TRACK_SCENERY_SCALE,z,.083*TRACK_SCENERY_SCALE,.082*TRACK_SCENERY_SCALE,.07*TRACK_SCENERY_SCALE);
      this.boxes.push(houseBox);this.obstacleBoxes.push(houseBox);this.vehicleColliders.push(tricycleBoxCollider(houseBox));
      for(let i=0;i<4;i++) {
        const stone=part(this.group,steppingStone,cream,x,TOY_FLOOR_CLEARANCE+STEP_HEIGHT/2,z+(.044+i*.015)*TRACK_SCENERY_SCALE);
        stone.name='house stepping stone';
      }
    }
    const portalPosition=new T.Vector3(TRACK_PORTAL.x,0,TRACK_PORTAL.z);
    for(let i=0;i<14;i++) {
      const t=i/14,infield=i%2===0;
      // Only the trees inside the loop belong to the scaled central village.
      // Outside trees keep their object scale and are merely repositioned just
      // beyond the wider curb.
      const offset=infield?-.14*TRACK_RADIUS_SCALE:CURB_OUTER_EDGE+.034,p=trackPoint(t,offset);
      if(p.distanceTo(portalPosition)<.30)continue;
      const treeScale=infield?TRACK_SCENERY_SCALE:1;
      const tree=new T.Group();tree.name=infield?'scaled-infield-tree':'trackside-tree';tree.position.set(p.x,TOY_FLOOR_CLEARANCE,p.z);tree.scale.setScalar(treeScale);this.group.add(tree);
      part(tree,treeTrunk,gold,0,.013,0);
      part(tree,treeCrown,i%2?blue:coral,0,.034,0).scale.set(.8,1.4,.8);
      part(tree,treePlinth,cream,0,.002,0).name='tree-plinth';
      // A single vertical envelope covers the plinth, trunk and oval crown.
      // This is intentionally much cheaper than matching the low-poly mesh and
      // belongs only to jelly collision; the road constraint already keeps the
      // tricycle away from these trees.
      const treeBox=box(p.x,TOY_FLOOR_CLEARANCE+TREE_COLLISION_HEIGHT*treeScale/2,p.z,TREE_COLLISION_DIAMETER*treeScale,TREE_COLLISION_HEIGHT*treeScale,TREE_COLLISION_DIAMETER*treeScale);
      treeBox.margin=.0008;this.treeBoxes.push(treeBox);this.boxes.push(treeBox);
    }
    // Start bunting is repositioned to the wider curb but retains its original scale.
    const gantryOffset=CURB_OUTER_EDGE+.006;
    for(const side of [-1,1]) {
      const p=trackPoint(0,side*gantryOffset);rod(this.group,p.clone(),p.clone().setY(.14),.002,gold);
      part(this.group,new T.SphereGeometry(.004,10,8),coral,p.x,.14,p.z);
    }
    const a=trackPoint(0,-gantryOffset).setY(.137),b=trackPoint(0,gantryOffset).setY(.137);rod(this.group,a,b,.0008,rubber);
    for(let i=0;i<9;i++) {
      const p=a.clone().lerp(b,(i+.5)/9);
      const flag=part(this.group,flagGeometry,i%2?coral:cream,p.x,p.y,p.z);flag.material.side=T.DoubleSide;flag.rotation.y=Math.atan2(tangent.x,tangent.z);
    }
    batch(this.group);
  }
  private makeWalkingCurbs() {
    const lateral=TRACK_WIDTH/2+CURB_CENTER_OFFSET;
    for(const [sideIndex,side] of [-1,1].entries()) {
      const segments=this.curbSegments[sideIndex as 0|1];
      for(let i=0;i<TRACK_LOCATION_SEGMENTS;i++) {
        const a=trackPoint(i/TRACK_LOCATION_SEGMENTS,side*lateral),b=trackPoint((i+1)/TRACK_LOCATION_SEGMENTS,side*lateral);
        const dx=b.x-a.x,dz=b.z-a.z;
        const segment=box((a.x+b.x)/2,CURB_HEIGHT/2,(a.z+b.z)/2,CURB_WIDTH,CURB_HEIGHT,Math.hypot(dx,dz)+.0015,Math.atan2(dx,dz));
        segment.margin=.0008;
        segments.push(segment);this.curbBoxes.push(segment);
      }
    }
  }
  /** Return only curb segments near the baby, keeping the 240 Hz narrow phase bounded. */
  curbsNear(x:number,z:number) {
    const nearest=roadLocation(x,z),out=this.activeCurbs;out.length=0;
    if(Math.abs(nearest.distance-TRACK_WIDTH/2)>CURB_ACTIVE_DISTANCE)return out;
    const center=Math.floor(nearest.t*TRACK_LOCATION_SEGMENTS)%TRACK_LOCATION_SEGMENTS;
    for(let delta=-CURB_NEIGHBOR_SEGMENTS;delta<=CURB_NEIGHBOR_SEGMENTS;delta++) {
      const index=(center+delta+TRACK_LOCATION_SEGMENTS)%TRACK_LOCATION_SEGMENTS;
      out.push(this.curbSegments[0][index],this.curbSegments[1][index]);
    }
    return out;
  }
  dispose(){disposeParts(this.group);}
}
