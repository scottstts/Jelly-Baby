import { DataUtils, Quaternion, Vector3 } from 'three/webgpu';

export type HDRImage={data:Uint16Array;width:number;height:number};
export const STUDIO_KEY=new Vector3(-.55,.76,.35).normalize();

/** Relight the supplied photograph: move its window above the set and flag the fill. */
export function shapeStudioLight(image:HDRImage,originalWindow:Vector3):HDRImage {
  const {width,height,data}=image,channels=data.length/(width*height);
  const output=new Uint16Array(width*height*4);
  const rotation=new Quaternion().setFromUnitVectors(originalWindow,STUDIO_KEY).invert();
  const direction=new Vector3();
  const core=Math.cos(.22),edge=Math.cos(.70);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const phi=((y+.5)/height-.5)*Math.PI,theta=((x+.5)/width-.5)*Math.PI*2;
    direction.set(Math.cos(phi)*Math.cos(theta),Math.sin(phi),Math.cos(phi)*Math.sin(theta)).applyQuaternion(rotation);
    const u=(Math.atan2(direction.z,direction.x)/(2*Math.PI)+.5)*width-.5;
    const v=(Math.asin(Math.max(-1,Math.min(1,direction.y)))/Math.PI+.5)*height-.5;
    const ix=Math.floor(u),iy=Math.floor(v),fx=u-ix,fy=v-iy;
    const t=Math.max(0,Math.min(1,(direction.dot(originalWindow)-edge)/(core-edge)));
    const mask=t*t*(3-2*t);
    // Black flags reduce room spill; the photographed window becomes a broad key.
    // The exact edited HDR is also integrated for shadow/caustic energy below.
    const gain=.14+2.86*mask;
    const dst=(y*width+x)*4;
    for(let c=0;c<3;c++) {
      let value=0;
      for(let dy=0;dy<=1;dy++)for(let dx=0;dx<=1;dx++) {
        const sx=((ix+dx)%width+width)%width,sy=Math.max(0,Math.min(height-1,iy+dy));
        value+=DataUtils.fromHalfFloat(data[(sy*width+sx)*channels+c])*(dx?fx:1-fx)*(dy?fy:1-fy);
      }
      output[dst+c]=DataUtils.toHalfFloat(Math.min(60000,value*gain));
    }
    output[dst+3]=DataUtils.toHalfFloat(1);
  }
  return {width,height,data:output};
}
