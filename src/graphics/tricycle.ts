import * as T from 'three/webgpu';
import { batch, disposeParts, enamel, part, rod, rounded, tube } from './toy-parts.ts';
import { solidLoft, wheelFender, turned } from './manufactured-geometry.ts';
import { DEFAULT_GRIPS, SEAT_HEIGHT, type GripFit } from '../game/tricycle-fit.ts';

/** Seat and front fork are equal crank arms on a visible parallel four-bar linkage. */
export class Tricycle {
  readonly group=new T.Group();
  readonly seat=new T.Group();
  readonly fork=new T.Group();
  private readonly wheels:T.Group[]=[];
  private readonly links:T.Mesh[]=[];
  private readonly cranks:T.Group[]=[];
  constructor(grips:GripFit[]=DEFAULT_GRIPS,keepParts=false) {
    this.group.name='tricycle';this.seat.name='rotating-saddle';this.fork.name='steering-fork';
    const coral=enamel(0xec9588),ivory=enamel(0xffedc9),teal=enamel(0x589f98),tire=enamel(0x435c60,.65);
    const brass=new T.MeshPhysicalNodeMaterial({color:0xdab56a,metalness:.7,roughness:.26});
    const frame=new T.Group();frame.name='chassis';this.group.add(frame);
    tube(frame,[[0,.026,-.037],[0,.029,-.005],[0,.051,.030],[0,.057,.056]],.004,coral).name='continuous-spine';
    rod(frame,new T.Vector3(-.040,.015,-.034),new T.Vector3(.040,.015,-.034),.003,brass).name='rear-axle';
    tube(frame,[[-.032,.016,-.034],[-.020,.027,-.018],[0,.032,0],[.020,.027,-.018],[.032,.016,-.034]],.003,ivory).name='rear-cradle';
    part(frame,new T.CylinderGeometry(.009,.011,.009,24),brass,0,.034,0).name='seat-bearing';
    this.seat.position.y=.039;this.group.add(this.seat);
    const oval=(rx:number,rz:number,y:number)=>Array.from({length:48},(_,i)=>{const a=i*Math.PI/24;return [rx*Math.cos(a),y,rz*Math.sin(a)-.002];});
    part(this.seat,solidLoft([oval(.028,.020,-.005),oval(.031,.023,-.0035),oval(.032,.024,-.001),oval(.031,.023,.001)]),coral).name='molded-seat-pan';
    part(this.seat,solidLoft([oval(.028,.020,.001),oval(.028,.020,.0025),oval(.026,.018,.005)]),ivory).name='inset-seat-pad';
    tube(this.seat,[[-.024,.003,-.018],[-.023,.014,-.025],[0,.019,-.027],[.023,.014,-.025],[.024,.003,-.018]],.0027,coral);
    for(const [index,side] of [-1,1].entries()) {
      const grip=grips[index],y=SEAT_HEIGHT+grip.y-this.seat.position.y-.0025;
      tube(this.seat,[[side*.024,-.002,0],[side*.034,.006,grip.z],[grip.x,y-.002,grip.z]],.0025,brass).name=`grip-riser-${side}`;
      const handle=rounded(this.seat,[.012,.005,.010],teal,grip.x,y,grip.z,.002);handle.name=`arm-grip-${side}`;
      handle.userData.contactTop=[grip.x,SEAT_HEIGHT+grip.y,grip.z];
      // End ferrules are proud of the grip sides; no applied stripes overlap its top.
      for(const end of [-1,1])rounded(this.seat,[.001,.0048,.0098],brass,grip.x+end*.006,y,grip.z,.0008);
      rod(frame,new T.Vector3(0,.029,-.005),new T.Vector3(side*.025,.012,.025),.0024,coral).name=`footrest-bracket-${side}`;
      rounded(frame,[.012,.004,.022],ivory,side*.025,.012,.025,.002).name=`footrest-${side}`;
    }
    this.fork.position.set(0,0,.056);this.group.add(this.fork);
    part(this.fork,new T.CylinderGeometry(.0045,.0045,.014,20),brass,0,.057,0).name='steering-spindle';
    for(const side of [-1,1])tube(this.fork,[[0,.057,0],[side*.014,.047,0],[side*.014,.023,0]],.0026,coral).name=`fork-blade-${side}`;
    rod(this.fork,new T.Vector3(-.019,.023,0),new T.Vector3(.019,.023,0),.002,brass).name='front-axle';
    part(this.fork,wheelFender(.026,.015,.0014),ivory,0,.023,0).name='formed-front-mudguard';
    for(const side of [-1,1])rod(this.fork,new T.Vector3(side*.014,.025,0),new T.Vector3(side*.006,.041,.020),.001,brass).name=`mudguard-stay-${side}`;
    const wheel=(root:T.Group,x:number,y:number,z:number,r:number)=>{
      const g=new T.Group();g.name=`wheel-${this.wheels.length}`;g.position.set(x,y,z);root.add(g);this.wheels.push(g);
      const ring=part(g,new T.TorusGeometry(r-.003,.003,10,40),tire);ring.rotation.y=Math.PI/2;ring.name='rubber-tyre';
      const hub=part(g,turned([[0,-.0025],[r-.007,-.0025],[r-.006,-.0015],[r-.006,.0015],[r-.007,.0025],[0,.0025]],40),teal);hub.rotation.z=Math.PI/2;hub.name='molded-wheel-hub';
      for(const side of [-1,1]) {
        const rim=part(g,new T.TorusGeometry(r-.007,.0007,8,40),ivory,side*.0027,0,0);rim.rotation.y=Math.PI/2;rim.name=`hub-trim-${side}`;
        const cap=part(g,new T.SphereGeometry(.004,12,8),brass,side*.004,0,0);cap.scale.x=.4;cap.name=`axle-cap-${side}`;
        for(let i=0;i<5;i++){const a=i*Math.PI*2/5;rod(g,new T.Vector3(side*.0032,Math.cos(a)*.0045,Math.sin(a)*.0045),new T.Vector3(side*.0032,Math.cos(a)*(r-.007),Math.sin(a)*(r-.007)),.0008,ivory).name=`raised-spoke-${side}-${i}`;}
      }
      return g;
    };
    wheel(this.fork,0,.023,0,.023);
    for(const side of [-1,1])wheel(this.group,side*.036,.015,-.034,.015);
    for(const side of [-1,1]) {
      const crank=new T.Group();crank.name=`pedal-crank-${side}`;crank.position.set(side*.019,.023,0);this.fork.add(crank);this.cranks.push(crank);
      rod(crank,new T.Vector3(),new T.Vector3(0,side*.010,0),.0015,brass);
      rounded(crank,[.009,.004,.007],coral,side*.004,side*.010,0,.001);
      rod(this.seat,new T.Vector3(0,-.009,0),new T.Vector3(side*.018,-.009,0),.0015,brass).name=`seat-steering-crank-${side}`;
      rod(this.fork,new T.Vector3(0,.054,0),new T.Vector3(side*.018,.054,0),.0015,brass).name=`fork-steering-crank-${side}`;
      part(this.seat,new T.SphereGeometry(.0022,12,8),brass,side*.018,-.009,0).name=`seat-link-bearing-${side}`;
      part(this.fork,new T.SphereGeometry(.0022,12,8),brass,side*.018,.054,0).name=`fork-link-bearing-${side}`;
      const link=part(this.group,new T.CylinderGeometry(.0012,.0012,1,10),brass);link.name=`steering-link-${side}`;this.links.push(link);
    }
    for(const root of [frame,this.seat,...this.wheels,...this.cranks]){root.userData.keepParts=keepParts;batch(root);}
    const forkShell=new T.Group();this.fork.add(forkShell);
    for(const child of [...this.fork.children])if(child instanceof T.Mesh)forkShell.add(child);
    forkShell.userData.keepParts=keepParts;batch(forkShell);
    let index=0;this.group.traverse(o=>{if(o instanceof T.Mesh&&!o.name)o.name=`fitting-${index++}`;});this.update(0,0);
  }
  update(steer:number,travel:number) {
    this.seat.rotation.y=this.fork.rotation.y=steer;
    this.wheels.forEach((wheel,i)=>wheel.rotation.x=travel/(i===0?.023:.015));
    this.cranks.forEach(crank=>crank.rotation.x=travel/.023);
    for(let i=0;i<2;i++) {
      const side=i===0?-1:1,x=side*.018*Math.cos(steer),z=-side*.018*Math.sin(steer);
      const a=new T.Vector3(x,.030,z),b=new T.Vector3(x,.054,z+.056),link=this.links[i];
      link.position.copy(a).add(b).multiplyScalar(.5);link.scale.y=a.distanceTo(b);
      link.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.sub(a).normalize());
    }
  }
  dispose(){disposeParts(this.group);}
}
