import type { SoftBody } from '../../physics/soft-body.js';

/** A rest-space XY lookup: expression motion slides over the actual skin triangles.
 * Positions and normals are then sampled from those same triangles after physics.
 * The small spatial bins avoid raycasts and stencil rebuilds per frame. */
export class FaceSkin {
  private readonly rest:Float32Array;
  private readonly bins=new Map<string,number[]>();
  private readonly cell=.002;
  private readonly body:SoftBody;
  constructor(body:SoftBody) {
    this.body=body;
    this.rest=new Float32Array(body.surface.positions);
    const p=this.rest,ix=body.surface.indices;
    for(let t=0;t<ix.length;t+=3) {
      const a=ix[t]*3,b=ix[t+1]*3,c=ix[t+2]*3;
      const det=(p[b]-p[a])*(p[c+1]-p[a+1])-(p[b+1]-p[a+1])*(p[c]-p[a]);
      if(det<=1e-14)continue;
      const minX=Math.max(-.025,Math.min(p[a],p[b],p[c])),maxX=Math.min(.025,Math.max(p[a],p[b],p[c]));
      const minY=Math.max(.025,Math.min(p[a+1],p[b+1],p[c+1])),maxY=Math.min(.062,Math.max(p[a+1],p[b+1],p[c+1]));
      for(let x=Math.floor(minX/this.cell);x<=Math.floor(maxX/this.cell);x++)
        for(let y=Math.floor(minY/this.cell);y<=Math.floor(maxY/this.cell);y++) {
          const key=`${x},${y}`,bin=this.bins.get(key);
          if(bin)bin.push(t);else this.bins.set(key,[t]);
        }
    }
  }
  // out contains deformed xyz followed by its unit normal.
  sample(x:number,y:number,offset:number,out:Float64Array) {
    const p=this.rest,ix=this.body.surface.indices;
    const bin=this.bins.get(`${Math.floor(x/this.cell)},${Math.floor(y/this.cell)}`);
    let best=-Infinity,triangle=-1,u=0,v=0;
    if(bin)for(const t of bin) {
      const a=ix[t]*3,b=ix[t+1]*3,c=ix[t+2]*3;
      const bx=p[b]-p[a],by=p[b+1]-p[a+1],cx=p[c]-p[a],cy=p[c+1]-p[a+1];
      const det=bx*cy-by*cx,dx=x-p[a],dy=y-p[a+1];
      const bu=(dx*cy-dy*cx)/det,bv=(bx*dy-by*dx)/det;
      if(bu< -1e-7||bv< -1e-7||bu+bv>1.0000001)continue;
      const z=p[a+2]*(1-bu-bv)+p[b+2]*bu+p[c+2]*bv;
      if(z>best){best=z;triangle=t;u=bu;v=bv;}
    }
    if(triangle<0)throw new Error('Animated facial detail outside the jelly surface');
    const positions=this.body.surface.positions,n=this.body.surface.geometry.attributes.normal.array;
    out.fill(0);
    for(let k=0;k<3;k++) {
      const id=ix[triangle+k]*3,w=k===0?1-u-v:k===1?u:v;
      for(let axis=0;axis<3;axis++){out[axis]+=positions[id+axis]*w;out[axis+3]+=n[id+axis]*w;}
    }
    const length=Math.hypot(out[3],out[4],out[5])||1;
    for(let axis=0;axis<3;axis++){out[axis+3]/=length;out[axis]+=out[axis+3]*offset;}
  }
}
