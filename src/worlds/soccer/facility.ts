import { Group, Mesh, type Scene } from 'three/webgpu';
import type { SoftBody } from '../../physics/soft-body.js';
import type { Facility } from '../../facilities/manager.ts';
import { FacilityCollision } from '../../facilities/collision.ts';
import type { FacilityShadows } from '../../facilities/shadows.ts';
import { Baby } from '../../graphics/character/baby.ts';
import { SoccerStadium, soccerBallGeometry, soccerBallMaterial } from './stadium.ts';
import { SoccerPhysics } from './physics.ts';
import { SOCCER_ENVELOPE } from './layout.ts';
import { GoalieContact } from './goalie-contact.ts';
import { StadiumCollisionGrid } from './collision-grid.ts';
import { markStadiumSupport } from './walking-support.ts';
import type { GrassTextureSet } from './turf.ts';

export class SoccerFacility implements Facility {
  readonly id='soccer';readonly label='Soccer';
  readonly physics:SoccerPhysics;
  readonly collision:FacilityCollision;
  private readonly goalieContact:GoalieContact;
  private readonly collisionGrid:StadiumCollisionGrid;
  readonly stadium:SoccerStadium;
  readonly goalie:Baby;
  readonly ball=new Mesh(soccerBallGeometry(),soccerBallMaterial());
  private readonly moving=new Group();
  private readonly score=document.createElement('div');
  private scoreValue=-1;
  constructor(scene:Scene,body:SoftBody,shadows:FacilityShadows,grass?:GrassTextureSet) {
    this.stadium=new SoccerStadium(false,grass);
    this.physics=new SoccerPhysics(body);this.goalie=new Baby(this.physics.goalie.body);this.goalie.setFlavor('blueberry');
    // FaceSkin binds in the original local rest frame, then follows the placed cage.
    this.physics.goalie.body.updateSurface();this.goalie.update();
    this.collision=new FacilityCollision(body);this.collision.registerBoxes(this.stadium.boxes);
    this.collisionGrid=new StadiumCollisionGrid(this.stadium.boxes,body);
    this.goalieContact=new GoalieContact(body,this.physics.goalie);
    this.moving.name='soccer-players-and-ball';this.ball.name='soccer-ball';this.moving.add(this.goalie.group,this.ball);
    scene.add(this.stadium.group,this.moving);
    this.moving.traverse(o=>{if(o instanceof Mesh){o.castShadow=o.receiveShadow=o.receiveCaustics=true;}});
    shadows.add(this.stadium.group,SOCCER_ENVELOPE);shadows.add(this.moving,SOCCER_ENVELOPE);
    this.score.className='soccer-score';this.score.hidden=true;this.score.setAttribute('role','status');this.score.setAttribute('aria-live','polite');document.querySelector('#app')!.append(this.score);
    this.update();
  }
  get active(){return false;}
  get laughing(){return this.physics.laughing;}
  get crying(){return this.physics.crying;}
  get interactionDistance(){return Infinity;}
  interact(){return false;}
  step(h:number){this.physics.step(h);}
  afterStep(){const boxes=this.collisionGrid.near(this.physics.body);this.collision.resolveBoxes(boxes);markStadiumSupport(this.physics.body,boxes);this.goalieContact.resolve();this.physics.afterStep();}
  warmupCollision(){this.collision.warmupBoxes(this.stadium.boxes);this.goalieContact.warmup();}
  update() {
    const p=this.physics;this.ball.position.copy(p.ball);this.ball.quaternion.copy(p.ballRotation);
    this.score.hidden=!p.onField;
    if(this.scoreValue!==p.score){this.scoreValue=p.score;this.score.textContent=`${p.score} ${p.score===1?'goal':'goals'}`;this.stadium.setScore(p.score);}
  }
  updateFrame(dt:number){const body=this.physics.goalie.body;if(body.surfaceDirty)body.updateSurface();this.goalie.update(dt);}
  reset(){this.physics.reset();this.score.hidden=true;this.goalie.resetFace();this.update();}
  dispose(){this.collision.dispose();this.goalieContact.dispose();this.stadium.dispose();this.goalie.dispose();this.ball.geometry.dispose();(this.ball.material as ReturnType<typeof soccerBallMaterial>).dispose();this.moving.removeFromParent();this.score.remove();}
}
