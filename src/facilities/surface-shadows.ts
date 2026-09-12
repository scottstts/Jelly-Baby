import * as THREE from 'three/webgpu';
import { Fn, float, normalWorldGeometry, positionWorld, texture, uniform, vec2, vec4 } from 'three/tsl';

export const SURFACE_SHADOW_SIZE=2048;
export const SURFACE_SHADOW_BIAS=.0002; // metres, independent of the fitted depth range
const GROUND_SHADOW_SIZE=512;
type ReceiverDepth={source:THREE.Mesh;proxy:THREE.Mesh;scene:THREE.Scene;target:THREE.RenderTarget;dirty:boolean};

/** Local window occlusion between raised surfaces, independent of table masks. */
export class SurfaceShadows {
  private readonly camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,4);
  private readonly matrixNode=uniform(new THREE.Matrix4());
  private readonly directionNode;
  private readonly depthBiasNode=uniform(SURFACE_SHADOW_BIAS);
  private readonly filterXNode=uniform(new THREE.Vector2());
  private readonly filterZNode=uniform(new THREE.Vector2());
  private readonly material=new THREE.MeshBasicNodeMaterial({side:THREE.DoubleSide,toneMapped:false});
  private readonly facilities=new THREE.Scene();
  private readonly baby=new THREE.Scene();
  private readonly facilityTarget=new THREE.RenderTarget(SURFACE_SHADOW_SIZE,SURFACE_SHADOW_SIZE,{type:THREE.FloatType,format:THREE.RedFormat});
  private readonly babyTarget=new THREE.RenderTarget(SURFACE_SHADOW_SIZE,SURFACE_SHADOW_SIZE,{type:THREE.FloatType,format:THREE.RedFormat});
  private readonly bounds=new THREE.Box3();
  private readonly casters:{source:THREE.Mesh;proxy:THREE.Mesh;version:number}[]=[];
  private readonly roots=new Set<THREE.Object3D>();
  private worldSyncRevision=0;
  private readonly receivers=new Set<THREE.NodeMaterial>();
  private readonly receiverDepths:ReceiverDepth[]=[];
  private facilityDirty=true;
  private babyDirty=true;
  private readonly windowFraction=uniform(0);

  private visible(object:THREE.Object3D) {
    for(let current:THREE.Object3D|null=object;current;current=current.parent)if(!current.visible)return false;
    return true;
  }

  constructor(incoming:THREE.Vector3,windowFraction:number) {
    this.windowFraction.value=windowFraction;
    this.directionNode=uniform(incoming.clone().negate());
    this.camera.coordinateSystem=THREE.WebGPUCoordinateSystem;
    this.camera.position.copy(incoming).multiplyScalar(-2);
    this.camera.lookAt(0,0,0);this.camera.updateMatrixWorld(true);
    this.material.colorNode=vec4(this.matrixNode.mul(vec4(positionWorld,1)).z,0,0,1);
    for(const scene of [this.facilities,this.baby])scene.background=new THREE.Color(1,1,1);
    for(const target of [this.facilityTarget,this.babyTarget]) {
      target.texture.colorSpace=THREE.NoColorSpace;
      target.texture.minFilter=target.texture.magFilter=THREE.NearestFilter;
      target.texture.generateMipmaps=false;
    }
  }

  add(group:THREE.Group,envelope:THREE.Box3) {
    this.bounds.union(envelope);
    this.fitCamera();
    this.roots.add(group);
    group.traverse(object=>{if(object instanceof THREE.Mesh)this.register(object,this.facilities,true);});
    this.facilityDirty=this.babyDirty=true;
  }

  /** Fit only the active world's envelopes, preserving texel density on return. */
  setBounds(envelopes:readonly THREE.Box3[]) {
    this.bounds.makeEmpty();for(const envelope of envelopes)this.bounds.union(envelope);
    if(this.bounds.isEmpty())return;
    this.fitCamera();this.facilityDirty=this.babyDirty=true;
  }

  setLighting(incoming:THREE.Vector3,windowFraction:number) {
    this.windowFraction.value=windowFraction;
    this.directionNode.value.copy(incoming).negate();
    this.camera.position.copy(incoming).multiplyScalar(-2);
    this.camera.lookAt(0,0,0);this.camera.updateMatrixWorld(true);
    this.fitCamera();this.facilityDirty=this.babyDirty=true;
  }

  private fitCamera() {
    // Only rays through facility receivers can contribute. Keep lateral bounds
    // tight; reserve the rider/jump margin along the light's depth axis only.
    const bounds=this.bounds.clone().applyMatrix4(this.camera.matrixWorldInverse).expandByScalar(.012);
    this.camera.left=bounds.min.x;this.camera.right=bounds.max.x;
    this.camera.bottom=bounds.min.y;this.camera.top=bounds.max.y;
    this.camera.near=Math.max(.01,-bounds.max.z-.25);this.camera.far=-bounds.min.z+.25;
    this.depthBiasNode.value=SURFACE_SHADOW_BIAS/(this.camera.far-this.camera.near);
    this.camera.updateProjectionMatrix();
    this.matrixNode.value.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);
    for(const receiver of this.receiverDepths)receiver.dirty=true;
  }

  addBaby(mesh:THREE.Mesh) {this.roots.add(mesh);this.register(mesh,this.baby,false);this.babyDirty=true;}

  /** Update every registered root once; facility ground shadows can share this pass. */
  syncWorldMatrices() {
    // Lazy-loaded worlds remain attached to the main scene after travel. Their
    // matrices are irrelevant while an ancestor is hidden, and recursively
    // updating those inactive scene graphs every rendered frame only burns CPU.
    // The first update after a world becomes visible synchronizes the complete
    // subtree before any shadow proxy reads its matrixWorld.
    for(const root of this.roots)if(this.visible(root))root.updateWorldMatrix(true,true);
    return ++this.worldSyncRevision;
  }

  /** Reuse the table's 1.5-texel tent spacing, expressed in world metres. */
  setGroundFootprint(span:THREE.Vector2,groundWidth=GROUND_SHADOW_SIZE,groundHeight=GROUND_SHADOW_SIZE) {
    const m=this.matrixNode.value.elements;
    this.filterXNode.value.set(m[0],-m[1]).multiplyScalar(.5*span.x*1.5/groundWidth);
    this.filterZNode.value.set(m[8],-m[9]).multiplyScalar(.5*span.y*1.5/groundHeight);
  }

  private occlusion(target:THREE.RenderTarget,receiverTarget?:THREE.RenderTarget) {
    return Fn(()=>{
      const clip=this.matrixNode.mul(vec4(positionWorld,1)).toVar();
      const uv=clip.xy.mul(vec2(.5,-.5)).add(.5).toVar();
      const inside=uv.x.greaterThan(0).and(uv.x.lessThan(1)).and(uv.y.greaterThan(0)).and(uv.y.lessThan(1))
        .and(clip.z.greaterThan(0)).and(clip.z.lessThan(1));
      // Solve dz/du,dz/dv on the actual rasterized receiver plane. Comparing
      // every tap to the centre depth makes even a flat tilted beam self-shadow.
      const dx=uv.dFdx(),dy=uv.dFdy(),dz=vec2(clip.z.dFdx(),clip.z.dFdy());
      const determinant=dx.x.mul(dy.y).sub(dx.y.mul(dy.x)).toVar();
      const safeDeterminant=determinant.greaterThanEqual(0).select(determinant.max(1e-12),determinant.min(-1e-12));
      const gradient=vec2(dy.y.mul(dz.x).sub(dx.y.mul(dz.y)),dx.x.mul(dz.y).sub(dy.x.mul(dz.x)))
        .div(safeDeterminant).toVar();
      // A tangent plane is valid within a texel, not across a curved blanket.
      // Anchor to its own rasterized depth, then use actual receiver depths at
      // the wide PCF taps. Retain the center's depth separation so folds can
      // still shadow themselves rather than excluding this caster entirely.
      const separation=float(0).toVar();
      if(receiverTarget){
        const centerBase=uv.mul(SURFACE_SHADOW_SIZE).sub(.5).floor();
        const anchor=float(-1).toVar();
        // A nearest texel can belong to the next triangle on a curved ridge.
        // Use the conservative envelope of the four surrounding planes so a
        // triangle-boundary mismatch does not turn into false self separation.
        for(let y=0;y<2;y++)for(let x=0;x<2;x++){
          const sampleUV=centerBase.add(vec2(x,y)).add(.5).div(SURFACE_SHADOW_SIZE);
          const own=texture(receiverTarget.texture,sampleUV).r;
          const predicted=own.add(gradient.dot(uv.sub(sampleUV)));
          anchor.assign(own.lessThan(1).select(anchor.max(predicted),anchor));
        }
        separation.assign(anchor.greaterThanEqual(0).select(clip.z.sub(anchor).max(0),0));
      }
      const mask=float(0).toVar();
      for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++) {
        const sampleUV=uv.add(this.filterXNode.mul(x)).add(this.filterZNode.mul(z));
        const texel=sampleUV.mul(SURFACE_SHADOW_SIZE).sub(.5).toVar(),base=texel.floor(),fraction=texel.fract();
        const tentWeight=(x===0?2:1)*(z===0?2:1)/16;
        // Interpolate visibility, never depth. The outer tent has exactly the
        // ground shadow's world-space footprint, independent of map resolution.
        for(let by=0;by<=1;by++)for(let bx=0;bx<=1;bx++) {
          const tapUV=base.add(vec2(bx,by)).add(.5).div(SURFACE_SHADOW_SIZE);
          const depth=texture(target.texture,tapUV).r;
          const planeDepth=clip.z.add(gradient.dot(tapUV.sub(uv)));
          const ownDepth=receiverTarget?texture(receiverTarget.texture,tapUV).r:float(1);
          const receiverDepth=(receiverTarget?ownDepth.lessThan(1).select(ownDepth.add(separation),planeDepth):planeDepth).sub(this.depthBiasNode);
          const weight=(bx?fraction.x:fraction.x.oneMinus()).mul(by?fraction.y:fraction.y.oneMinus()).mul(tentWeight);
          const tapInside=tapUV.x.greaterThan(0).and(tapUV.x.lessThan(1)).and(tapUV.y.greaterThan(0)).and(tapUV.y.lessThan(1));
          mask.addAssign(float(receiverDepth.greaterThan(depth).and(tapInside)).mul(weight));
        }
      }
      return mask.mul(float(inside));
    })();
  }

  private register(source:THREE.Mesh,scene:THREE.Scene,receiveBaby:boolean) {
    const proxy=new THREE.Mesh(source.geometry,this.material);
    proxy.matrixAutoUpdate=false;proxy.frustumCulled=false;scene.add(proxy);
    this.casters.push({source,proxy,version:-1});
    let receiverTarget:THREE.RenderTarget|undefined;
    if(source.userData.curvedShadowReceiver){
      receiverTarget=this.facilityTarget.clone();
      const receiverScene=new THREE.Scene();receiverScene.background=new THREE.Color(1,1,1);
      const receiverProxy=new THREE.Mesh(source.geometry,this.material);
      receiverProxy.matrixAutoUpdate=false;receiverProxy.frustumCulled=false;receiverScene.add(receiverProxy);
      this.receiverDepths.push({source,proxy:receiverProxy,scene:receiverScene,target:receiverTarget,dirty:true});
    }
    for(const material of Array.isArray(source.material)?source.material:[source.material]) {
      if(source.userData.groundReceiver)continue;
      if(!(material instanceof THREE.NodeMaterial)||this.receivers.has(material))continue;
      this.receivers.add(material);
      let visibility=this.occlusion(this.facilityTarget,receiverTarget).oneMinus();
      if(receiveBaby)visibility=visibility.mul(this.occlusion(this.babyTarget,receiverTarget).oneMinus());
      const facing=normalWorldGeometry.dot(this.directionNode).max(0);
      const attenuation=float(1).sub(visibility.oneMinus().mul(this.windowFraction).mul(facing));
      // Use the physical material's indirect-light occlusion path. Multiplying
      // final output also darkens refracted scenery and creates a painted-on mask.
      material.aoNode=material.aoNode?float(material.aoNode as THREE.Node<'float'>).mul(attenuation):attenuation;
      material.needsUpdate=true;
    }
  }

  get fractionNode(){return this.windowFraction;}

  update(renderer:THREE.WebGPURenderer,syncedRevision=-1) {
    if(syncedRevision!==this.worldSyncRevision)this.syncWorldMatrices();
    for(const caster of this.casters) {
      const visible=this.visible(caster.source),visibilityChanged=caster.proxy.visible!==visible;
      if(!visible) {
        if(visibilityChanged) {
          caster.proxy.visible=false;
          for(const receiver of this.receiverDepths)if(receiver.source===caster.source){receiver.proxy.visible=false;receiver.dirty=false;}
          if(caster.proxy.parent===this.facilities)this.facilityDirty=true;else this.babyDirty=true;
        }
        continue;
      }
      const position=caster.source.geometry.attributes.position;
      const version=position instanceof THREE.InterleavedBufferAttribute?position.data.version:position.version;
      const geometryChanged=version!==caster.version;
      const transformChanged=!caster.proxy.matrix.equals(caster.source.matrixWorld);
      if(!geometryChanged&&!transformChanged&&!visibilityChanged)continue;
      caster.version=version;
      if(transformChanged){caster.proxy.matrix.copy(caster.source.matrixWorld);caster.proxy.matrixWorldNeedsUpdate=true;}
      if(visibilityChanged)caster.proxy.visible=visible;
      for(const receiver of this.receiverDepths)if(receiver.source===caster.source){
        if(transformChanged){receiver.proxy.matrix.copy(caster.source.matrixWorld);receiver.proxy.matrixWorldNeedsUpdate=true;}
        if(visibilityChanged)receiver.proxy.visible=visible;
        receiver.dirty=true;
      }
      if(caster.proxy.parent===this.facilities)this.facilityDirty=true;else this.babyDirty=true;
    }
    if(!this.facilityDirty&&!this.babyDirty&&!this.receiverDepths.some(receiver=>receiver.dirty))return;
    const previous=renderer.getRenderTarget(),autoClear=renderer.autoClear;
    try {
      renderer.autoClear=true;
      for(const receiver of this.receiverDepths)if(receiver.dirty){renderer.setRenderTarget(receiver.target);renderer.render(receiver.scene,this.camera);receiver.dirty=false;}
      if(this.facilityDirty){renderer.setRenderTarget(this.facilityTarget);renderer.render(this.facilities,this.camera);this.facilityDirty=false;}
      if(this.babyDirty){renderer.setRenderTarget(this.babyTarget);renderer.render(this.baby,this.camera);this.babyDirty=false;}
    } finally {renderer.setRenderTarget(previous);renderer.autoClear=autoClear;}
  }

  dispose() {
    for(const receiver of this.receiverDepths){receiver.scene.clear();receiver.target.dispose();}this.receiverDepths.length=0;
    this.facilities.clear();this.baby.clear();this.casters.length=0;this.roots.clear();this.receivers.clear();
    this.material.dispose();this.facilityTarget.dispose();this.babyTarget.dispose();
  }
}
