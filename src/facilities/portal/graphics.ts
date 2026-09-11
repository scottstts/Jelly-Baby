import * as T from 'three/webgpu';
import { atan, cos, float, mix, sin, uniform, uv, vec3 } from 'three/tsl';
import { batch, disposeParts, enamel, part, rounded } from '../../graphics/shared/toy-parts.ts';
import { closedTube, solidLoft } from '../../graphics/shared/manufactured-geometry.ts';
import type { CollisionBox } from '../collision.ts';

// Portal authoring contract: local +Y is up, +Z is the face normal, and the
// group origin is the centre of the aperture. Every fitting below is derived
// from these shared shell/ground datums rather than late visual nudges.
const PORTAL_DATUM=Object.freeze({
  innerRadius:.063,
  outerRadius:.079,
  shellHalfDepth:.013,
  membraneRadius:.0605,
  faceDepth:.0142,
  cartridgeRadius:.0825,
  cartridgeTube:.0026,
  // Socket centres sit inside the shell annulus; the tube cap therefore
  // visibly keys into the side wall instead of ending beside it.
  railSocketRadius:.067,
  cartridgeHalfSpan:.28,
  baseY:-.070,
  baseHeight:.012,
  // The load-bearing bar reaches under the face panel with a visible overlap;
  // the extra depth is what makes the mirrored support read as a joint in side
  // views instead of a floating control slab.
  baseDepth:.020,
  soleY:-.0776,
  soleHeight:.0018,
  soleZ:.0225,
});
const PORTAL_GROUP_Y=.080;
const PORTAL_RING_SEGMENTS=32;

type Axis={x:number;y:number;z:number};
const axis=(x:number,y:number,z:number):Axis=>({x,y,z});

function cubicPoint(a:T.Vector3,b:T.Vector3,c:T.Vector3,d:T.Vector3,t:number) {
  const u=1-t,uu=u*u,tt=t*t;
  return new T.Vector3(
    uu*u*a.x+3*uu*t*b.x+3*u*tt*c.x+tt*t*d.x,
    uu*u*a.y+3*uu*t*b.y+3*u*tt*c.y+tt*t*d.y,
    uu*u*a.z+3*uu*t*b.z+3*u*tt*c.z+tt*t*d.z,
  );
}

/** One authored sweep for both the visible cartridge and its collider.
 * The radial sockets use cubic tangencies into the circular run. This keeps
 * the bend round and continuous instead of making a two-segment miter that
 * can read as a detached elbow at macro scale.
 */
function portalRailPath(face:number,index:number,arcSegments=30) {
  const center=Math.PI/2+index*Math.PI*2/3;
  const start=center-PORTAL_DATUM.cartridgeHalfSpan,end=center+PORTAL_DATUM.cartridgeHalfSpan;
  const z=face*PORTAL_DATUM.faceDepth;
  const point=(radius:number,angle:number)=>new T.Vector3(radius*Math.cos(angle),radius*Math.sin(angle),z);
  const startTangent=new T.Vector3(-Math.sin(start),Math.cos(start),0);
  const endTangent=new T.Vector3(-Math.sin(end),Math.cos(end),0);
  // Give each socket a small circumferential lead-in. With the socket and arc
  // endpoint on the same radial line, a 90-degree tangent turn is forced into
  // too little space and the swept tube pinches at the elbow. Offsetting only
  // the socket angle creates a proper-radius bend without moving the outer arc.
  const socketAngleOffset=.075;
  const socketStartAngle=start-socketAngleOffset;
  const socketEndAngle=end+socketAngleOffset;
  const startSocketRadial=new T.Vector3(Math.cos(socketStartAngle),Math.sin(socketStartAngle),0);
  const endSocketRadial=new T.Vector3(Math.cos(socketEndAngle),Math.sin(socketEndAngle),0);
  const socketStart=point(PORTAL_DATUM.railSocketRadius,socketStartAngle);
  const outerStart=point(PORTAL_DATUM.cartridgeRadius,start);
  const outerEnd=point(PORTAL_DATUM.cartridgeRadius,end);
  const socketEnd=point(PORTAL_DATUM.railSocketRadius,socketEndAngle);
  const socketReach=.004;
  const outerReach=.0095;
  const startControlA=socketStart.clone().addScaledVector(startSocketRadial,socketReach);
  const startControlB=outerStart.clone().addScaledVector(startTangent,-outerReach);
  const endControlA=outerEnd.clone().addScaledVector(endTangent,outerReach);
  // The final cubic arrives at the socket along the inward radial tangent.
  const endControlB=socketEnd.clone().addScaledVector(endSocketRadial,socketReach);
  const bendSegments=Math.max(8,Math.round(arcSegments*.27));
  const path:T.Vector3[]=[];
  for(let i=0;i<=bendSegments;i++)path.push(cubicPoint(socketStart,startControlA,startControlB,outerStart,i/bendSegments));
  for(let i=1;i<arcSegments;i++)path.push(point(PORTAL_DATUM.cartridgeRadius,start+(end-start)*i/arcSegments));
  path.push(outerEnd);
  for(let i=1;i<=bendSegments;i++)path.push(cubicPoint(outerEnd,endControlA,endControlB,socketEnd,i/bendSegments));
  return path;
}

function addOrientedBox(
  boxes:CollisionBox[],portalX:number,portalZ:number,
  localX:number,localY:number,localZ:number,
  sizeX:number,sizeY:number,sizeZ:number,
  xAxis:Axis=axis(1,0,0),yAxis:Axis=axis(0,1,0),zAxis:Axis=axis(0,0,1),
) {
  boxes.push({
    center:{x:portalX+localX,y:PORTAL_GROUP_Y+localY,z:portalZ+localZ},
    xAxis,yAxis,zAxis,
    halfSize:{x:sizeX/2,y:sizeY/2,z:sizeZ/2},
  });
}

/** Collision volumes authored from the same portal datum as the visible mesh.
 * The housing is a segmented annulus, so the aperture remains genuinely empty
 * for travel while the bezel, cartridges, controls and load-bearing base stop
 * the baby from passing through solid toy parts.
 */
export function portalCollisionBoxes(portalX:number,portalZ:number):CollisionBox[] {
  const boxes:CollisionBox[]=[];
  const radialMid=(PORTAL_DATUM.innerRadius+PORTAL_DATUM.outerRadius)/2;
  const radialHalf=(PORTAL_DATUM.outerRadius-PORTAL_DATUM.innerRadius)/2;
  for(let i=0;i<PORTAL_RING_SEGMENTS;i++) {
    const angle=(i+.5)*Math.PI*2/PORTAL_RING_SEGMENTS;
    const radial=axis(Math.cos(angle),Math.sin(angle),0);
    const tangent=axis(-Math.sin(angle),Math.cos(angle),0);
    const tangentHalf=radialMid*Math.tan(Math.PI/PORTAL_RING_SEGMENTS)*1.03;
    addOrientedBox(boxes,portalX,portalZ,radialMid*radial.x,radialMid*radial.y,0,radialHalf*2,tangentHalf*2,PORTAL_DATUM.shellHalfDepth*2,radial,tangent,axis(0,0,1));
  }
  for(const face of [-1,1])for(let index=0;index<3;index++) {
    const path=portalRailPath(face,index,24);
    for(let i=1;i<path.length;i++) {
      const a=path[i-1],b=path[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
      if(length<1e-9)continue;
      const along=axis(dx/length,dy/length,0),across=axis(-dy/length,dx/length,0);
      // Segment boxes deliberately overlap at every join and include a small
      // radial skin. The rendered tube and the narrow-phase collider therefore
      // have no pinholes at the cubic bends or between sampled arc chords.
      addOrientedBox(boxes,portalX,portalZ,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,length+.0015,PORTAL_DATUM.cartridgeTube*2+.001,PORTAL_DATUM.cartridgeTube*2+.001,along,across,axis(0,0,1));
    }
  }
  for(const face of [-1,1]) {
    // Match the visible bar's actual dimensions; the global facility margin
    // supplies the tiny contact skin without making an invisible floor wall.
    addOrientedBox(boxes,portalX,portalZ,0,PORTAL_DATUM.baseY,face*.020,.112,PORTAL_DATUM.baseHeight,PORTAL_DATUM.baseDepth);
    addOrientedBox(boxes,portalX,portalZ,0,PORTAL_DATUM.soleY,face*PORTAL_DATUM.soleZ,.118,PORTAL_DATUM.soleHeight,.018);
    addOrientedBox(boxes,portalX,portalZ,0,-.068,face*.030,.045,.014,.014);
    for(const side of [-1,1])addOrientedBox(boxes,portalX,portalZ,side*.064,-.0705,face*.020,.018,.016,.014);
  }
  return boxes;
}

export class JellyPortal {
  readonly group=new T.Group();
  readonly collisionBoxes:readonly CollisionBox[];
  readonly lightingEnvelope:T.Box3;
  private readonly clock=uniform(0);
  constructor(x:number,z:number,keepParts=false) {
    this.group.name='jelly-portal';
    this.group.position.set(x,PORTAL_GROUP_Y,z);
    const material=new T.MeshPhysicalNodeMaterial({roughness:.19,clearcoat:1,metalness:.05,side:T.DoubleSide});
    const p=uv().sub(.5),radius=p.length(),angle=atan(p.y,p.x);
    const wave=sin(angle.mul(5).add(radius.mul(44)).sub(this.clock.mul(2.5))).mul(.5).add(.5);
    material.colorNode=mix(vec3(.12,.65,.58),mix(vec3(.92,.19,.38),vec3(.55,.26,.88),cos(angle.add(this.clock)).mul(.5).add(.5)),wave);
    material.emissiveNode=material.colorNode.mul(.14);
    material.roughnessNode=float(.15).add(wave.mul(.16));
    // A measured reveal keeps the animated disc inside the shell aperture.
    const membrane=part(this.group,new T.CylinderGeometry(PORTAL_DATUM.membraneRadius,PORTAL_DATUM.membraneRadius,.0014,96),material);membrane.rotation.x=Math.PI/2;membrane.name='vortex-membrane';
    const casing=new T.Group();casing.name='portal-casing';this.group.add(casing);
    const pearl=enamel(0xf4dcb1),brass=new T.MeshPhysicalNodeMaterial({color:0xc6a36d,metalness:.55,roughness:.3});
    const mint=enamel(0x78dfc6),pink=enamel(0xff8296),lavender=enamel(0xc3a0ff);
    const gasket=enamel(0x546568,.65),rubber=enamel(0x8b938b,.8);
    // Matched inner/outer profiles own the aperture, front lip and back wall.
    const profile=[
      [PORTAL_DATUM.innerRadius,-.0105],
      [PORTAL_DATUM.innerRadius,.0105],
      [PORTAL_DATUM.innerRadius+.0015,PORTAL_DATUM.shellHalfDepth],
      [PORTAL_DATUM.outerRadius-.002,PORTAL_DATUM.shellHalfDepth],
      [PORTAL_DATUM.outerRadius,.0105],
      [PORTAL_DATUM.outerRadius,-.0105],
      [PORTAL_DATUM.outerRadius-.002,-PORTAL_DATUM.shellHalfDepth],
      [PORTAL_DATUM.innerRadius+.0015,-PORTAL_DATUM.shellHalfDepth],
    ];
    const rings=Array.from({length:96},(_,i)=>{const a=i*Math.PI/48;return profile.map(([r,depth])=>[r*Math.cos(a),r*Math.sin(a),depth]);});
    part(casing,solidLoft(rings,true),pearl).name='aperture-housing';
    // Both faces are finished: arrival can happen on either side of the device.
    for(const face of [-1,1]) {
      const ring=(radius:number,depth:number,thickness:number,finish:T.Material,name:string)=>{
        const path=Array.from({length:96},(_,i)=>{const a=i*Math.PI/48;return new T.Vector3(radius*Math.cos(a),radius*Math.sin(a),face*depth);});
        part(casing,closedTube(path,thickness,8,true),finish).name=`${name}-${face}`;
      };
      // The soft seal follows the shared inner aperture datum; its small proud
      // offset keeps the animated membrane from touching the housing.
      ring(PORTAL_DATUM.innerRadius-.0012,PORTAL_DATUM.faceDepth-.0004,.0009,gasket,'recessed-aperture-seal');
      // The brass bead keys 0.5 mm into the shell's front chamfer. The dark seal
      // and the bead leave a deliberate 1.1 mm radial reveal, like a toy bezel,
      // rather than stacking coplanar rings over the casing.
      ring(PORTAL_DATUM.innerRadius+.0018,PORTAL_DATUM.shellHalfDepth+.0005,.0010,brass,'aperture-bezel');
      // Each coloured rail is one continuous swept part: its short radial ends
      // are the designed sockets into the shell, so there are no detached caps
      // or overlapping retainer boxes along the visible arc. The socket datum
      // intentionally reaches into the shell wall far enough to read as a
      // manufactured joint from either face.
      for(let i=0;i<3;i++) {
        const path=portalRailPath(face,i);
        part(casing,closedTube(path,PORTAL_DATUM.cartridgeTube,10),[mint,pink,lavender][i]).name=`energy-cartridge-${face}-${i}`;
      }
      // The panel sits 3.5 mm proud of the shell face, leaving a real shadow
      // reveal instead of cutting through the lower aperture housing.
      rounded(casing,[.045,.014,.007],gasket,0,-.068,face*.030,.002).name=`control-panel-recess-${face}`;
      const dial=part(casing,new T.CylinderGeometry(.0045,.0045,.003,24),lavender,-.014,-.068,face*.035);
      dial.rotation.x=Math.PI/2;dial.name=`destination-dial-${face}`;
      rounded(casing,[.001,.003,.0008],brass,-.014,-.0668,face*.037);
      for(let i=0;i<3;i++)rounded(casing,[.003,.002,.001],i===0?mint:pearl,-.003+i*.005,-.068,face*.034,.0005).name=`status-window-${face}-${i}`;
    }
    // The lower support is a mirrored pair. Each dial panel therefore lands on
    // a real load-bearing bar and each face has the same floor datum.
    for(const face of [-1,1]) {
      const suffix=face===1?'front':'back';
      rounded(casing,[.112,PORTAL_DATUM.baseHeight,PORTAL_DATUM.baseDepth],pearl,0,PORTAL_DATUM.baseY,face*.020,.004).name=`integrated-power-base-${suffix}`;
      // One continuous rubber undertray owns the floor contact. It is 1.5 mm
      // above the tabletop and leaves a 0.7 mm shadow reveal under its bar,
      // eliminating the former coplanar two-pad flicker.
      rounded(casing,[.118,PORTAL_DATUM.soleHeight,.018],rubber,0,PORTAL_DATUM.soleY,face*PORTAL_DATUM.soleZ,.0015).name=`rubber-undertray-${suffix}`;
      for(const side of [-1,1]) {
        rounded(casing,[.018,.016,.014],side<0?pink:mint,side*.064,-.0705,face*.020,.0045).name=`power-pod-${suffix}-${side}`;
        for(let i=0;i<3;i++)rounded(casing,[.008,.001,.001],gasket,side*.064,-.0705+i*.003,face*.027,.0002).name=`pod-vent-${suffix}-${side}-${i}`;
      }
    }
    this.collisionBoxes=portalCollisionBoxes(x,z);
    casing.userData.keepParts=keepParts;batch(casing);
    this.lightingEnvelope=new T.Box3().setFromObject(this.group);
    if(!keepParts)casing.children.forEach((child,index)=>{child.name=`batched-casing-${index}`;});
  }
  update(dt:number) {this.clock.value+=dt;}
  dispose(){disposeParts(this.group);}
}
