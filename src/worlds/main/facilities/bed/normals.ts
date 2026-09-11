import type { BufferGeometry } from 'three/webgpu';

/** Symmetric cloth tangents: independent of the grid's triangulation diagonal
 * and the very different triangle areas at the crown and hanging skirt. */
export function updateBlanketNormals(geometry:BufferGeometry,columns:number,rows:number){
  const p=geometry.attributes.position,n=geometry.attributes.normal;
  for(let z=0;z<rows;z++)for(let x=0;x<columns;x++){
    const left=z*columns+Math.max(0,x-1),right=z*columns+Math.min(columns-1,x+1);
    const back=Math.max(0,z-1)*columns+x,front=Math.min(rows-1,z+1)*columns+x;
    const sx=(p.getY(right)-p.getY(left))/(p.getX(right)-p.getX(left));
    const sz=(p.getY(front)-p.getY(back))/(p.getZ(front)-p.getZ(back));
    const inverse=1/Math.hypot(sx,1,sz);n.setXYZ(z*columns+x,-sx*inverse,inverse,-sz*inverse);
  }
  n.needsUpdate=true;
}
