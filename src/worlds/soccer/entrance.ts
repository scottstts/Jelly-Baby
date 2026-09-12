import { CatmullRomCurve3, Group, Vector3, type Material } from 'three/webgpu';
import { part } from '../../graphics/shared/toy-parts.ts';
import { closedTube, moldedBox, solidLoft, turned } from '../../graphics/shared/manufactured-geometry.ts';
import type { CollisionBox } from '../../facilities/collision.ts';
import { ENTRANCE, WELCOME_DESK, soccerBox } from './layout.ts';
import { formedProfile } from './craft.ts';

export function stadiumEntrance(root:Group,boxes:CollisionBox[],cream:Material,blue:Material,gold:Material,coral:Material) {
  const {x:entryX,z:entryZ}=ENTRANCE;
  const add=(name:string,size:number[],x:number,y:number,z:number,material:Material,r=.002)=>{const mesh=part(root,moldedBox(size,r),material,x,y,z);mesh.name=name;return mesh;};
  // One continuous filleted arch. The octagonal cross-section owns its proud
  // face, deep jambs, corner bevels and back face, including both end caps.
  const path=new CatmullRomCurve3([[-.202,.013],[-.202,.225],[-.199,.268],[-.177,.296],[-.14,.303],[.14,.303],[.177,.296],[.199,.268],[.202,.225],[.202,.013]].map(([x,y])=>new Vector3(x,y,0)),false,'centripetal');
  const cross=[[-.023,-.037],[-.020,-.043],[.020,-.043],[.023,-.037],[.023,.037],[.020,.043],[-.020,.043],[-.023,.037]];
  const rings=Array.from({length:81},(_,i)=>{const p=path.getPoint(i/80),t=path.getTangent(i/80);return cross.map(([u,v])=>[entryX+p.x-t.y*u,p.y+t.x*u,entryZ+v]);});
  part(root,solidLoft(rings),cream).name='entrance-arch';
  for(const side of [-1,1]) {
    const x=entryX+side*.202;
    add(`entry-plinth-${side}`,[.066,.008,.108],x,.005,entryZ,cream,.002);
    add(`entry-plinth-band-${side}`,[.056,.004,.094],x,.011,entryZ,gold,.001);
    add(`entry-inset-frame-${side}`,[.028,.169,.003],x,.132,entryZ+.0445,gold,.001);
    add(`entry-inset-${side}`,[.022,.158,.002],x,.132,entryZ+.047,blue,.001);
    // Fine fluted reveals and a pair of molded badge chevrons at eye height.
    for(const offset of [-.014,.014])add(`entry-flute-${side}-${offset}`,[.002,.182,.002],x+offset,.13,entryZ+.044,blue,.00065);
    for(const y of [.063,.072])add(`entry-chevron-${side}-${y}`,[.017,.002,.0015],x,y,entryZ+.04875,gold,.0005);
    boxes.push(soccerBox(x,.155,entryZ,.046,.31,.086));
    boxes.push(soccerBox(x,.005,entryZ,.066,.008,.108));
    // Each gate leaf has a continuous rounded perimeter and separate welded
    // spindle bars. It is fixed open at 78°, outside the clear entry route.
    const leaf=new Group();leaf.name=`open-gate-${side}`;leaf.position.set(entryX+side*.173,0,entryZ);leaf.rotation.y=side*1.36;root.add(leaf);
    const width=.143,sgn=-side;
    const points=[[0,.030,0],[sgn*(width-.008),.030,0],[sgn*width,.038,0],[sgn*width,.191,0],[sgn*(width-.008),.199,0],[0,.199,0]];
    part(leaf,closedTube(points.map(p=>new Vector3(...p)),.0022,10,true),blue).name='gate-leaf-frame';
    for(let i=1;i<=7;i++)part(leaf,closedTube([new Vector3(sgn*i*.018,.0322,0),new Vector3(sgn*i*.018,.1968,0)],.0014,8),blue).name=`gate-spindle-${i}`;
    for(const y of [.042,.180]){const hinge=part(root,turned([[0,-.006],[.0065,-.006],[.007,-.004],[.007,.004],[.0065,.006],[0,.006]],16),gold,entryX+side*.173,y,entryZ);hinge.name=`gate-hinge-${side}-${y}`;}
    const box=soccerBox(entryX+side*.173+sgn*width/2*Math.cos(leaf.rotation.y),.114,entryZ-sgn*width/2*Math.sin(leaf.rotation.y),width,.173,.005);
    Object.assign(box.xAxis,{x:Math.cos(leaf.rotation.y),y:0,z:-Math.sin(leaf.rotation.y)});Object.assign(box.zAxis,{x:Math.sin(leaf.rotation.y),y:0,z:Math.cos(leaf.rotation.y)});boxes.push(box);
  }
  boxes.push(soccerBox(entryX,.303,entryZ,.36,.046,.086));
  // A sculpted brass crest sits on the gate transom, with a raised blue inset.
  const crest=[[-.018,0],[-.016,.012],[.016,.012],[.018,0],[.011,-.012],[0,-.018],[-.011,-.012]];
  const badge=part(root,solidLoft([-.002,.002].map(z=>crest.map(([x,y])=>[x,y,z]))),gold,entryX,.303,entryZ+.045);badge.name='entry-crest';
  add('entry-crest-inset',[.019,.012,.0015],entryX,.305,entryZ+.04775,blue,.002);
  // Trestle welcome desk: two pierced, bevelled side frames, a low shelf, a
  // recessed drawer and a turned handle.
  add('welcome-top',[.14,.009,.083],WELCOME_DESK.x,WELCOME_DESK.y-.0045,WELCOME_DESK.z,coral,.004);
  const profile=[[-.037,.002],[-.029,.042],[-.023,.049],[.023,.049],[.029,.042],[.037,.002],[.025,.002],[.018,.036],[-.018,.036],[-.025,.002]];
  for(const side of [-1,1]) {const frame=part(root,formedProfile(profile,.009,.0008),cream,WELCOME_DESK.x+side*.052,0,WELCOME_DESK.z);frame.name=`welcome-trestle-${side}`;}
  add('welcome-shelf',[.095,.004,.046],WELCOME_DESK.x,.020,WELCOME_DESK.z,blue,.001);
  add('welcome-drawer',[.090,.014,.056],WELCOME_DESK.x,.041,WELCOME_DESK.z,cream,.002);
  add('welcome-drawer-inlay',[.077,.008,.0015],WELCOME_DESK.x,.041,WELCOME_DESK.z+.02875,blue,.001);
  const pull=part(root,turned([[0,-.001],[.002,-.001],[.0025,0],[.002,.002],[0,.002]],16),gold,WELCOME_DESK.x,.041,WELCOME_DESK.z+.032);pull.rotation.x=Math.PI/2;pull.name='welcome-drawer-pull';
  boxes.push(soccerBox(WELCOME_DESK.x,WELCOME_DESK.y-.0045,WELCOME_DESK.z,.14,.009,.083),soccerBox(WELCOME_DESK.x,.020,WELCOME_DESK.z,.095,.004,.046),soccerBox(WELCOME_DESK.x,.041,WELCOME_DESK.z,.09,.014,.056));
  for(const side of [-1,1])for(const leg of [-1,1]) {
    const box=soccerBox(WELCOME_DESK.x+side*.052,.025,WELCOME_DESK.z+leg*.026,.009,.046,.010),angle=-leg*.20;
    Object.assign(box.yAxis,{x:0,y:Math.cos(angle),z:Math.sin(angle)});Object.assign(box.zAxis,{x:0,y:-Math.sin(angle),z:Math.cos(angle)});box.margin=.0006;boxes.push(box);
  }
}
