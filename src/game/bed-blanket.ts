import type { SoftBody } from '../physics/soft-body.js';
import { BED } from './bed-physics.ts';
import { BlanketContact } from './blanket-contact.ts';
import { BlanketClearance } from './blanket-clearance.ts';
import { BlanketFairing } from './blanket-fairing.ts';

const NEIGHBORS=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]];

/** Damped height-field membrane: gravity, tension, bending, unilateral contact.
 * Fixed textile coordinates bound cost and prevent tangling; side hems hang over the mattress. */
export class BedBlanket {
  version=0;
  readonly columns=57;
  readonly rows=49;
  private readonly bodyContact=new BlanketContact();
  private readonly clearance=new BlanketClearance();
  private readonly fairing=new BlanketFairing();
  readonly renderedPositions=new Float32Array(this.columns*this.rows*3);
  renderVersion=0;
  private readonly renderWork=new Float32Array(this.columns*this.rows*3);
  readonly positions=new Float32Array(this.columns*this.rows*3);
  private readonly velocity=new Float64Array(this.columns*this.rows);
  private readonly contact=new Float64Array(this.columns*this.rows);
  private readonly next=new Float64Array(this.columns*this.rows);
  readonly dx=.126/(this.columns-1);
  readonly dz=.098/(this.rows-1);
  private readonly baseContact=new Float64Array(this.columns*this.rows);
  private readonly neighborIndices=new Int32Array(this.columns*this.rows*8);
  private readonly neighborCounts=new Uint8Array(this.columns*this.rows);
  private lastPreparedVersion=-1;
  private lastPreparedSurfaceRevision=-1;
  private lastPreparedOccupied=false;
  constructor(){
    for(let z=0;z<this.rows;z++)for(let x=0;x<this.columns;x++){
      const i=z*this.columns+x;
      this.baseContact[i]=this.base(x);
      let count=0;
      for(const [ox,oz] of NEIGHBORS){
        const nx=x+ox,nz=z+oz;
        if(nx<0||nx>=this.columns||nz<0||nz>=this.rows)continue;
        this.neighborIndices[i*8+count++]=nz*this.columns+nx;
      }
      this.neighborCounts[i]=count;
    }
    this.reset();
  }
  reset(){
    this.version++;
    this.lastPreparedVersion=-1;
    this.lastPreparedSurfaceRevision=-1;
    this.lastPreparedOccupied=false;
    this.velocity.fill(0);
    for(let z=0;z<this.rows;z++)for(let x=0;x<this.columns;x++){
      const i=z*this.columns+x,j=i*3;
      this.positions[j]=-.063+x*this.dx;this.positions[j+2]=-.026+z*this.dz;
      this.positions[j+1]=this.baseContact[i];
    }
  }
  private base(x:number){return BED.top+.0018-Math.max(0,Math.abs(-.063+x*this.dx)-.051)*1.5;}
  /** Allocate and execute both native blanket collision paths without changing cloth. */
  warmup(body:SoftBody){
    if(!body.kernel)return;
    const contact=this.baseContact.slice(),cloth=this.positions.slice();
    for(let i=0;i<4;i++){
      this.bodyContact.sample(body,contact,this.columns,this.rows,this.dx,this.dz);
      this.clearance.resolve(body,cloth,this.columns,this.rows,this.dx,this.dz);
    }
  }
  prepareRender(body:SoftBody,occupied:boolean){
    const surfaceRevision=occupied?body.surfaceRevision:-1;
    if(this.lastPreparedVersion===this.version&&this.lastPreparedSurfaceRevision===surfaceRevision&&this.lastPreparedOccupied===occupied)return;
    this.renderWork.set(this.positions);
    if(occupied){
      this.clearance.resolve(body,this.renderWork,this.columns,this.rows,this.dx,this.dz);
      this.fairing.smooth(this.renderWork,this.columns,this.rows);
    }
    this.lastPreparedVersion=this.version;this.lastPreparedSurfaceRevision=surfaceRevision;this.lastPreparedOccupied=occupied;
    let changed=false;
    for(let i=0;i<this.renderWork.length;i++)if(this.renderedPositions[i]!==this.renderWork[i]){changed=true;break;}
    if(changed){this.renderedPositions.set(this.renderWork);this.renderVersion++;}
  }
  step(h:number,body:SoftBody,occupied:boolean){
    this.contact.set(this.baseContact);
    if(occupied)this.bodyContact.sample(body,this.contact,this.columns,this.rows,this.dx,this.dz);
    for(let i=0;i<this.columns*this.rows;i++){
      const y=this.positions[i*3+1],offset=i*8,count=this.neighborCounts[i];let sum=0;
      for(let k=0;k<count;k++)sum+=this.positions[this.neighborIndices[offset+k]*3+1]-y;
      // A light conforming preload pulls excess fabric down to its support.
      // Tension smooths free folds without bridging across the body's contour.
      const preload=occupied?300*(this.contact[i]-y):0;
      const acceleration=-2.4+180*sum/Math.max(1,count)+preload-22*this.velocity[i];
      this.velocity[i]+=acceleration*h;
      let next=y+this.velocity[i]*h;
      if(next<this.contact[i]){next=this.contact[i];this.velocity[i]=Math.max(0,this.velocity[i])*.15;}
      this.next[i]=next;
    }
    let changed=false;
    for(let i=0;i<this.next.length;i++)if(Math.abs(this.positions[i*3+1]-this.next[i])>1e-7){this.positions[i*3+1]=this.next[i];changed=true;}
    if(changed)this.version++;
  }
}
