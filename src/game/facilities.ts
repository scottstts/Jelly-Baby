import type { SoftBody } from '../physics/soft-body.js';
import type { FacilityCollision } from '../physics/facility-collision.ts';
import { collisionHierarchy, type CollisionHierarchy } from '../physics/collision-bounds.ts';

export interface Facility {
  readonly id:string;
  readonly label:string;
  readonly active:boolean;
  /** Distance to an available interaction, or Infinity when unavailable. */
  readonly interactionDistance:number;
  readonly laughing?:boolean;
  readonly sleeping?:boolean;
  readonly crying?:boolean;
  readonly showPrompt?:boolean;
  readonly action?:string;
  readonly mobileAction?:string;
  readonly cameraDistance?:number;
  /** Leave this facility's state untouched when crossing a portal. */
  readonly persistAcrossTravel?:boolean;
  /** Built-in afterStep methods mutate cage state only through these contacts. */
  readonly collision?:FacilityCollision;
  interact():boolean;
  step(h:number):void;
  afterStep?():void;
  warmupCollision?():void;
  update():void;
  reset():void;
  dispose():void;
}

/** One interaction owner and one contextual affordance, shared by every facility. */
export class Facilities {
  enabled=true;
  private readonly items:Facility[]=[];
  private readonly abort=new AbortController();
  private readonly prompt=document.createElement('div');
  private readonly hint=document.createElement('span');
  private readonly button=document.createElement('button');
  private readonly collisionWorld:CollisionHierarchy|undefined;
  onInteract:()=>void=()=>{};
  constructor(body?:SoftBody) {
    this.collisionWorld=body?collisionHierarchy(body):undefined;
    this.prompt.className='facility-prompt';this.prompt.hidden=true;
    this.hint.className='facility-hint';this.hint.setAttribute('role','status');
    this.button.className='facility-button';this.button.type='button';
    this.prompt.append(this.hint,this.button);document.querySelector('#app')!.append(this.prompt);
    const signal=this.abort.signal;
    this.button.addEventListener('click',()=>this.interact(),{signal});
    window.addEventListener('keydown',event=>{
      if(event.code!=='KeyE'||event.repeat||(event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]'))return;
      if(this.candidate){event.preventDefault();this.interact();}
    },{signal});
  }
  add(facility:Facility) {
    if(this.items.some(item=>item.id===facility.id))throw new Error(`Duplicate facility: ${facility.id}`);
    this.items.push(facility);return facility;
  }
  get active() {return this.enabled?this.items.find(item=>item.active):undefined;}
  get crying() {return this.enabled&&this.items.some(item=>item.crying);}
  private get candidate() {
    if(!this.enabled)return undefined;
    return this.active??this.items.filter(item=>Number.isFinite(item.interactionDistance))
      .sort((a,b)=>a.interactionDistance-b.interactionDistance)[0];
  }
  private interact() {
    if(this.candidate?.interact()){this.onInteract();this.update();}
  }
  step(h:number) {if(this.enabled)for(const item of this.items)item.step(h);}
  warmupCollisions() {this.collisionWorld?.warmup();for(const item of this.items)item.warmupCollision?.();}
  afterStep() {
    if(!this.enabled)return;
    this.collisionWorld?.begin();
    try {
      for(const item of this.items){
        item.afterStep?.();
        // Unknown facilities may write cage positions directly.
        if(!item.collision)this.collisionWorld?.invalidate();
      }
    }finally{this.collisionWorld?.end();}
  }
  update() {
    if(!this.enabled){this.prompt.hidden=true;return;}
    for(const item of this.items)item.update();
    const candidate=this.candidate;this.prompt.hidden=!candidate||candidate.showPrompt===false;
    if(!candidate)return;
    const action=candidate.action??(candidate.active?`Get Off ${candidate.label}`:`Play ${candidate.label}`);
    const hint=`Press E to ${action}`;
    if(this.hint.textContent!==hint)this.hint.textContent=hint;
    const mobileAction=candidate.mobileAction??action;
    if(this.button.textContent!==mobileAction)this.button.textContent=mobileAction;
  }
  reset() {for(const item of this.items)item.reset();this.prompt.hidden=true;}
  resetForTravel() {for(const item of this.items)if(!item.persistAcrossTravel)item.reset();this.prompt.hidden=true;}
  dispose() {this.abort.abort();this.prompt.remove();for(const item of this.items)item.dispose();}
}
