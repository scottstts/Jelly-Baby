import type { Mesh, MeshPhysicalNodeMaterial, PerspectiveCamera, WebGPURenderer } from 'three/webgpu';
import type Node from 'three/src/nodes/core/Node.js';
import type { SoftBody } from '../../physics/soft-body.js';
import type { FacilityShadows } from '../../facilities/shadows.ts';
import type { CausticReceivers } from '../../graphics/optics/caustic-receivers.ts';
import { RefractiveLightField } from '../../graphics/optics/refractive-light.js';
import { OpticalTransport } from '../../graphics/optics/transport.ts';
import { JELLY_FLAVORS } from '../../graphics/character/jelly-flavors.ts';
import { FIELD } from './layout.ts';

/** Wiring only: the pitch and keeper use the floor and player optical systems. */
export class SoccerLighting {
  private readonly optics:RefractiveLightField;
  private readonly transport:OpticalTransport;
  private readonly receivers:CausticReceivers;
  private readonly primary:RefractiveLightField;
  private readonly body:SoftBody;
  private readonly fail:(error:Error)=>void;

  constructor(turf:Mesh,body:SoftBody,shadows:FacilityShadows,caustics:CausticReceivers,camera:PerspectiveCamera,fail:(error:Error)=>void) {
    this.body=body;this.fail=fail;this.primary=caustics.optics;
    const direction=this.primary.lightDirection,fraction=shadows.surfaces.fractionNode;
    const field=shadows.atHeight(FIELD.y,direction,fraction.value);
    const material=turf.material as MeshPhysicalNodeMaterial,albedo=material.colorNode as Node<'vec3'>;
    turf.userData.groundReceiver=true;turf.receiveCaustics=true;
    caustics.registerGround(turf,albedo,field,fraction,FIELD.y);
    this.optics=new RefractiveLightField(body.cage.opticalSurface,direction,JELLY_FLAVORS.blueberry.absorption);
    this.transport=new OpticalTransport(this.optics,body,camera,direction,fail);
    this.receivers=caustics.addSource(this.optics);this.receivers.enabledNode.value=0;
  }

  update(renderer:WebGPURenderer,active:boolean) {
    this.receivers.enabledNode.value=active?1:0;
    if(!active)return;
    // Read the player's actual source, including a lighting switch while Soccer was hidden.
    if(this.optics.lightDirection.distanceToSquared(this.primary.lightDirection)>1e-14){
      this.optics.setLightDirection(this.primary.lightDirection);
      this.transport.setLightDirection(this.primary.lightDirection);
    }
    this.transport.follow();this.optics.update(renderer,this.body);
    void this.transport.update().catch(this.fail);
  }

  dispose(){this.receivers.enabledNode.value=0;this.transport.dispose();this.optics.dispose();}
}
