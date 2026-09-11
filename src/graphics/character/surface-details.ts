import { BufferAttribute, BufferGeometry } from 'three/webgpu';

/** Tessellate flat artwork before projecting it onto a curved, deforming skin. */
export function refinePatch(source:BufferGeometry,passes=2) {
  const attribute=source.getAttribute('position');
  let positions=Array.from(attribute.array);
  let indices=source.index?Array.from(source.index.array):Array.from({length:attribute.count},(_,i)=>i);
  for(let pass=0;pass<passes;pass++) {
    const edges=new Map<string,number>(),next:number[]=[];
    const midpoint=(a:number,b:number)=>{
      const key=`${Math.min(a,b)},${Math.max(a,b)}`;
      if(edges.has(key))return edges.get(key)!;
      const id=positions.length/3;
      for(let k=0;k<3;k++)positions.push((positions[a*3+k]+positions[b*3+k])*.5);
      edges.set(key,id);return id;
    };
    for(let i=0;i<indices.length;i+=3) {
      const [a,b,c]=indices.slice(i,i+3),ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
      next.push(a,ab,ca,b,bc,ab,c,ca,bc,ab,bc,ca);
    }
    indices=next;
  }
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new BufferAttribute(new Float32Array(positions),3));
  geometry.setIndex(indices);source.dispose();return geometry;
}
