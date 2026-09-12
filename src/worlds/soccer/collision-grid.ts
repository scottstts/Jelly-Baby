import { boxBounds, bodyCollisionBounds } from '../../facilities/collision-bounds.ts';
import type { CollisionBox } from '../../facilities/collision.ts';
import type { SoftBody } from '../../physics/soft-body.js';

/** Static spatial bins keep the many fitted seat and gate pieces out of the
 * 240 Hz narrow phase unless the live, possibly stretched jelly can reach them.
 */
export class StadiumCollisionGrid {
  private readonly cells=new Map<string,CollisionBox[]>();
  private readonly candidates:CollisionBox[]=[];
  private readonly seen=new Set<CollisionBox>();
  private readonly bounds=new Float64Array(6);
  private readonly cellSize=.16;
  private magnitude=1;
  private error=0;
  constructor(boxes:readonly CollisionBox[],body:SoftBody) {
    const weights=body.surface.bindingWeights;
    for(let i=0;i<weights.length;i+=4){let sum=0,absolute=0;for(let j=0;j<4;j++){sum+=weights[i+j];absolute+=Math.abs(weights[i+j]);}this.magnitude=Math.max(this.magnitude,absolute);this.error=Math.max(this.error,Math.abs(sum-1));}
    for(const box of boxes){boxBounds(box,box.margin??.002,this.bounds);this.visit(this.bounds,(key)=>{const bucket=this.cells.get(key)??[];bucket.push(box);this.cells.set(key,bucket);});}
  }
  private visit(b:Float64Array,fn:(key:string)=>void) {
    for(let x=Math.floor(b[0]/this.cellSize);x<=Math.floor(b[3]/this.cellSize);x++)for(let z=Math.floor(b[2]/this.cellSize);z<=Math.floor(b[5]/this.cellSize);z++)fn(`${x},${z}`);
  }
  near(body:SoftBody) {
    // Exact binding bounds include stretched/extrapolated skin and swept throws;
    // another 15 mm covers contacts created by the first collision solve.
    bodyCollisionBounds(body,this.magnitude,this.error,this.bounds);for(let i=0;i<3;i++){this.bounds[i]-=.015;this.bounds[i+3]+=.015;}
    this.candidates.length=0;this.seen.clear();this.visit(this.bounds,key=>{for(const box of this.cells.get(key)??[]){if(!this.seen.has(box)){this.seen.add(box);this.candidates.push(box);}}});return this.candidates;
  }
}
