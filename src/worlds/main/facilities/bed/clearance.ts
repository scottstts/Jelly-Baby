import type { SoftBody } from '../../../../physics/soft-body.js';
import { BED } from './physics.ts';

/** Final contact against the exact rendered skin, including triangle interiors.
 * Clipping in X/Z makes the clearance proof piecewise linear: the minimum gap
 * lies at a vertex of each skin/fabric intersection polygon. */
export class BlanketClearance {
  private readonly a=new Float64Array(30);
  private readonly b=new Float64Array(30);
  private readonly source=new Float64Array(9);
  private readonly distances=new Float64Array(10);
  private projected=new Float64Array(0);
  private clip(input:Float64Array,count:number,output:Float64Array,nx:number,nz:number,offset:number){
    let allInside=true,allOutside=true;
    for(let i=0;i<count;i++){
      const j=i*3,d=input[j]*nx+input[j+2]*nz-offset;
      this.distances[i]=d;
      if(d<0)allInside=false;
      else allOutside=false;
    }
    if(allInside){
      output.set(input.subarray(0,count*3),0);
      return count;
    }
    if(allOutside)return 0;
    let size=0;
    for(let i=0;i<count;i++){
      const j=i*3,previous=(i+count-1)%count,k=previous*3;
      const d=this.distances[i],e=this.distances[previous];
      if((d>=0)!==(e>=0)){
        const t=e/(e-d);
        for(let axis=0;axis<3;axis++)output[size*3+axis]=input[k+axis]+t*(input[j+axis]-input[k+axis]);
        size++;
      }
      if(d>=0){for(let axis=0;axis<3;axis++)output[size*3+axis]=input[j+axis];size++;}
    }
    return size;
  }
  resolve(body:SoftBody,cloth:Float32Array,columns:number,rows:number,dx:number,dz:number){
    if(body.kernel)return body.kernel.clearBlanket(body.surface,cloth,columns,rows,dx,dz,BED.x,BED.z);
    const positions=body.surface.positions,ix=body.surface.indices;
    if(this.projected.length!==positions.length)this.projected=new Float64Array(positions.length);
    const p=this.projected;
    for(let j=0;j<p.length;j+=3){p[j]=(positions[j]-BED.x+.063)/dx;p[j+1]=positions[j+1];p[j+2]=(positions[j+2]-BED.z+.026)/dz;}
    let changed=false;
    for(let t=0;t<ix.length;t+=3){
      let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,top=-Infinity;
      for(let k=0;k<3;k++){
        const j=ix[t+k]*3,o=k*3,x=p[j],z=p[j+2];
        this.source[o]=x;this.source[o+1]=p[j+1];this.source[o+2]=z;
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);top=Math.max(top,p[j+1]);
      }
      for(let z=Math.max(0,Math.floor(minZ));z<=Math.min(rows-2,Math.floor(maxZ));z++)
        for(let x=Math.max(0,Math.floor(minX));x<=Math.min(columns-2,Math.floor(maxX));x++){
          const a=z*columns+x,b=a+1,c=a+columns,d=c+1;
          if(top+.00045<=Math.min(cloth[a*3+1],cloth[b*3+1],cloth[c*3+1],cloth[d*3+1]))continue;
          // Clip the skin triangle to this cell, then to each actual fabric triangle.
          this.a.set(this.source);let count=3;
          count=this.clip(this.a,count,this.b,1,0,x);
          if(!count)continue;
          count=this.clip(this.b,count,this.a,-1,0,-x-1);
          if(!count)continue;
          count=this.clip(this.a,count,this.b,0,1,z);
          if(!count)continue;
          count=this.clip(this.b,count,this.a,0,-1,-z-1);
          if(!count)continue;
          for(let half=0;half<2;half++){
            const size=this.clip(this.a,count,this.b,half?1:-1,half?1:-1,(half?1:-1)*(x+z+1));
            const i0=half?d:a,i1=half?c:b,i2=half?b:c;
            for(let k=0;k<size;k++){
              const u=this.b[k*3]-x,v=this.b[k*3+2]-z;
              const w0=Math.max(0,half?u+v-1:1-u-v),w1=Math.max(0,half?1-u:u),w2=Math.max(0,half?1-v:v);
              const height=cloth[i0*3+1]*w0+cloth[i1*3+1]*w1+cloth[i2*3+1]*w2;
              const depth=this.b[k*3+1]+.00045-height;
              if(depth<=0)continue;
              // Positive-only barycentric projection cannot undo earlier contacts.
              const target=this.b[k*3+1]+.00045001;
              const d0=Math.max(0,target-cloth[i0*3+1]),d1=Math.max(0,target-cloth[i1*3+1]),d2=Math.max(0,target-cloth[i2*3+1]);
              const amount=Math.min(1,(depth+1e-8)/(w0*d0+w1*d1+w2*d2));
              // Spend correction on low corners first. Already-clear crown
              // vertices must not inflate when the adjacent side is steep.
              cloth[i0*3+1]+=amount*d0;cloth[i1*3+1]+=amount*d1;cloth[i2*3+1]+=amount*d2;changed=true;
            }
          }
        }
    }
    return changed;
  }
}
