/** A relaxed tension envelope over the contact surface. Convex supported tops
 * stay fitted; unsupported sides bridge into a broad drape instead of tracing
 * the body's steep silhouette. The opening and mattress hems stay anchored. */
export class BlanketFairing {
  private current=new Float32Array(0);
  private next=new Float32Array(0);
  smooth(p:Float32Array,columns:number,rows:number){
    const size=columns*rows;
    if(this.current.length!==size){
      this.current=new Float32Array(size);
      this.next=new Float32Array(size);
    }
    for(let i=0;i<size;i++)this.current[i]=p[i*3+1];
    // A few local smoothing passes only polish the same tight ridge. Relax
    // across ~2 cm of fabric so the skirt can detach from hidden body contours.
    for(let pass=0;pass<128;pass++){
      this.next.set(this.current);
      let largestChange=0;
      for(let z=1;z<rows-1;z++)for(let x=1;x<columns-1;x++){
        const i=z*columns+x;
        // Symmetric stencil removes the directional crease left by triangle
        // contact order. Jacobi updates avoid sweeping the crease sideways.
        const value=this.current[i],mean=(this.current[i-1]+this.current[i+1]+this.current[i-columns]+this.current[i+columns])*.25;
        const relaxed=Math.max(value,value+.65*(mean-value));
        this.next[i]=relaxed;
        largestChange=Math.max(largestChange,relaxed-value);
      }
      const swap=this.current;this.current=this.next;this.next=swap;
      if(largestChange<1e-7)break;
    }
    for(let i=0;i<size;i++)p[i*3+1]=this.current[i];
  }
}
