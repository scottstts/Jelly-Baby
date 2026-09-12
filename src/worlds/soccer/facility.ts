import { Group, Mesh, Vector3, type Scene } from 'three/webgpu';
import type { SoftBody } from '../../physics/soft-body.js';
import type { Facility } from '../../facilities/manager.ts';
import { FacilityCollision } from '../../facilities/collision.ts';
import type { FacilityShadows } from '../../facilities/shadows.ts';
import { Baby } from '../../graphics/character/baby.ts';
import { SoccerStadium, soccerBallGeometry, soccerBallMaterial } from './stadium.ts';
import { SoccerPhysics } from './physics.ts';
import { JellySkates } from './skates.ts';
import { RENTAL, SOCCER_ENVELOPE, soccerBox } from './layout.ts';
import { GoalieContact } from './goalie-contact.ts';
import { StadiumCollisionGrid } from './collision-grid.ts';
import { markStadiumSupport } from './walking-support.ts';

export class SoccerFacility implements Facility {
  readonly id='soccer';readonly label='Soccer';readonly cameraDistance=.34;
  readonly allowCarriedInteraction=true;
  readonly physics:SoccerPhysics;
  readonly collision:FacilityCollision;
  private readonly goalieContact:GoalieContact;
  private readonly collisionGrid:StadiumCollisionGrid;
  private readonly equipmentCollision:FacilityCollision;
  private readonly displayedEquipment=[soccerBox(RENTAL.x,RENTAL.y+.007,RENTAL.z,.049,.014,.042)];
  readonly stadium=new SoccerStadium();
  readonly playerSkates=new JellySkates();
  readonly goalieSkates=new JellySkates();
  readonly displaySkates=new JellySkates();
  readonly goalie:Baby;
  readonly ball=new Mesh(soccerBallGeometry(),soccerBallMaterial());
  private readonly moving=new Group();
  private readonly score=document.createElement('div');
  private scoreValue=-1;
  onPlacement:()=>void=()=>{};
  private readonly body:SoftBody;
  constructor(scene:Scene,body:SoftBody,shadows:FacilityShadows) {
    this.body=body;this.physics=new SoccerPhysics(body);this.goalie=new Baby(this.physics.goalie.body);this.goalie.setFlavor('blueberry');
    // FaceSkin binds in the original local rest frame, then follows the placed cage.
    this.physics.goalie.body.updateSurface();this.goalie.update();
    this.collision=new FacilityCollision(body);this.collision.registerBoxes(this.stadium.boxes);
    this.collisionGrid=new StadiumCollisionGrid(this.stadium.boxes,body);
    this.goalieContact=new GoalieContact(body,this.physics.goalie);
    this.equipmentCollision=new FacilityCollision(body);this.equipmentCollision.registerBoxes(this.displayedEquipment);
    this.moving.name='soccer-players-and-ball';this.ball.name='soccer-ball';
    this.moving.add(this.playerSkates.group,this.goalieSkates.group,this.displaySkates.group,this.goalie.group,this.ball);
    this.displaySkates.update(new Vector3(RENTAL.x,RENTAL.y,RENTAL.z),.3,0);
    scene.add(this.stadium.group,this.moving);
    this.moving.traverse(o=>{if(o instanceof Mesh){o.castShadow=o.receiveShadow=o.receiveCaustics=true;}});
    shadows.add(this.stadium.group,SOCCER_ENVELOPE);shadows.add(this.moving,SOCCER_ENVELOPE);
    this.score.className='soccer-score';this.score.hidden=true;this.score.setAttribute('role','status');this.score.setAttribute('aria-live','polite');document.querySelector('#app')!.append(this.score);
    this.update();
  }
  get active(){return this.physics.riding;}
  get laughing(){return this.physics.laughing;}
  get crying(){return this.physics.crying;}
  get showPrompt(){return !this.active||this.physics.canLeave;}
  get action(){return this.active?'Take Off Skates':'Put On Skates';}
  get interactionDistance(){return !this.body.grab&&Math.hypot(this.body.center.x-RENTAL.x,this.body.center.z-RENTAL.z)<.16?0.01:Infinity;}
  interact() {
    if(this.active){if(!this.physics.canLeave)return false;this.physics.leave();}
    else {if(!Number.isFinite(this.interactionDistance))return false;this.physics.board();}
    this.onPlacement();this.update();return true;
  }
  step(h:number){this.physics.step(h);}
  afterStep(){const boxes=this.collisionGrid.near(this.body);this.collision.resolveBoxes(boxes);if(!this.active){markStadiumSupport(this.body,boxes);this.equipmentCollision.resolveBoxes(this.displayedEquipment);}this.goalieContact.resolve();this.physics.afterStep();}
  warmupCollision(){this.collision.warmupBoxes(this.stadium.boxes);this.goalieContact.warmup();this.equipmentCollision.warmupBoxes(this.displayedEquipment);}
  update() {
    const p=this.physics;this.playerSkates.group.visible=p.riding;this.displaySkates.group.visible=!p.riding;
    this.playerSkates.update(p.player.position,p.player.yaw,p.player.travel,p.player.pivotPhase,p.player.pivotWeight);this.goalieSkates.update(p.goalie.position,p.goalie.yaw,p.goalie.travel);
    this.ball.position.copy(p.ball);this.ball.quaternion.copy(p.ballRotation);
    this.score.hidden=!p.riding;
    if(this.scoreValue!==p.score){this.scoreValue=p.score;this.score.textContent=`${p.score} ${p.score===1?'goal':'goals'}`;this.stadium.setScore(p.score);}
  }
  updateFrame(dt:number){const body=this.physics.goalie.body;if(body.surfaceDirty)body.updateSurface();this.goalie.update(dt);}
  reset(){this.physics.reset();this.score.hidden=true;this.goalie.resetFace();this.update();}
  dispose(){this.collision.dispose();this.goalieContact.dispose();this.equipmentCollision.dispose();this.stadium.dispose();this.playerSkates.dispose();this.goalieSkates.dispose();this.displaySkates.dispose();this.goalie.dispose();this.ball.geometry.dispose();(this.ball.material as ReturnType<typeof soccerBallMaterial>).dispose();this.moving.removeFromParent();this.score.remove();}
}
