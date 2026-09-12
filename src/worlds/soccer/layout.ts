import { Box3, Vector3 } from 'three/webgpu';
import type { CollisionBox } from '../../facilities/collision.ts';

/** SI metres. +Z is the entrance, the scoring goal is at -Z. */
export const FIELD={width:2,length:3.08,y:.012,wall:.105} as const;
export const GOAL={width:.42,height:.155,depth:.15,z:-FIELD.length/2,post:.008} as const;
export const BALL={radius:.021,mass:.008,restitution:.58,rollingDrag:.20} as const;
// Calibrated force scale: settles at 3x the ordinary measured running speed.
export const SOCCER_RUN_SPEED_SCALE=2.74;
export const SOCCER_RUN_CADENCE_SCALE=3;
export const ENTRANCE={x:.60,z:2.28,width:.34,fieldZ:1.43,concourseStart:1.72} as const;
export const SOCCER_PORTAL={x:ENTRANCE.x-.24,z:ENTRANCE.z+.26} as const;
export const WELCOME_DESK={x:ENTRANCE.x+.31,z:ENTRANCE.z+.115,y:.058} as const;
export const FIELD_RAMP={x:ENTRANCE.x,width:.30,start:FIELD.length/2,end:FIELD.length/2+.16} as const;
export const SOCCER_ENVELOPE=new Box3(new Vector3(-1.43,0,-2.02),new Vector3(1.43,.49,SOCCER_PORTAL.z+.16));

export function onSoccerField(x:number,z:number) {
  return Math.abs(x)<=FIELD.width/2&&Math.abs(z)<=FIELD.length/2;
}

export function soccerBox(x:number,y:number,z:number,sx:number,sy:number,sz:number):CollisionBox {
  return {center:new Vector3(x,y,z),halfSize:new Vector3(sx/2,sy/2,sz/2),xAxis:new Vector3(1,0,0),yAxis:new Vector3(0,1,0),zAxis:new Vector3(0,0,1)};
}
