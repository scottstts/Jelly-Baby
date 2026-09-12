import type { Group, Material } from 'three/webgpu';
import type { CollisionBox } from '../../facilities/collision.ts';
import { solidLoft } from '../../graphics/shared/manufactured-geometry.ts';
import { part } from '../../graphics/shared/toy-parts.ts';
import { FIELD, FIELD_RAMP as RAMP, PITCH_CONTACT_MARGIN, soccerBox } from './layout.ts';

export function stadiumRamp(root:Group,boxes:CollisionBox[],material:Material) {
  // A finite toe face keeps the tread and underside apart even at grazing
  // angles. The high end meets the turf, with no trench between the surfaces.
  const profile=[[RAMP.baseY,RAMP.start],[FIELD.y,RAMP.start],[RAMP.toeY,RAMP.end],[RAMP.baseY,RAMP.end]];
  part(root,solidLoft([-1,1].map(side=>profile.map(([y,z])=>[RAMP.x+side*RAMP.width/2,y,z]))),material).name='field-access-ramp';

  // One continuous inclined contact plane. Its end caps are buried inside
  // the pitch and below the table; no thin segment undersides can trap skin.
  const slope=(FIELD.y-RAMP.toeY)/(RAMP.end-RAMP.start),angle=Math.atan(slope),sin=Math.sin(angle),cos=Math.cos(angle);
  const start=RAMP.start-.002,end=RAMP.end+.03,z=(start+end)/2,y=FIELD.y-(z-RAMP.start)*slope,depth=.03;
  const box=soccerBox(RAMP.x,y-cos*depth/2,z-sin*depth/2,RAMP.width,depth,(end-start)/cos);
  Object.assign(box.yAxis,{x:0,y:cos,z:sin});Object.assign(box.zAxis,{x:0,y:-sin,z:cos});
  box.margin=PITCH_CONTACT_MARGIN;box.skipThrowSweep=true;boxes.push(box);
}
