import * as T from 'three/webgpu';
import { part } from '../../graphics/shared/toy-parts.ts';
import { closedTube, moldedBox, solidLoft } from '../../graphics/shared/manufactured-geometry.ts';
import type { CollisionBox } from '../../facilities/collision.ts';
import { ENTRANCE, FIELD, GOAL, WELCOME_DESK, soccerBox } from './layout.ts';

/** Small fitted pieces key 0.2–0.4 mm into their host, never share a face.
 * Architectural silhouettes get colliders; shallow applied trim uses its host. */
export function stadiumDetails(root:T.Group,boxes:CollisionBox[],cream:T.Material,blue:T.Material,gold:T.Material,coral:T.Material) {
  const box=(name:string,size:number[],x:number,y:number,z:number,mat:T.Material,r=.001,solid=false)=>{
    const mesh=part(root,moldedBox(size,r),mat,x,y,z);mesh.name=name;
    if(solid)boxes.push(soccerBox(x,y,z,...size as [number,number,number]));return mesh;
  };
  for(const side of [-1,1]) {
    // Fluted exterior bays and a continuous dado give the long shell a scale.
    box(`exterior-dado-${side}`,[.006,.023,4.04],side*1.418,.037,.20,blue);
    box(`exterior-cornice-${side}`,[.007,.012,4.04],side*1.4185,.277,.20,gold);
    for(let bay=0;bay<10;bay++) {
      const z=-1.67+bay*.395;
      box(`wall-pilaster-${side}-${bay}`,[.010,.205,.026],side*1.4202,.154,z,cream,.003);
      box(`pilaster-cap-${side}-${bay}`,[.012,.009,.039],side*1.4212,.261,z,gold,.002);
      box(`wall-panel-${side}-${bay}`,[.003,.103,.28],side*1.4166,.154,z+.195,bay%2?coral:blue,.001);
      for(let vent=0;vent<3;vent++)box(`panel-louvre-${side}-${bay}-${vent}`,[.002,.005,.20],side*1.4189,.13+vent*.024,z+.195,cream,.0007);
    }
    // Rounded roof ribs, fascia tiles and underside brackets stay outside seats.
    for(let rib=0;rib<15;rib++) {
      const z=-1.69+rib*.24;
      box(`roof-rib-${side}-${rib}`,[.193,.005,.012],side*1.305,.3182,z,gold,.0015);
      box(`fascia-tile-${side}-${rib}`,[.003,.008,.15],side*1.1858,.307,z,rib%2?cream:coral,.001);
    }
    for(let bracket=0;bracket<8;bracket++) {
      const z=-1.43+bracket*.43;
      const profile=[[side*1.3708,.266],[side*1.3708,.3014],[side*1.255,.3014]];
      part(root,solidLoft([z-.006,z+.006].map(depth=>profile.map(([x,y])=>[x,y,depth]))),gold).name=`roof-corbel-${side}-${bracket}`;
    }
    // A cap protects the board edge; separate inset lozenges soften its face.
    box(`board-cap-${side}`,[.029,.006,3.06],side*1.022,.1192,0,cream,.002);
    for(let badge=0;badge<12;badge++)box(`board-inlay-${side}-${badge}`,[.002,.030,.145],side*1.0092,.067,-1.41+badge*.256,badge%3===0?coral:gold,.0007);
    for(let row=0;row<4;row++) {
      const inner=1.057+row*.075,y=.049+row*.056;
      // Continuous riser stripe and inset aisle studs, clear of the seat shells.
      box(`terrace-riser-band-${side}-${row}`,[.002,.009,3.12],side*(inner-.0006),y-.015,0,blue,.0006);
      for(let aisle=0;aisle<4;aisle++)for(const offset of [-.009,.009])box(`aisle-grip-${side}-${row}-${aisle}-${offset}`,[.044,.0015,.002],side*(inner+.036),y+.00455,-1.52+aisle*.87+offset,blue,.0004);
    }
  }
  for(const end of [-1,1]) {
    const wallZ=end===1?ENTRANCE.z:-1.90;
    const spans=end===1?[{x:-.4975,width:1.695},{x:1.0975,width:.495}]:[{x:0,width:2.69}];
    for(const [index,span] of spans.entries()) {
      box(`end-dado-${end}-${index}`,[span.width-.025,.023,.005],span.x,.037,wallZ+end*.0221,blue);
      box(`end-cornice-${end}-${index}`,[span.width-.025,.012,.005],span.x,.279,wallZ+end*.0221,gold);
      const roofZ=end===1?ENTRANCE.z-.045:-1.855;
      box(`end-roof-edge-${end}-${index}`,[span.width-.024,.010,.005],span.x,.308,roofZ-end*.0668,gold);
      const count=Math.floor(span.width/.24);
      for(let rib=0;rib<count;rib++)box(`end-roof-rib-${end}-${index}-${rib}`,[.012,.005,.108],span.x+(rib-(count-1)/2)*.24,.3182,roofZ,gold,.0015);
      const panels=Math.floor(span.width/.30);
      for(let i=0;i<panels;i++) {
        const x=span.x+(i-(panels-1)/2)*.30;
        box(`end-wall-medallion-${end}-${index}-${i}`,[.20,.12,.004],x,.155,wallZ+end*.0217,i%2?blue:coral,.0013);
        box(`end-medallion-bar-${end}-${index}-${i}`,[.13,.013,.002],x,.155,wallZ+end*.0244,cream,.0007);
      }
    }
    goalDetails(root,end,cream,blue,gold,box);
  }
  // Scoreboard casing has a fitted rain hood and two team-colour name tabs.
  box('scoreboard-rain-hood',[.501,.009,.047],0,.4952,-1.901,gold,.002,true);
  for(const side of [-1,1]) {
    box(`scoreboard-team-tab-${side}`,[.092,.026,.002],side*.148,.439,-1.8842,side<0?coral:blue,.0007);
    box(`scoreboard-team-underline-${side}`,[.072,.004,.002],side*.148,.415,-1.8842,gold,.0006);
  }
  entranceSign(root,cream,blue,gold,box);
}

type DetailBox=(name:string,size:number[],x:number,y:number,z:number,mat:T.Material,r?:number,solid?:boolean)=>T.Mesh;

function goalDetails(root:T.Group,end:number,cream:T.Material,blue:T.Material,gold:T.Material,box:DetailBox) {
  const z=end*FIELD.length/2,rear=z+end*GOAL.depth,w=GOAL.width/2,y=FIELD.y,h=GOAL.height;
  // Rounded single-piece rear U and side skids support the previously loose net.
  const tube=(name:string,points:number[][],radius:number,mat:T.Material)=>{part(root,closedTube(points.map(p=>new T.Vector3(...p)),radius,10),mat).name=`${name}-${end}`;};
  tube('goal-rear-bow',[[-w,y+.0067,rear],[-w,y+h-.013,rear],[-w+.004,y+h-.003,rear],[-w+.014,y+h+.001,rear],[w-.014,y+h+.001,rear],[w-.004,y+h-.003,rear],[w,y+h-.013,rear],[w,y+.0067,rear]],.0024,blue);
  for(const side of [-1,1]) {
    tube(`goal-base-skid-${side}`,[[side*(w-.003),y+.005,z+end*.0076],[side*(w-.003),y+.005,rear]],.0024,blue);
    tube(`goal-roof-stay-${side}`,[[side*w,y+h-.008,z+end*.0077],[side*w,y+h-.008,rear-end*.002]],.002,cream);
    box(`goal-anchor-shoe-${end}-${side}`,[.020,.003,.027],side*(w-.003),y+.0012,z+end*.050,gold,.001);
    box(`goal-rear-foot-${end}-${side}`,[.015,.003,.015],side*(w-.003),y+.0012,rear-end*.008,gold,.001);
  }
  // Net roof cross-weave closes the conspicuously absent transverse strands.
  for(let i=1;i<8;i++)tube(`net-roof-weft-${i}`,[[-w,y+h-.003,z+end*(.007+i*(GOAL.depth-.007)/8)],[w,y+h-.003,z+end*(.007+i*(GOAL.depth-.007)/8)]],.0007,cream);
  for(const side of [-1,1])for(let i=1;i<8;i++)tube(`net-side-warp-${side}-${i}`,[[side*w,y+.003,z+end*(.007+i*(GOAL.depth-.007)/8)],[side*w,y+h-.003,z+end*(.007+i*(GOAL.depth-.007)/8)]],.0007,cream);
}

function entranceSign(root:T.Group,cream:T.Material,blue:T.Material,gold:T.Material,box:DetailBox) {
  // A low marker centred in front of the welcome desk, facing arrivals (+Z).
  // Its foot clears the tabletop footprint and the entry opening stays free.
  const x=WELCOME_DESK.x,z=WELCOME_DESK.z+.065;
  box('entrance-sign-foot',[.026,.008,.024],x,.005,z,blue,.002,true);
  box('entrance-sign-post',[.009,.0308,.009],x,.0239,z,gold,.0015,true);
  box('entrance-sign-shell',[.12,.036,.012],x,.057,z,blue,.002,true);
  box('entrance-sign-face',[.112,.030,.002],x,.057,z+.0068,cream,.0007);
  // Rounded raised toy letter tiles. Each is a capped solid keyed into the face.
  const glyphs:Record<string,string[]>={E:['111','100','110','100','111'],N:['1001','1101','1011','1001','1001'],T:['111','010','010','010','010'],R:['110','101','110','101','101'],A:['010','101','111','101','101'],C:['111','100','100','100','111']};
  const word='ENTRANCE',unit=.0026,width=[...word].reduce((sum,c)=>sum+glyphs[c][0].length+1,0)-1;
  let cursor=-width*unit/2;
  for(const [letter,c] of [...word].entries()) {
    glyphs[c].forEach((row,j)=>[...row].forEach((pixel,i)=>{if(pixel==='1')box(`entrance-letter-${letter}-${j}-${i}`,[unit-.00025,unit-.00025,.0015],x+cursor+(i+.5)*unit,.063+(2-j)*unit,z+.00835,blue,.0004);}));
    cursor+=(glyphs[c][0].length+1)*unit;
  }
  const arrow=[[-.0105,0],[0,.007],[.0105,0],[.0035,0],[.0035,-.006],[-.0035,-.006],[-.0035,0]];
  part(root,solidLoft([z+.0075,z+.009].map(depth=>arrow.map(([u,v])=>[x+u,.0475+v,depth]))),gold).name='entrance-direction-arrow';
}
