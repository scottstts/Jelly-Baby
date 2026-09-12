import type { SoftBody } from '../../physics/soft-body.js';
import { FacilityCollision, type CollisionMotion } from '../../facilities/collision.ts';
import { soccerBox } from './layout.ts';
import type { SkateRig } from './physics.ts';

/** Compound core/arms/skates with reciprocal finite-mass recoil. The contact
 * envelope follows the live cage centre, including a keeper's jump and lean.
 */
export class GoalieContact {
  private readonly collision:FacilityCollision;
  private readonly rig:SkateRig;
  private readonly boxes=[soccerBox(0,0,0,.042,.041,.031),soccerBox(0,0,0,.036,.024,.029),soccerBox(0,0,0,.016,.020,.024),soccerBox(0,0,0,.016,.020,.024),soccerBox(0,0,0,.041,.013,.038)];
  constructor(player:SoftBody,rig:SkateRig) {
    this.collision=new FacilityCollision(player);this.rig=rig;
    const body=rig.body;
    const motion:CollisionMotion={
      velocityAt(_x,_y,_z,out){Object.assign(out,rig.velocity);},
      inverseMassAt(){return 1/body.totalMass;},
      applyImpulse(_x,_y,_z,x,y,z){for(let j=0;j<body.velocity.length;j+=3){body.velocity[j]+=x/body.totalMass;body.velocity[j+1]+=y/body.totalMass;body.velocity[j+2]+=z/body.totalMass;}body.wake();},
    };
    for(const box of this.boxes){box.margin=.0007;box.motion=motion;}
  }
  resolve() {
    const g=this.rig,b=g.body,c=Math.cos(g.yaw),s=Math.sin(g.yaw),base=b.center.y-g.restCenter.y;
    const offsets=[[0,.023,0],[0,.052,0],[-.028,.034,0],[.028,.034,0],[0,-.006,0]];
    this.boxes.forEach((box,i)=>{const [x,y,z]=offsets[i];Object.assign(box.center,{x:b.center.x+x*c+z*s,y:base+y,z:b.center.z+z*c-x*s});Object.assign(box.xAxis,{x:c,y:0,z:-s});Object.assign(box.zAxis,{x:s,y:0,z:c});});
    this.collision.resolveBoxes(this.boxes);
  }
  warmup(){this.collision.warmupBoxes(this.boxes);}
  dispose(){this.collision.dispose();}
}
