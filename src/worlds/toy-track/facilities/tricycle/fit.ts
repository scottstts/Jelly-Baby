import type { SoftBody } from '../../../../physics/soft-body.js';

export const SEAT_HEIGHT=.044;
export type GripFit={x:number;y:number;z:number};
export const DEFAULT_GRIPS:GripFit[]=[{x:-.041,y:.026,z:0},{x:.041,y:.026,z:0}];
/** Reconstruct rest skin from its cage bindings; grip top touches the underside
 * of the outer arm, not an arbitrary cage node or current deformed pose. */
export function fitGrips(body:SoftBody):GripFit[] {
  const {bindingIds:ids,bindingWeights:weights}=body.surface;
  return [-1,1].map(side=>{
    const samples:{x:number;y:number;z:number}[]=[];
    for(let i=0;i<ids.length;i+=4) {
      let x=0,y=0,z=0;
      for(let k=0;k<4;k++){const j=ids[i+k]*3,w=weights[i+k];x+=body.rest[j]*w;y+=body.rest[j+1]*w;z+=body.rest[j+2]*w;}
      if(x*side>.037&&x*side<.047&&y>.018&&y<.047)samples.push({x,y,z});
    }
    samples.sort((a,b)=>a.y-b.y);
    const underside=samples.slice(0,Math.max(1,Math.floor(samples.length*.13)));
    if(!underside.length)throw new Error('Tricycle grip fitting found no arm skin');
    return underside.reduce((p,v)=>({x:p.x+v.x/underside.length,y:p.y+v.y/underside.length,z:p.z+v.z/underside.length}),{x:0,y:0,z:0});
  });
}
