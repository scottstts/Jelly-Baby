import type { SoftBody } from '../../../../physics/soft-body.js';
import { BED } from './physics.ts';

/** Rasterize the bound surface proxy vertically without dilating its silhouette. */
export class BlanketContact {
  private positions=new Float64Array(0);
  sample(body:SoftBody,heights:Float64Array,columns:number,rows:number,dx:number,dz:number){
    const surface=body.cage.opticalSurface;
    if(body.kernel){body.kernel.sampleBlanket(surface,heights,columns,rows,dx,dz,BED.x,BED.z);return;}
    if(this.positions.length!==surface.positions.length)this.positions=new Float64Array(surface.positions.length);
    const p=this.positions;
    for(let vertex=0;vertex<p.length/3;vertex++){
      const j=vertex*3;p[j]=0;p[j+1]=0;p[j+2]=0;
      for(let k=0;k<4;k++){
        const offset=vertex*4+k,id=surface.bindingIds[offset]*3,w=surface.bindingWeights[offset];
        p[j]+=body.x[id]*w;p[j+1]+=body.x[id+1]*w;p[j+2]+=body.x[id+2]*w;
      }
      p[j]=(p[j]-BED.x+.063)/dx;p[j+2]=(p[j+2]-BED.z+.026)/dz;
    }
    const ix=surface.indices;
    for(let t=0;t<ix.length;t+=3){
      const a=ix[t]*3,b=ix[t+1]*3,c=ix[t+2]*3;
      const ax=p[a],az=p[a+2],bx=p[b]-ax,bz=p[b+2]-az,cx=p[c]-ax,cz=p[c+2]-az;
      const det=bx*cz-bz*cx;if(Math.abs(det)<1e-10)continue;
      const minX=Math.max(0,Math.ceil(Math.min(ax,p[b],p[c]))),maxX=Math.min(columns-1,Math.floor(Math.max(ax,p[b],p[c])));
      const minZ=Math.max(0,Math.ceil(Math.min(az,p[b+2],p[c+2]))),maxZ=Math.min(rows-1,Math.floor(Math.max(az,p[b+2],p[c+2])));
      for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
        const u=((x-ax)*cz-(z-az)*cx)/det,v=(bx*(z-az)-bz*(x-ax))/det;
        if(u< -1e-8||v< -1e-8||u+v>1.00000001)continue;
        const y=p[a+1]+u*(p[b+1]-p[a+1])+v*(p[c+1]-p[a+1]);
        const i=z*columns+x;heights[i]=Math.max(heights[i],y+.00065);
      }
    }
  }
}
