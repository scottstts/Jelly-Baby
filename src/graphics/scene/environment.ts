import * as THREE from 'three/webgpu';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { shapeStudioLight } from './studio-light.ts';

export async function loadEnvironment(renderer:THREE.WebGPURenderer,scene:THREE.Scene,night=false) {
  const source=await new EXRLoader().setDataType(THREE.HalfFloatType).loadAsync((night?new URL('../../assets/night.exr',import.meta.url):new URL('../../assets/bg_room.exr',import.meta.url)).href);
  source.mapping=THREE.EquirectangularReflectionMapping;
  source.colorSpace=THREE.LinearSRGBColorSpace;
  const original=source.image as {data:Uint16Array;width:number;height:number};
  const studio=night?original:shapeStudioLight(original,measureWindow(original).incoming.negate());
  source.image.data=studio.data;source.needsUpdate=true;
  const lighting=measureWindow(studio,night);
  const intensity=night ? .45 : .9;
  lighting.irradiance*=intensity/.9;
  const pmrem=new THREE.PMREMGenerator(renderer);
  const target=pmrem.fromEquirectangular(source);
  const apply=()=>{scene.environment=target.texture;scene.environmentIntensity=intensity;};
  if(!night)apply();
  return {...lighting,apply,dispose:()=>{target.dispose();source.dispose();pmrem.dispose();}};
}

export function measureWindow(image:{data:Uint16Array;width:number;height:number},upperPeakOnly=false) {
  // Match Three's equirectUV: u=atan2(z,x)/2π+.5, v=asin(y)/π+.5.
  // EXRLoader writes scanlines in texture order, with flipY=false.
  const {data,width,height}=image;
  const channelCount=data.length/(width*height);
  let peak=0;
  const upperLuminance:number[]=[];
  for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2) {
    const k=(y*width+x)*channelCount;
    const l=.2126*THREE.DataUtils.fromHalfFloat(data[k])+.7152*THREE.DataUtils.fromHalfFloat(data[k+1])+.0722*THREE.DataUtils.fromHalfFloat(data[k+2]);
    // Night's brightest patch is below the horizon; it must not suppress
    // detection of the weaker overhead emitter that casts tabletop shadows.
    if(!upperPeakOnly||y>=height/2)peak=Math.max(peak,l);
    if(y>=height/2)upperLuminance.push(l);
  }
  upperLuminance.sort((a,b)=>a-b);
  // Separate the luminous window from the room, rather than sampling only its
  // brightest few sky pixels. This retains its full incident flux and broad color.
  const threshold=Math.max(upperLuminance[upperLuminance.length>>1]*3,peak*.025);
  const sampleWidth=Math.ceil(width/2),sampleHeight=Math.ceil(height/2);
  const labels=new Int32Array(sampleWidth*sampleHeight).fill(-1);
  const luminances=new Float32Array(labels.length);
  for(let sy=0;sy<sampleHeight;sy++)for(let sx=0;sx<sampleWidth;sx++) {
    const k=(sy*2*width+sx*2)*channelCount;
    luminances[sy*sampleWidth+sx]=.2126*THREE.DataUtils.fromHalfFloat(data[k])+.7152*THREE.DataUtils.fromHalfFloat(data[k+1])+.0722*THREE.DataUtils.fromHalfFloat(data[k+2]);
  }
  // Distinct bright patches are distinct emitters. Combining windows on opposite
  // walls would invent an overhead light, so select the largest radiant source.
  let selected=-1,bestFlux=0,label=0;
  for(let sy=Math.ceil(sampleHeight/2);sy<sampleHeight;sy++)for(let sx=0;sx<sampleWidth;sx++) {
    const start=sy*sampleWidth+sx;
    if(labels[start]!==-1||luminances[start]<threshold)continue;
    const queue=[start];labels[start]=label;let flux=0;
    for(let q=0;q<queue.length;q++) {
      const id=queue[q],x=id%sampleWidth,y=Math.floor(id/sampleWidth);
      flux+=luminances[id]*Math.cos(((y*2+.5)/height-.5)*Math.PI);
      for(const [nx,ny] of [[(x+1)%sampleWidth,y],[(x+sampleWidth-1)%sampleWidth,y],[x,y+1],[x,y-1]]) {
        if(ny<sampleHeight/2||ny>=sampleHeight)continue;
        const next=ny*sampleWidth+nx;
        if(labels[next]===-1&&luminances[next]>=threshold){labels[next]=label;queue.push(next);}
      }
    }
    if(flux>bestFlux){bestFlux=flux;selected=label;}
    label++;
  }
  const emitterAxis=new THREE.Vector3();
  for(let sy=0;sy<sampleHeight;sy++)for(let sx=0;sx<sampleWidth;sx++) {
    const id=sy*sampleWidth+sx;if(labels[id]!==selected)continue;
    const phi=((sy*2+.5)/height-.5)*Math.PI,theta=((sx*2+.5)/width-.5)*Math.PI*2;
    emitterAxis.addScaledVector(new THREE.Vector3(Math.cos(phi)*Math.cos(theta),Math.sin(phi),Math.cos(phi)*Math.sin(theta)),luminances[id]*Math.cos(phi));
  }
  emitterAxis.normalize();
  const direction=new THREE.Vector3(),rgb=new THREE.Vector3();
  let weightSum=0,windowIrradiance=0,ambient=0;
  for(let y=0;y<height;y+=2) for(let x=0;x<width;x+=2) {
    const k=(y*width+x)*channelCount;
    const r=THREE.DataUtils.fromHalfFloat(data[k]),g=THREE.DataUtils.fromHalfFloat(data[k+1]),b=THREE.DataUtils.fromHalfFloat(data[k+2]);
    const l=.2126*r+.7152*g+.0722*b;
    const v=(y+.5)/height,phi=(v-.5)*Math.PI,theta=((x+.5)/width-.5)*2*Math.PI;
    const solidAngle=Math.cos(phi)*8*Math.PI*Math.PI/(width*height);
    ambient+=l*Math.max(0,Math.sin(phi))*solidAngle;
    const ray=new THREE.Vector3(Math.cos(phi)*Math.cos(theta),Math.sin(phi),Math.cos(phi)*Math.sin(theta));
    // Mullions split one window into disconnected bright panes. Reunite nearby
    // panes around the dominant emitter, without merging opposite room windows.
    if(labels[(y/2)*sampleWidth+x/2]<0 || ray.dot(emitterAxis)<Math.cos(.65) || phi<.03)continue;
    const projectedSolidAngle=solidAngle*Math.sin(phi);
    const weight=l*projectedSolidAngle;
    direction.addScaledVector(ray,weight);
    rgb.addScaledVector(new THREE.Vector3(r,g,b),projectedSolidAngle);
    weightSum+=weight;windowIrradiance+=weight;
  }
  if(weightSum===0) throw new Error('Could not locate the bright window in the provided HDR environment');
  direction.normalize();rgb.divideScalar(weightSum);
  const lightColor=new THREE.Color().setRGB(rgb.x,rgb.y,rgb.z,THREE.LinearSRGBColorSpace);
  // Environment already supplies illumination: reconstruct only the window's
  // occlusion and transmitted flux on the receiver, avoiding a duplicate proxy light.
  return {
    incoming:direction.clone().negate(), color:lightColor,
    windowFraction:Math.min(.88,windowIrradiance/Math.max(ambient,.001)),
    irradiance:windowIrradiance*.9,
  };
}
