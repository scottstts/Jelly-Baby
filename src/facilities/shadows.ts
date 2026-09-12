import * as THREE from 'three/webgpu';
import { float, positionWorld, uniform, vec3 } from 'three/tsl';
import { SurfaceShadows } from './surface-shadows.ts';
import type { CausticReceivers } from '../graphics/optics/caustic-receivers.ts';

export const FACILITY_SHADOW_SIZE=512;

/** Fixed-world planar occlusion for opaque facilities under the measured window.
 * Geometry is shared with the visible objects; shadows never overlay the table.
 */
export class FacilityShadows {
  readonly surfaces:SurfaceShadows;
  readonly caustics:CausticReceivers|undefined;
  readonly target=new THREE.RenderTarget(FACILITY_SHADOW_SIZE,FACILITY_SHADOW_SIZE,{depthBuffer:false,samples:4});
  readonly originNode=uniform(new THREE.Vector2());
  readonly spanNode=uniform(new THREE.Vector2(1,1));
  readonly worldToUVNode=uniform(new THREE.Matrix3());
  readonly shadowTexelNode=uniform(new THREE.Vector2(1/FACILITY_SHADOW_SIZE,1/FACILITY_SHADOW_SIZE));
  private readonly scene=new THREE.Scene();
  private readonly camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,2);
  private readonly material=new THREE.MeshBasicNodeMaterial({color:0xff0000,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
    transparent:true,blending:THREE.CustomBlending,blendEquation:THREE.MaxEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor});
  private readonly contactMaterial=this.material.clone();
  private readonly projection=new THREE.Matrix4();
  private readonly contactProjection=new THREE.Matrix4().set(1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1);
  private readonly bounds=new THREE.Box2();
  private readonly casters:{source:THREE.Mesh;shadow:THREE.Mesh;contact:THREE.Mesh;matrix:THREE.Matrix4;positionVersion:number;projectionVersion:number}[]=[];
  private projectionVersion=0;
  private targetDirty=true;
  private readonly envelopes:{group:THREE.Group;bounds:THREE.Box3;visible:boolean}[]=[];
  private referenceSpan:THREE.Vector2|undefined;
  private readonly receiverFields=new Map<number,FacilityShadows>();
  private readonly receiverHeight:number;
  private visible(group:THREE.Object3D) {
    for(let object:THREE.Object3D|null=group;object;object=object.parent)if(!object.visible)return false;
    return true;
  }
  constructor(incoming:THREE.Vector3,windowFraction:number,caustics?:CausticReceivers,receiverHeight=-.00005) {
    this.receiverHeight=receiverHeight;
    this.caustics=caustics;
    if(incoming.y>=-.01)throw new Error('Facility shadows require a downward light direction');
    this.surfaces=new SurfaceShadows(incoming,windowFraction);
    const x=incoming.x/incoming.y,z=incoming.z/incoming.y,floor=receiverHeight;
    // Project onto the tabletop along incoming light, then put world X/Z in
    // shadow-camera X/Y. Fixed bounds avoid camera-following texel shimmer.
    this.projection.set(1,-x,0,x*floor,0,-z,1,z*floor,0,receiverHeight>0?1:0,0,0,0,0,0,1);
    if(receiverHeight>0)this.material.colorNode=vec3(float(positionWorld.z.greaterThan(receiverHeight+.001)),0,0);
    // R: directional window occlusion. G: near-floor ambient contact. MAX
    // blending unions each channel so the mat cannot erase leg/foot shadows.
    // Contact projection preserves original height in Z for the falloff shader.
    const contact=float(1).sub(positionWorld.z.sub(Math.max(0,receiverHeight)).smoothstep(.001,.025));
    this.contactMaterial.colorNode=vec3(0,receiverHeight>0?contact.mul(float(positionWorld.z.greaterThan(receiverHeight+.001))):contact,0);
    this.scene.background=new THREE.Color(0x000000);
    this.camera.position.z=1;this.camera.updateMatrixWorld();
    this.target.texture.colorSpace=THREE.NoColorSpace;
    this.target.texture.generateMipmaps=false;
    this.target.texture.minFilter=this.target.texture.magFilter=THREE.LinearFilter;
  }
  /** Bounds must include the facility's entire motion envelope, in world metres. */
  add(group:THREE.Group,envelope:THREE.Box3) {
    if(this.receiverHeight<0)this.surfaces.add(group,envelope);
    for(const field of this.receiverFields.values())field.add(group,envelope);
    this.envelopes.push({group,bounds:envelope.clone(),visible:this.visible(group)});this.fitBounds();
    group.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      if(this.receiverHeight<0&&object.receiveCaustics!==false)object.receiveCaustics=true;
      this.caustics?.register(object);
      if(object.userData.opticalShadowCaster)return;
      const shadow=new THREE.Mesh(object.geometry,this.material);
      shadow.matrixAutoUpdate=false;shadow.frustumCulled=false;this.scene.add(shadow);
      const contact=new THREE.Mesh(object.geometry,this.contactMaterial);
      contact.name='facility-contact';contact.matrixAutoUpdate=false;contact.frustumCulled=false;this.scene.add(contact);
      this.casters.push({source:object,shadow,contact,matrix:new THREE.Matrix4(),positionVersion:-1,projectionVersion:-1});
    });
    this.targetDirty=true;
  }
  /** Reuse the floor projection at another horizontal receiver's elevation. */
  atHeight(height:number,incoming:THREE.Vector3,windowFraction:number) {
    let field=this.receiverFields.get(height);
    if(!field){
      field=new FacilityShadows(incoming,windowFraction,undefined,height);
      field.referenceSpan=this.referenceSpan?.clone();
      for(const item of this.envelopes)field.add(item.group,item.bounds);
      this.receiverFields.set(height,field);
    }
    return field;
  }
  setLighting(incoming:THREE.Vector3,windowFraction:number) {
    if(incoming.y>=-.01)throw new Error('Facility shadows require a downward light direction');
    const x=incoming.x/incoming.y,z=incoming.z/incoming.y,floor=this.receiverHeight;
    this.projection.set(1,-x,0,x*floor,0,-z,1,z*floor,0,this.receiverHeight>0?1:0,0,0,0,0,0,1);
    for(const field of this.receiverFields.values())field.setLighting(incoming,windowFraction);
    this.surfaces.setLighting(incoming,windowFraction);
    this.fitBounds();this.targetDirty=true;
  }
  private fitBounds() {
    this.bounds.makeEmpty();
    const p=new THREE.Vector3();
    const active=this.envelopes.filter(item=>this.visible(item.group)).map(item=>item.bounds);
    if(!active.length)return;
    this.surfaces.setBounds(active);
    for(const envelope of active) {
      for(const x of [envelope.min.x,envelope.max.x])for(const y of [envelope.min.y,envelope.max.y])for(const z of [envelope.min.z,envelope.max.z]) {
        p.set(x,y,z).applyMatrix4(this.projection);this.bounds.expandByPoint(new THREE.Vector2(p.x,p.y));
        this.bounds.expandByPoint(new THREE.Vector2(x,z));
      }
    }
    const padded=this.bounds.clone().expandByScalar(.012),span=padded.getSize(new THREE.Vector2());
    const width=this.referenceSpan?Math.max(FACILITY_SHADOW_SIZE,Math.ceil(FACILITY_SHADOW_SIZE*span.x/this.referenceSpan.x)):FACILITY_SHADOW_SIZE;
    const height=this.referenceSpan?Math.max(FACILITY_SHADOW_SIZE,Math.ceil(FACILITY_SHADOW_SIZE*span.y/this.referenceSpan.y)):FACILITY_SHADOW_SIZE;
    if(this.target.width!==width||this.target.height!==height)this.target.setSize(width,height);
    this.shadowTexelNode.value.set(1/width,1/height);
    this.projectionVersion++;
    this.originNode.value.copy(padded.min);this.spanNode.value.copy(span);
    this.surfaces.setGroundFootprint(span,width,height);
    // WebGPU raster rows run downward: UV.v = 1 - normalized world Z.
    // WGSLNodeBuilder.isFlipY() is false in the pinned Three version, so the
    // texture node does NOT supply this conversion. Keep the actual lookup
    // matrix available to the projection regression, not a separate CPU copy.
    this.worldToUVNode.value.set(
      1/span.x,0,-padded.min.x/span.x,
      0,-1/span.y,1+padded.min.y/span.y,
      0,0,1,
    );
    this.camera.left=padded.min.x;this.camera.right=padded.max.x;
    this.camera.bottom=padded.min.y;this.camera.top=padded.max.y;this.camera.updateProjectionMatrix();
  }
  update(renderer:THREE.WebGPURenderer) {
    if(!this.referenceSpan&&!this.bounds.isEmpty())this.referenceSpan=this.spanNode.value.clone();
    let changedWorld=false;
    for(const item of this.envelopes){const visible=this.visible(item.group);if(visible!==item.visible){item.visible=visible;changedWorld=true;}}
    if(changedWorld){this.fitBounds();this.targetDirty=true;}
    const worldSyncRevision=this.surfaces.syncWorldMatrices();
    for(const field of this.receiverFields.values())field.update(renderer);
    for(const caster of this.casters) {
      const position=caster.source.geometry.attributes.position;
      const positionVersion=position instanceof THREE.InterleavedBufferAttribute?position.data.version:position.version;
      if(positionVersion!==caster.positionVersion){caster.positionVersion=positionVersion;this.targetDirty=true;}
      const transformChanged=!caster.matrix.equals(caster.source.matrixWorld);
      let visible=true;
      for(let object:THREE.Object3D|null=caster.source;object;object=object.parent)visible&&=object.visible;
      const visibilityChanged=caster.shadow.visible!==visible;
      if(transformChanged||visibilityChanged||caster.projectionVersion!==this.projectionVersion) {
        caster.matrix.copy(caster.source.matrixWorld);
        caster.shadow.matrix.multiplyMatrices(this.projection,caster.matrix);
        caster.shadow.matrixWorldNeedsUpdate=true;caster.shadow.visible=visible;
        caster.contact.matrix.multiplyMatrices(this.contactProjection,caster.matrix);
        caster.contact.matrixWorldNeedsUpdate=true;caster.contact.visible=visible;
        caster.projectionVersion=this.projectionVersion;this.targetDirty=true;
      }
    }
    if(!this.targetDirty)return worldSyncRevision;
    const previous=renderer.getRenderTarget(),autoClear=renderer.autoClear;
    try {
      renderer.autoClear=true;renderer.setRenderTarget(this.target);renderer.render(this.scene,this.camera);
      this.targetDirty=false;
    } finally {renderer.setRenderTarget(previous);renderer.autoClear=autoClear;}
    return worldSyncRevision;
  }
  dispose() {for(const field of this.receiverFields.values())field.dispose();this.receiverFields.clear();this.surfaces.dispose();this.scene.clear();this.casters.length=0;this.material.dispose();this.contactMaterial.dispose();this.target.dispose();}
}
