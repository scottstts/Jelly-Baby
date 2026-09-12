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
  const channelCount=data.length/(width*height),sampleWidth=Math.ceil(width/2),sampleHeight=Math.ceil(height/2);
  const upperLuminance=new Float64Array(sampleWidth*Math.ceil(sampleHeight/2));
  let peak=0,upperCount=0;
  for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2) {
    const k=(y*width+x)*channelCount;
    const l=.2126*THREE.DataUtils.fromHalfFloat(data[k])+.7152*THREE.DataUtils.fromHalfFloat(data[k+1])+.0722*THREE.DataUtils.fromHalfFloat(data[k+2]);
    // Night's brightest patch is below the horizon; it must not suppress
    // detection of the weaker overhead emitter that casts tabletop shadows.
    if(!upperPeakOnly||y>=height/2)peak=Math.max(peak,l);
    if(y>=height/2)upperLuminance[upperCount++]=l;
  }
  const upper=upperLuminance.subarray(0,upperCount);upper.sort();
  // Separate the luminous window from the room, rather than sampling only its
  // brightest few sky pixels. This retains its full incident flux and broad color.
  const threshold=Math.max(upper[upper.length>>1]*3,peak*.025);
  const labels=new Int32Array(sampleWidth*sampleHeight).fill(-1);
  const luminances=new Float32Array(labels.length);
  for(let sy=0;sy<sampleHeight;sy++)for(let sx=0;sx<sampleWidth;sx++) {
    const k=(sy*2*width+sx*2)*channelCount;
    luminances[sy*sampleWidth+sx]=.2126*THREE.DataUtils.fromHalfFloat(data[k])+.7152*THREE.DataUtils.fromHalfFloat(data[k+1])+.0722*THREE.DataUtils.fromHalfFloat(data[k+2]);
  }
  // Distinct bright patches are distinct emitters. Combining windows on opposite
  // walls would invent an overhead light, so select the largest radiant source.
  const queue=new Int32Array(labels.length);
  let selected=-1,bestFlux=0,label=0;
  const upperStart=Math.ceil(sampleHeight/2);
  for(let sy=upperStart;sy<sampleHeight;sy++)for(let sx=0;sx<sampleWidth;sx++) {
    const start=sy*sampleWidth+sx;
    if(labels[start]!==-1||luminances[start]<threshold)continue;
    let head=0,tail=1,flux=0;queue[0]=start;labels[start]=label;
    while(head<tail) {
      const id=queue[head++],x=id%sampleWidth,y=Math.floor(id/sampleWidth);
      flux+=luminances[id]*Math.cos(((y*2+.5)/height-.5)*Math.PI);
      const right=y*sampleWidth+(x+1)%sampleWidth;
      if(labels[right]===-1&&luminances[right]>=threshold){labels[right]=label;queue[tail++]=right;}
      const left=y*sampleWidth+(x+sampleWidth-1)%sampleWidth;
      if(labels[left]===-1&&luminances[left]>=threshold){labels[left]=label;queue[tail++]=left;}
      if(y+1<sampleHeight) {
        const down=id+sampleWidth;
        if(labels[down]===-1&&luminances[down]>=threshold){labels[down]=label;queue[tail++]=down;}
      }
      if(y-1>=upperStart) {
        const up=id-sampleWidth;
        if(labels[up]===-1&&luminances[up]>=threshold){labels[up]=label;queue[tail++]=up;}
      }
    }
    if(flux>bestFlux){bestFlux=flux;selected=label;}
    label++;
  }
  let emitterX=0,emitterY=0,emitterZ=0;
  for(let sy=0;sy<sampleHeight;sy++)for(let sx=0;sx<sampleWidth;sx++) {
    const id=sy*sampleWidth+sx;if(labels[id]!==selected)continue;
    const phi=((sy*2+.5)/height-.5)*Math.PI,theta=((sx*2+.5)/width-.5)*Math.PI*2;
    const cosPhi=Math.cos(phi),weight=luminances[id]*cosPhi;
    emitterX+=cosPhi*Math.cos(theta)*weight;emitterY+=Math.sin(phi)*weight;emitterZ+=cosPhi*Math.sin(theta)*weight;
  }
  const emitterLength=Math.sqrt(emitterX*emitterX+emitterY*emitterY+emitterZ*emitterZ)||1;
  emitterX/=emitterLength;emitterY/=emitterLength;emitterZ/=emitterLength;
  let directionX=0,directionY=0,directionZ=0,rgbX=0,rgbY=0,rgbZ=0;
  let weightSum=0,windowIrradiance=0,ambient=0;
  for(let y=0;y<height;y+=2) for(let x=0;x<width;x+=2) {
    const k=(y*width+x)*channelCount;
    const r=THREE.DataUtils.fromHalfFloat(data[k]),g=THREE.DataUtils.fromHalfFloat(data[k+1]),b=THREE.DataUtils.fromHalfFloat(data[k+2]);
    const l=.2126*r+.7152*g+.0722*b;
    const v=(y+.5)/height,phi=(v-.5)*Math.PI,theta=((x+.5)/width-.5)*2*Math.PI;
    const sinPhi=Math.sin(phi),cosPhi=Math.cos(phi),cosTheta=Math.cos(theta),sinTheta=Math.sin(theta);
    const solidAngle=cosPhi*8*Math.PI*Math.PI/(width*height);
    ambient+=l*Math.max(0,sinPhi)*solidAngle;
    const rayX=cosPhi*cosTheta,rayY=sinPhi,rayZ=cosPhi*sinTheta;
    // Mullions split one window into disconnected bright panes. Reunite nearby
    // panes around the dominant emitter, without merging opposite room windows.
    if(labels[(y/2)*sampleWidth+x/2]<0 || rayX*emitterX+rayY*emitterY+rayZ*emitterZ<Math.cos(.65) || phi<.03)continue;
    const projectedSolidAngle=solidAngle*sinPhi;
    const weight=l*projectedSolidAngle;
    directionX+=rayX*weight;directionY+=rayY*weight;directionZ+=rayZ*weight;
    rgbX+=r*projectedSolidAngle;rgbY+=g*projectedSolidAngle;rgbZ+=b*projectedSolidAngle;
    weightSum+=weight;windowIrradiance+=weight;
  }
  if(weightSum===0) throw new Error('Could not locate the bright window in the provided HDR environment');
  const directionLength=Math.sqrt(directionX*directionX+directionY*directionY+directionZ*directionZ)||1;
  const direction=new THREE.Vector3(directionX/directionLength,directionY/directionLength,directionZ/directionLength);
  const lightColor=new THREE.Color().setRGB(rgbX/weightSum,rgbY/weightSum,rgbZ/weightSum,THREE.LinearSRGBColorSpace);
  // Environment already supplies illumination: reconstruct only the window's
  // occlusion and transmitted flux on the receiver, avoiding a duplicate proxy light.
  return {
    incoming:direction.negate(), color:lightColor,
    windowFraction:Math.min(.88,windowIrradiance/Math.max(ambient,.001)),
    irradiance:windowIrradiance*.9,
  };
}
