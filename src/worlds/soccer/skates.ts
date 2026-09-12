import { Group, Vector3 } from 'three/webgpu';
import { batch, disposeParts, enamel, part } from '../../graphics/shared/toy-parts.ts';
import { moldedBox, solidLoft, turned } from '../../graphics/shared/manufactured-geometry.ts';
import { SKATE } from './layout.ts';

/** Two low rocker cradles support the jelly's flat underside, with no boots. */
export class JellySkates {
  readonly group=new Group();
  private readonly wheels:Group[]=[];
  private readonly sideGroups:Group[]=[];
  private readonly sides:number[]=[];
  constructor(keepParts=false) {
    this.group.name='jelly-skates';
    const cream=enamel(0xffe9b8),blue=enamel(0x3466ba),rubber=enamel(0x35424d,.65),axle=enamel(0xd9b978,.3);
    for(const side of [-1,1]) {
      const sideGroup=new Group();sideGroup.name=`skate-${side}`;sideGroup.position.x=side*SKATE.halfWidth;this.group.add(sideGroup);this.sideGroups.push(sideGroup);this.sides.push(side);
      const frame=new Group();frame.name=`cradle-${side}`;frame.userData.keepParts=keepParts;sideGroup.add(frame);
      // A continuous shallow saddle with raised lateral lips and rounded ends.
      const rings=Array.from({length:13},(_,i)=>{
        const z=-.018+i*.003,t=Math.sin(Math.PI*i/12),w=.0065+.0015*t;
        return [[-w,.010,z],[-w,.014,z],[-w+.002,.014,z],[-w+.003,.012,z],[w-.003,.012,z],[w-.002,.014,z],[w,.014,z],[w,.010,z]];
      });
      part(frame,solidLoft(rings),cream).name='saddle-shell';
      for(const cheek of [-1,1])part(frame,moldedBox([.0018,.007,.029],.0006),blue,cheek*.0045,.0065,0).name=`bearing-cheek-${cheek}`;
      for(let i=0;i<3;i++) {
        const wheel=new Group();wheel.name=`wheel-${side}-${i}`;wheel.position.set(0,SKATE.wheelRadius,(i-1)*.011);sideGroup.add(wheel);this.wheels.push(wheel);
        const profile=[[0,-.0028],[.0038,-.0028],[.0045,-.002],[.0045,.002],[.0038,.0028],[0,.0028]];
        const tyre=part(wheel,turned(profile,16),rubber);tyre.rotation.z=Math.PI/2;tyre.name='urethane-wheel';
        for(const sign of [-1,1]) {const hub=part(wheel,turned([[0,-.0004],[.0015,-.0004],[.0015,.0004],[0,.0004]],12),axle,sign*.0032,0,0);hub.rotation.z=Math.PI/2;hub.name=`bearing-${sign}`;}
        wheel.userData.keepParts=keepParts;batch(wheel);
      }
      batch(frame);
    }
  }
  update(position:Vector3,yaw:number,distance:number,pivotPhase=0,pivotWeight=0){
    this.group.position.copy(position);this.group.rotation.y=yaw;
    const weight=Math.max(0,Math.min(1,pivotWeight)),sine=Math.sin(pivotPhase);
    for(let i=0;i<this.sideGroups.length;i++) {
      const side=this.sides[i],group=this.sideGroups[i];group.position.x=side*SKATE.halfWidth;group.position.y=Math.max(0,side*sine)*weight*.004;group.position.z=0;group.rotation.set(0,0,0);
    }
    for(const wheel of this.wheels)wheel.rotation.x=distance/SKATE.wheelRadius;
  }
  dispose(){disposeParts(this.group);}
}
