import * as THREE from 'three/webgpu';
import {
  Fn, attribute, cross, exp, float, positionWorld, screenUV, select, storage,
  texture, uniform, vec2, vec3, vec4,
} from 'three/tsl';
import { clamp } from '../../physics/constants.js';

const CAUSTIC_SIZE=160;
const LIGHT_MAP_SIZE=128;
const CAUSTIC_GRID=80;
const SHADOW_SIZE=256;
const IOR=1.35;
const LIGHT_CAMERA_DISTANCE=.34;
const LIGHT_CAMERA_NEAR=.01;
const LIGHT_CAMERA_FAR=.72;

class SurfaceBVH {
  constructor(surface) {
    this.surface=surface;this.p=surface.positions;this.index=surface.indices;
    this.centroids=new Float32Array(this.index.length);
    for(let t=0;t<this.index.length/3;t++)for(let axis=0;axis<3;axis++) {
      this.centroids[t*3+axis]=(this.p[this.index[t*3]*3+axis]+this.p[this.index[t*3+1]*3+axis]+this.p[this.index[t*3+2]*3+axis])/3;
    }
    const build=ids=>{
      const node={min:[0,0,0],max:[0,0,0],left:null,right:null,ids:null};
      if(ids.length<=8)node.ids=ids;
      else {
        const ranges=[0,1,2].map(axis=>{
          let lo=Infinity,hi=-Infinity;
          for(const id of ids){const x=this.centroids[id*3+axis];lo=Math.min(lo,x);hi=Math.max(hi,x);}
          return hi-lo;
        });
        const axis=ranges.indexOf(Math.max(...ranges));
        ids.sort((a,b)=>this.centroids[a*3+axis]-this.centroids[b*3+axis]);
        const mid=ids.length>>1;node.left=build(ids.slice(0,mid));node.right=build(ids.slice(mid));
      }
      return node;
    };
    this.root=build(Array.from({length:this.index.length/3},(_,i)=>i));this.refit();
  }
  refit() {
    const p=this.p,ix=this.index;
    const visit=node=>{
      if(node.ids) {
        node.min.fill(Infinity);node.max.fill(-Infinity);
        for(const t of node.ids)for(let c=0;c<3;c++)for(let a=0;a<3;a++) {
          const v=p[ix[t*3+c]*3+a];node.min[a]=Math.min(node.min[a],v);node.max[a]=Math.max(node.max[a],v);
        }
      } else {
        visit(node.left);visit(node.right);
        for(let a=0;a<3;a++){node.min[a]=Math.min(node.left.min[a],node.right.min[a]);node.max[a]=Math.max(node.left.max[a],node.right.max[a]);}
      }
    };
    visit(this.root);
  }
  /** @returns {{t:number,u:number,v:number,distance:number}|null} */
  hit(o,d,maxDistance=Infinity) {
    const p=this.p,ix=this.index;let nearest=maxDistance,result=null;
    const box=node=>{
      let lo=0,hi=nearest;
      for(let a=0;a<3;a++) {
        if(Math.abs(d[a])<1e-12){if(o[a]<node.min[a]||o[a]>node.max[a])return false;}
        else {
          let t0=(node.min[a]-o[a])/d[a],t1=(node.max[a]-o[a])/d[a];
          if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);
          if(hi<lo)return false;
        }
      }
      return true;
    };
    const visit=node=>{
      if(!box(node))return;
      if(!node.ids){visit(node.left);visit(node.right);return;}
      for(const t of node.ids) {
        const a=ix[t*3]*3,b=ix[t*3+1]*3,c=ix[t*3+2]*3;
        const e1x=p[b]-p[a],e1y=p[b+1]-p[a+1],e1z=p[b+2]-p[a+2];
        const e2x=p[c]-p[a],e2y=p[c+1]-p[a+1],e2z=p[c+2]-p[a+2];
        const hx=d[1]*e2z-d[2]*e2y,hy=d[2]*e2x-d[0]*e2z,hz=d[0]*e2y-d[1]*e2x;
        const det=e1x*hx+e1y*hy+e1z*hz;if(Math.abs(det)<1e-14)continue;
        const inv=1/det,sx=o[0]-p[a],sy=o[1]-p[a+1],sz=o[2]-p[a+2];
        const u=(sx*hx+sy*hy+sz*hz)*inv;if(u<0||u>1)continue;
        const qx=sy*e1z-sz*e1y,qy=sz*e1x-sx*e1z,qz=sx*e1y-sy*e1x;
        const v=(d[0]*qx+d[1]*qy+d[2]*qz)*inv;if(v<0||u+v>1)continue;
        const distance=(e2x*qx+e2y*qy+e2z*qz)*inv;
        if(distance>1e-7&&distance<nearest){nearest=distance;result={t,u,v,distance};}
      }
    };
    visit(this.root);return result;
  }
  normal(hit,d,entering) {
    const ix=this.index,p=this.p,n=this.surface.geometry.attributes.normal.array;
    const a=ix[hit.t*3]*3,b=ix[hit.t*3+1]*3,c=ix[hit.t*3+2]*3,w=1-hit.u-hit.v;
    let x=n[a]*w+n[b]*hit.u+n[c]*hit.v,y=n[a+1]*w+n[b+1]*hit.u+n[c+1]*hit.v,z=n[a+2]*w+n[b+2]*hit.u+n[c+2]*hit.v;
    const ex=p[b]-p[a],ey=p[b+1]-p[a+1],ez=p[b+2]-p[a+2];
    const fx=p[c]-p[a],fy=p[c+1]-p[a+1],fz=p[c+2]-p[a+2];
    const gx=ey*fz-ez*fy,gy=ez*fx-ex*fz,gz=ex*fy-ey*fx;
    const sign=entering?1:-1;
    if((x*d[0]+y*d[1]+z*d[2])*sign>-.015){x=gx;y=gy;z=gz;}
    const len=Math.hypot(x,y,z)||1;
    x=x/len*sign;y=y/len*sign;z=z/len*sign;
    if(x*d[0]+y*d[1]+z*d[2]>0){x=-x;y=-y;z=-z;}
    return [x,y,z];
  }
}

function refractRay(d,n,n1,n2) {
  const cosine=clamp(-(d[0]*n[0]+d[1]*n[1]+d[2]*n[2]),0,1),eta=n1/n2;
  const k=1-eta*eta*(1-cosine*cosine);
  if(k<0)return null;
  const ct=Math.sqrt(k),a=eta*cosine-ct;
  const rs=(n1*cosine-n2*ct)/(n1*cosine+n2*ct+1e-20);
  const rp=(n2*cosine-n1*ct)/(n2*cosine+n1*ct+1e-20);
  return {direction:[eta*d[0]+a*n[0],eta*d[1]+a*n[1],eta*d[2]+a*n[2]],transmission:1-(rs*rs+rp*rp)/2};
}

/** Keep the existing view-thickness algorithm independent from caustic generation. */
function updateViewThickness(surface,bvh,camera) {
  const p=surface.positions,n=surface.geometry.attributes.normal.array;
  const thickness=surface.geometry.attributes.opticalThickness;
  for(let i=0;i<p.length;i+=3) {
    let dx=p[i]-camera.position.x,dy=p[i+1]-camera.position.y,dz=p[i+2]-camera.position.z;
    const length=Math.hypot(dx,dy,dz)||1;dx/=length;dy/=length;dz/=length;
    const normal=[n[i],n[i+1],n[i+2]];
    if(dx*normal[0]+dy*normal[1]+dz*normal[2]>-.01)continue;
    const refraction=refractRay([dx,dy,dz],normal,1,IOR);if(!refraction)continue;
    const dir=refraction.direction,o=[p[i]+dir[0]*2e-6,p[i+1]+dir[1]*2e-6,p[i+2]+dir[2]*2e-6];
    const hit=bvh.hit(o,dir);
    thickness.array[i/3]=hit?clamp(hit.distance,.0002,.16):.002;
  }
  thickness.needsUpdate=true;
}

/** Existing projected shadow/contact field, retained so the caustic rewrite cannot alter it. */
class OpticalShadowField {
  constructor(surface,lightDirection) {
    this.size=SHADOW_SIZE;this.span=.22;this.origin=new THREE.Vector2();
    this.surface=surface;this.lightDirection=lightDirection;
    this.shadow=new Float32Array(this.size*this.size);
    this.contact=new Float32Array(this.size*this.size);
    this.blurScratch=new Float32Array(this.size*this.size);
    this.shadowBytes=new Uint8Array(this.size*this.size*4);
  }
  rasterTriangle(a,b,c,buffer,value) {
    const n=this.size,scale=n/this.span;
    const ax=(a[0]-this.origin.x)*scale,ay=(a[1]-this.origin.y)*scale;
    const bx=(b[0]-this.origin.x)*scale,by=(b[1]-this.origin.y)*scale;
    const cx=(c[0]-this.origin.x)*scale,cy=(c[1]-this.origin.y)*scale;
    const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);if(Math.abs(area)<1e-9)return;
    const minX=clamp(Math.floor(Math.min(ax,bx,cx)),0,n-1),maxX=clamp(Math.ceil(Math.max(ax,bx,cx)),0,n-1);
    const minY=clamp(Math.floor(Math.min(ay,by,cy)),0,n-1),maxY=clamp(Math.ceil(Math.max(ay,by,cy)),0,n-1);
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++) {
      const px=x+.5,py=y+.5;
      const u=((bx-px)*(cy-py)-(by-py)*(cx-px))/area;
      const v=((cx-px)*(ay-py)-(cy-py)*(ax-px))/area;
      if(u>=0&&v>=0&&u+v<=1)buffer[y*n+x]=Math.max(buffer[y*n+x],value);
    }
  }
  blur(buffer) {
    const n=this.size,tmp=this.blurScratch;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++) {
      let sum=0;for(let k=-2;k<=2;k++)sum+=buffer[y*n+clamp(x+k,0,n-1)]*(3-Math.abs(k));tmp[y*n+x]=sum/9;
    }
    for(let y=0;y<n;y++)for(let x=0;x<n;x++) {
      let sum=0;for(let k=-2;k<=2;k++)sum+=tmp[clamp(y+k,0,n-1)*n+x]*(3-Math.abs(k));buffer[y*n+x]=sum/9;
    }
  }
  update(body) {
    this.shadow.fill(0);this.contact.fill(0);
    const D=[this.lightDirection.x,this.lightDirection.y,this.lightDirection.z];
    const p=this.surface.positions,ix=this.surface.indices,box=this.surface.geometry.boundingBox;
    const cx=body.center.x,cz=body.center.z;
    this.span=Math.max(.22,(box.max.x-box.min.x)*2+.04,(box.max.z-box.min.z)*2+.04,
      box.max.y*Math.max(Math.abs(D[0]/D[1]),Math.abs(D[2]/D[1]))*2+.12);
    const projectedX=cx-body.center.y*D[0]/D[1],projectedZ=cz-body.center.y*D[2]/D[1];
    this.origin.set((cx+projectedX)/2-this.span/2,(cz+projectedZ)/2-this.span/2);
    for(let t=0;t<ix.length;t+=3) {
      const vertices=[ix[t]*3,ix[t+1]*3,ix[t+2]*3];
      const projected=vertices.map(i=>[p[i]-p[i+1]*D[0]/D[1],p[i+2]-p[i+1]*D[2]/D[1]]);
      this.rasterTriangle(...projected,this.shadow,1);
      const height=(p[vertices[0]+1]+p[vertices[1]+1]+p[vertices[2]+1])/3;
      if(height<.016)this.rasterTriangle(...vertices.map(i=>[p[i],p[i+2]]),this.contact,Math.exp(-height/.0028));
    }
    this.blur(this.shadow);this.blur(this.contact);
    for(let i=0;i<this.size*this.size;i++) {
      this.shadowBytes[i*4]=Math.round(this.shadow[i]*255);
      this.shadowBytes[i*4+1]=Math.round(this.contact[i]*255);
      this.shadowBytes[i*4+2]=0;this.shadowBytes[i*4+3]=255;
    }
  }
}

function makeTarget(size,depthBuffer) {
  const target=new THREE.RenderTarget(size,size,{
    type:THREE.HalfFloatType,format:THREE.RGBAFormat,depthBuffer,stencilBuffer:false,
  });
  target.texture.minFilter=THREE.LinearFilter;target.texture.magFilter=THREE.LinearFilter;
  target.texture.generateMipmaps=false;target.texture.colorSpace=THREE.NoColorSpace;
  return target;
}

/**
 * Shape-driven GPU caustics. The optical surface is deformed from the exact cage
 * every render frame, then front/back light-space depth is refracted into a
 * conservative photon mesh. Fragment-space inverse Jacobians provide focusing.
 */
class RefractiveLightField {
  constructor(surface,lightDirection,sigma) {
    this.surface=surface;this.lightDirection=lightDirection.clone().normalize();
    this.absorptionNode=uniform(new THREE.Vector3(-sigma[0],-sigma[1],-sigma[2]));
    this.absorptionDirty=false;
    this.span=.22;this.origin=new THREE.Vector2();
    this.originNode=uniform(this.origin);this.spanNode=uniform(this.span);

    // Shadow/contact remains byte-for-byte compatible with the old table shader,
    // but has independent coordinates now that caustics no longer come from worker snapshots.
    this.shadowSpan=.22;this.shadowSpanNode=uniform(this.shadowSpan);
    this.shadowOrigin=new THREE.Vector2();this.shadowOriginNode=uniform(this.shadowOrigin);
    this.contactOrigin=new THREE.Vector2();this.contactOriginNode=uniform(this.contactOrigin);
    this.shadowBytes=new Uint8Array(SHADOW_SIZE*SHADOW_SIZE*4);
    this.shadowTexture=new THREE.DataTexture(this.shadowBytes,SHADOW_SIZE,SHADOW_SIZE,THREE.RGBAFormat,THREE.UnsignedByteType);
    this.shadowTexture.minFilter=this.shadowTexture.magFilter=THREE.LinearFilter;
    this.shadowTexture.generateMipmaps=false;this.shadowTexture.colorSpace=THREE.NoColorSpace;this.shadowTexture.needsUpdate=true;

    this.frontTarget=makeTarget(LIGHT_MAP_SIZE,true);
    this.backTarget=makeTarget(LIGHT_MAP_SIZE,true);
    this.rawCausticTarget=makeTarget(CAUSTIC_SIZE,false);
    this.causticTarget=makeTarget(CAUSTIC_SIZE,false);
    this.lightTexture=this.causticTarget.texture;

    this.lightCamera=new THREE.OrthographicCamera(-.11,.11,.11,-.11,LIGHT_CAMERA_NEAR,LIGHT_CAMERA_FAR);
    this.lightCamera.up.set(0,0,1);
    this.lightCameraPosition=new THREE.Vector3();
    this.lightRight=new THREE.Vector3(1,0,0);this.lightUp=new THREE.Vector3(0,0,1);
    this.lightExtent=.22;
    this.lightCameraPositionNode=uniform(this.lightCameraPosition);
    this.lightRightNode=uniform(this.lightRight);this.lightUpNode=uniform(this.lightUp);
    this.lightDirectionNode=uniform(this.lightDirection);
    this.lightExtentNode=uniform(this.lightExtent);
    this.receiverOriginNode=uniform(this.origin);this.receiverSpanNode=uniform(this.span);

    const maxId=surface.bindingIds.reduce((m,id)=>Math.max(m,id),0),nodeCount=maxId+1;
    this.cagePacked=new Float32Array(nodeCount*4);
    this.cageAttribute=new THREE.StorageBufferAttribute(this.cagePacked,4);
    this.cageNode=storage(this.cageAttribute,'vec4',nodeCount).toReadOnly();

    const geometry=surface.geometry;
    if(!geometry.getAttribute('cageIds'))geometry.setAttribute('cageIds',new THREE.BufferAttribute(surface.bindingIds,4));
    if(!geometry.getAttribute('cageWeights'))geometry.setAttribute('cageWeights',new THREE.BufferAttribute(Float32Array.from(surface.bindingWeights),4));
    const ids=attribute('cageIds'),weights=attribute('cageWeights');
    const deformed=Fn(()=>this.cageNode.element(ids.x).xyz.mul(weights.x)
      .add(this.cageNode.element(ids.y).xyz.mul(weights.y))
      .add(this.cageNode.element(ids.z).xyz.mul(weights.z))
      .add(this.cageNode.element(ids.w).xyz.mul(weights.w)))();

    const depth=this.lightDirectionNode.dot(positionWorld.sub(this.lightCameraPositionNode));
    const frontMaterial=new THREE.MeshBasicNodeMaterial({side:THREE.FrontSide});
    frontMaterial.positionNode=deformed;frontMaterial.colorNode=vec4(depth,depth,depth,1);frontMaterial.toneMapped=false;
    const backMaterial=new THREE.MeshBasicNodeMaterial({side:THREE.BackSide});
    backMaterial.positionNode=deformed;backMaterial.colorNode=vec4(depth,depth,depth,1);backMaterial.toneMapped=false;
    this.frontScene=new THREE.Scene();this.frontScene.background=new THREE.Color(0x000000);
    this.backScene=new THREE.Scene();this.backScene.background=new THREE.Color(0x000000);
    const frontMesh=new THREE.Mesh(geometry,frontMaterial),backMesh=new THREE.Mesh(geometry,backMaterial);
    frontMesh.frustumCulled=false;backMesh.frustumCulled=false;this.frontScene.add(frontMesh);this.backScene.add(backMesh);

    const reconstruct=(uvNode,depthNode)=>this.lightCameraPositionNode
      .add(this.lightRightNode.mul(uvNode.x.sub(.5).mul(this.lightExtentNode)))
      .add(this.lightUpNode.mul(uvNode.y.sub(.5).mul(this.lightExtentNode)))
      .add(this.lightDirectionNode.mul(depthNode));
    const texel=float(1/LIGHT_MAP_SIZE);
    const normalFromDepth=(depthTexture,uvNode,centerDepth,rayDirection)=>{
      const leftUV=vec2(uvNode.x.sub(texel),uvNode.y),rightUV=vec2(uvNode.x.add(texel),uvNode.y);
      const downUV=vec2(uvNode.x,uvNode.y.sub(texel)),upUV=vec2(uvNode.x,uvNode.y.add(texel));
      const dlRaw=texture(depthTexture,leftUV).r,drRaw=texture(depthTexture,rightUV).r;
      const ddRaw=texture(depthTexture,downUV).r,duRaw=texture(depthTexture,upUV).r;
      const dl=select(dlRaw.greaterThan(1e-5),dlRaw,centerDepth),dr=select(drRaw.greaterThan(1e-5),drRaw,centerDepth);
      const dd=select(ddRaw.greaterThan(1e-5),ddRaw,centerDepth),du=select(duRaw.greaterThan(1e-5),duRaw,centerDepth);
      const raw=cross(reconstruct(rightUV,dr).sub(reconstruct(leftUV,dl)),reconstruct(upUV,du).sub(reconstruct(downUV,dd)));
      const lengthSq=raw.dot(raw);
      let n=select(lengthSq.greaterThan(1e-12),raw.div(lengthSq.max(1e-12).sqrt()),rayDirection.negate());
      n=select(n.dot(rayDirection).greaterThan(0),n.negate(),n);
      return n;
    };
    const refractNode=(direction,normal,n1,n2)=>{
      const eta=float(n1/n2),cosine=direction.dot(normal).negate().clamp(0,1);
      const k=float(1).sub(eta.mul(eta).mul(float(1).sub(cosine.mul(cosine))));
      const dir=direction.mul(eta).add(normal.mul(eta.mul(cosine).sub(k.max(0).sqrt())));
      return {direction:dir,valid:k.greaterThan(0),cosine};
    };

    const grid=new THREE.PlaneGeometry(2,2,CAUSTIC_GRID,CAUSTIC_GRID);
    const sourceUV=attribute('uv');
    const frontDepth=texture(this.frontTarget.texture,sourceUV).r;
    const backDepth=texture(this.backTarget.texture,sourceUV).r;
    const entryPoint=reconstruct(sourceUV,frontDepth);
    const entryNormal=normalFromDepth(this.frontTarget.texture,sourceUV,frontDepth,this.lightDirectionNode);
    const entry=refractNode(this.lightDirectionNode,entryNormal,1,IOR);
    const insideCos=entry.direction.dot(this.lightDirectionNode).max(.12);
    const projectUV=point=>{
      const offset=point.sub(this.lightCameraPositionNode);
      return vec2(offset.dot(this.lightRightNode),offset.dot(this.lightUpNode)).div(this.lightExtentNode).add(.5);
    };
    // Two fixed-point refinements solve the internal ray against the back depth field.
    // This keeps the exit on the refracted ray instead of snapping it sideways to the
    // sampled light-space surface, while remaining a handful of texture reads per vertex.
    let insideDistance=backDepth.sub(frontDepth).max(0).div(insideCos);
    let exitPoint=entryPoint.add(entry.direction.mul(insideDistance));
    let exitUV=projectUV(exitPoint);
    let exitDepth=texture(this.backTarget.texture,exitUV).r;
    insideDistance=exitDepth.sub(frontDepth).max(0).div(insideCos);
    exitPoint=entryPoint.add(entry.direction.mul(insideDistance));
    exitUV=projectUV(exitPoint);
    exitDepth=texture(this.backTarget.texture,exitUV).r;
    insideDistance=exitDepth.sub(frontDepth).max(0).div(insideCos);
    exitPoint=entryPoint.add(entry.direction.mul(insideDistance));
    exitUV=projectUV(exitPoint);
    exitDepth=texture(this.backTarget.texture,exitUV).r;
    const exitNormal=normalFromDepth(this.backTarget.texture,exitUV,exitDepth,entry.direction);
    const exit=refractNode(entry.direction,exitNormal,IOR,1);
    const floorDistance=exitPoint.y.negate().div(exit.direction.y.min(-1e-5));
    const landing=exitPoint.add(exit.direction.mul(floorDistance));
    const landingUV=landing.xz.sub(this.receiverOriginNode).div(this.receiverSpanNode);
    const valid=frontDepth.greaterThan(1e-5)
      .and(entry.valid)
      .and(backDepth.greaterThan(frontDepth.add(2e-5)))
      .and(exitUV.x.greaterThan(0)).and(exitUV.x.lessThan(1)).and(exitUV.y.greaterThan(0)).and(exitUV.y.lessThan(1))
      .and(exitDepth.greaterThan(frontDepth)).and(exit.valid).and(exit.direction.y.lessThan(-1e-5))
      .and(floorDistance.greaterThan(0));
    const fallback=vec3(sourceUV.x.mul(2).sub(1),sourceUV.y.mul(2).sub(1),0);
    const projected=vec3(landingUV.x.mul(2).sub(1),landingUV.y.mul(2).sub(1),0);

    const causticMaterial=new THREE.MeshBasicNodeMaterial({side:THREE.DoubleSide,transparent:true});
    causticMaterial.positionNode=select(valid,projected,fallback);
    const dx=sourceUV.dFdx(),dy=sourceUV.dFdy();
    const horizontalFluxCorrection=this.lightDirectionNode.y.abs().max(.15).reciprocal();
    const inverseJacobian=dx.x.mul(dy.y).sub(dx.y.mul(dy.x)).abs()
      .mul(CAUSTIC_SIZE*CAUSTIC_SIZE).mul(horizontalFluxCorrection)
      .mul(this.lightExtentNode.mul(this.lightExtentNode).div(this.receiverSpanNode.mul(this.receiverSpanNode)));
    // Finite source size is represented by the following blur, so cap only pathological fold singularities.
    const focus=inverseJacobian.min(18);
    const entryCos=entryNormal.dot(this.lightDirectionNode).negate().clamp(0,1);
    const exitCos=exitNormal.dot(entry.direction).negate().clamp(0,1);
    const r0=((1-IOR)/(1+IOR))**2;
    const schlick=cosine=>float(1).sub(float(r0).add(float(1-r0).mul(float(1).sub(cosine).pow(5))));
    const transmission=schlick(entryCos).mul(schlick(exitCos));
    const absorption=exp(this.absorptionNode.mul(insideDistance));
    // Keep the expensive optical path in the vertex stage. The fragment stage only
    // evaluates the area/Jacobian focus and interpolates this transmitted energy.
    const transmittedEnergy=absorption.mul(transmission).mul(select(valid,1,0)).toVarying();
    causticMaterial.colorNode=vec4(transmittedEnergy.mul(focus),1);causticMaterial.depthTest=false;causticMaterial.depthWrite=false;
    causticMaterial.blending=THREE.AdditiveBlending;causticMaterial.toneMapped=false;
    this.causticScene=new THREE.Scene();this.causticScene.background=new THREE.Color(0x000000);
    const causticMesh=new THREE.Mesh(grid,causticMaterial);causticMesh.frustumCulled=false;this.causticScene.add(causticMesh);
    this.causticCamera=new THREE.OrthographicCamera(-1,1,1,-1,.1,2);this.causticCamera.position.z=1;

    const blurMaterial=new THREE.MeshBasicNodeMaterial();
    const uv=screenUV,du=float(1/CAUSTIC_SIZE),raw=this.rawCausticTarget.texture;
    const blur=texture(raw,uv).rgb.mul(.28)
      .add(texture(raw,uv.add(vec2(du,0))).rgb.mul(.12)).add(texture(raw,uv.sub(vec2(du,0))).rgb.mul(.12))
      .add(texture(raw,uv.add(vec2(0,du))).rgb.mul(.12)).add(texture(raw,uv.sub(vec2(0,du))).rgb.mul(.12))
      .add(texture(raw,uv.add(vec2(du,du))).rgb.mul(.06)).add(texture(raw,uv.add(vec2(du.negate(),du))).rgb.mul(.06))
      .add(texture(raw,uv.add(vec2(du,du.negate()))).rgb.mul(.06)).add(texture(raw,uv.sub(vec2(du,du))).rgb.mul(.06));
    blurMaterial.colorNode=vec4(blur,1);blurMaterial.toneMapped=false;
    this.blurQuad=new THREE.QuadMesh(blurMaterial);

    this.resources={frontMaterial,backMaterial,grid,causticMaterial,blurMaterial};
    this.lastRevision=-1;this.lastCenter=new THREE.Vector3(Infinity,Infinity,Infinity);
  }
  setAbsorption(sigma) {
    this.absorptionNode.value.set(-sigma[0],-sigma[1],-sigma[2]);this.absorptionDirty=true;
  }
  setLightDirection(direction) {
    this.lightDirection.copy(direction).normalize();this.lastRevision=-1;
  }

  update(renderer,body,force=false) {
    if(!force&&!this.absorptionDirty&&this.lastRevision===body.surfaceRevision&&this.lastCenter.distanceToSquared(body.center)<1e-14)return;
    this.lastRevision=body.surfaceRevision;this.lastCenter.copy(body.center);
    const x=body.x;
    for(let i=0,j=0;i<x.length;i+=3,j+=4){this.cagePacked[j]=x[i];this.cagePacked[j+1]=x[i+1];this.cagePacked[j+2]=x[i+2];this.cagePacked[j+3]=0;}
    this.cageAttribute.needsUpdate=true;

    const D=this.lightDirection,box=body.surface.geometry.boundingBox,c=body.center;
    this.span=Math.max(.22,(box.max.x-box.min.x)*2+.04,(box.max.z-box.min.z)*2+.04,
      box.max.y*Math.max(Math.abs(D.x/D.y),Math.abs(D.z/D.y))*2+.12);
    this.spanNode.value=this.span;this.receiverSpanNode.value=this.span;
    const projectedX=c.x-c.y*D.x/D.y,projectedZ=c.z-c.y*D.z/D.y;
    this.origin.set((c.x+projectedX)/2-this.span/2,(c.z+projectedZ)/2-this.span/2);
    this.originNode.value.copy(this.origin);this.receiverOriginNode.value.copy(this.origin);

    this.lightExtent=this.span;this.lightExtentNode.value=this.lightExtent;
    this.lightCamera.left=-this.lightExtent/2;this.lightCamera.right=this.lightExtent/2;
    this.lightCamera.top=this.lightExtent/2;this.lightCamera.bottom=-this.lightExtent/2;this.lightCamera.updateProjectionMatrix();
    this.lightCamera.position.copy(c).addScaledVector(D,-LIGHT_CAMERA_DISTANCE);
    if(Math.abs(D.z)>.96)this.lightCamera.up.set(0,1,0);else this.lightCamera.up.set(0,0,1);
    this.lightCamera.lookAt(c);this.lightCamera.updateMatrixWorld(true);
    this.lightCameraPosition.copy(this.lightCamera.position);this.lightCameraPositionNode.value.copy(this.lightCameraPosition);
    const e=this.lightCamera.matrixWorld.elements;
    this.lightRight.set(e[0],e[1],e[2]);this.lightUp.set(e[4],e[5],e[6]);
    this.lightRightNode.value.copy(this.lightRight);this.lightUpNode.value.copy(this.lightUp);

    renderer.setRenderTarget(this.frontTarget);renderer.render(this.frontScene,this.lightCamera);
    renderer.setRenderTarget(this.backTarget);renderer.render(this.backScene,this.lightCamera);
    renderer.setRenderTarget(this.rawCausticTarget);renderer.render(this.causticScene,this.causticCamera);
    renderer.setRenderTarget(this.causticTarget);this.blurQuad.render(renderer);
    renderer.setRenderTarget(null);
    this.absorptionDirty=false;
  }
  dispose() {
    this.frontTarget.dispose();this.backTarget.dispose();this.rawCausticTarget.dispose();this.causticTarget.dispose();
    this.shadowTexture.dispose();
    this.resources.frontMaterial.dispose();this.resources.backMaterial.dispose();this.resources.grid.dispose();
    this.resources.causticMaterial.dispose();this.resources.blurMaterial.dispose();
  }
}

export { OpticalShadowField, RefractiveLightField, SurfaceBVH, updateViewThickness };
