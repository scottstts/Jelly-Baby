// Conservative integration with reusable clipping storage. No per-pixel allocations.
const scratchA=new Float64Array(16),scratchB=new Float64Array(16);
export function depositBeam(buffer,size,origin,span,vertices,channel,flux) {
  const scale=size/span;
  const ax=(vertices[0][0]-origin.x)*scale,ay=(vertices[0][1]-origin.y)*scale;
  const bx=(vertices[1][0]-origin.x)*scale,by=(vertices[1][1]-origin.y)*scale;
  const cx=(vertices[2][0]-origin.x)*scale,cy=(vertices[2][1]-origin.y)*scale;
  const signed=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax),area=Math.abs(signed)*.5;
  const rgb=Array.isArray(flux)?flux:null;
  if(area<1e-14||(!rgb&&flux<=0))return;
  const density=(rgb?1:flux)/area/((span/size)**2),sign=signed<0?-1:1;
  const minX=Math.max(0,Math.floor(Math.min(ax,bx,cx))),maxX=Math.min(size-1,Math.floor(Math.max(ax,bx,cx)));
  const minY=Math.max(0,Math.floor(Math.min(ay,by,cy))),maxY=Math.min(size-1,Math.floor(Math.max(ay,by,cy)));
  const e0x=(ay-by)*sign,e0y=(bx-ax)*sign,e0c=(ax*by-bx*ay)*sign;
  const e1x=(by-cy)*sign,e1y=(cx-bx)*sign,e1c=(bx*cy-cx*by)*sign;
  const e2x=(cy-ay)*sign,e2y=(ax-cx)*sign,e2c=(cx*ay-ax*cy)*sign;
  const r0=(Math.abs(e0x)+Math.abs(e0y))*.5,r1=(Math.abs(e1x)+Math.abs(e1y))*.5,r2=(Math.abs(e2x)+Math.abs(e2y))*.5;
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++) {
    const v0=e0x*(x+.5)+e0y*(y+.5)+e0c,v1=e1x*(x+.5)+e1y*(y+.5)+e1c,v2=e2x*(x+.5)+e2y*(y+.5)+e2c;
    if(v0< -r0||v1< -r1||v2< -r2)continue;
    if(v0>=r0&&v1>=r1&&v2>=r2){addPixel(buffer,(y*size+x)*3,channel,density,rgb);continue;}
    scratchA[0]=ax;scratchA[1]=ay;scratchA[2]=bx;scratchA[3]=by;scratchA[4]=cx;scratchA[5]=cy;
    let count=clip(scratchA,3,scratchB,0,x,true);
    count=clip(scratchB,count,scratchA,0,x+1,false);
    count=clip(scratchA,count,scratchB,1,y,true);
    count=clip(scratchB,count,scratchA,1,y+1,false);
    let coverage=0;
    for(let k=1;k<count-1;k++)coverage+=(scratchA[k*2]-scratchA[0])*(scratchA[k*2+3]-scratchA[1])-(scratchA[k*2+1]-scratchA[1])*(scratchA[k*2+2]-scratchA[0]);
    addPixel(buffer,(y*size+x)*3,channel,density*Math.abs(coverage)*.5,rgb);
  }
}

function addPixel(buffer,index,channel,value,rgb) {
  if(rgb){buffer[index]+=value*rgb[0];buffer[index+1]+=value*rgb[1];buffer[index+2]+=value*rgb[2];}
  else buffer[index+channel]+=value;
}

function clip(input,count,output,axis,edge,greater) {
  let length=0;
  for(let i=0;i<count;i++) {
    const a=i*2,b=((i+1)%count)*2,av=input[a+axis],bv=input[b+axis];
    const insideA=greater?av>=edge:av<=edge,insideB=greater?bv>=edge:bv<=edge;
    if(insideA){output[length++]=input[a];output[length++]=input[a+1];}
    if(insideA!==insideB){const t=(edge-av)/(bv-av);output[length++]=input[a]+t*(input[b]-input[a]);output[length++]=input[a+1]+t*(input[b+1]-input[a+1]);}
  }
  return length/2;
}
