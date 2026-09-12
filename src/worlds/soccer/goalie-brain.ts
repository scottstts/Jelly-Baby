import { PHYS, clamp } from '../../physics/constants.js';
import { BALL, FIELD, GOAL } from './layout.ts';

export const GOALIE_HOME_Z=-1.43;
export const GOALIE_FRONT_Z=-1.255;
export const GOALIE_BACK_Z=-1.535;
export const GOALIE_SIDE_LIMIT=.205;

export type GoalieMode='set'|'intercept'|'challenge'|'rescue'|'clear';

export type GoalieObservation={
  ballX:number;ballY:number;ballZ:number;
  ballVX:number;ballVY:number;ballVZ:number;
  keeperX:number;keeperZ:number;
  elapsed:number;score:number;
};

export type GoalieDecision={
  mode:GoalieMode;
  targetX:number;
  targetZ:number;
  urgency:number;
  reach:number;
  jumpSpeed:number;
  clearance:number;
};

/** Stateful, intentionally imperfect goalkeeper policy. All outputs remain physical targets. */
export class GoalieBrain {
  private reaction=0;
  private jumpCooldown=0;
  private clearanceMemory=0;
  private rescueSide=1;
  private decision:GoalieDecision={mode:'set',targetX:0,targetZ:GOALIE_HOME_Z,urgency:0,reach:0,jumpSpeed:0,clearance:0};

  reset() {
    this.reaction=this.jumpCooldown=this.clearanceMemory=0;this.rescueSide=1;
    this.decision={mode:'set',targetX:0,targetZ:GOALIE_HOME_Z,urgency:0,reach:0,jumpSpeed:0,clearance:0};
  }

  notifySave(ballZ:number,ballVZ:number) {
    if(ballZ<-.98&&ballVZ<.52)this.clearanceMemory=Math.max(this.clearanceMemory,.72);
    this.reaction=0;
  }

  step(h:number,o:GoalieObservation) {
    this.reaction-=h;this.jumpCooldown=Math.max(0,this.jumpCooldown-h);this.clearanceMemory=Math.max(0,this.clearanceMemory-h);
    const behind=this.isBehindDanger(o);
    if(behind&&this.decision.mode!=='rescue'&&this.decision.mode!=='clear')this.reaction=0;
    if(this.reaction<=0)this.evaluate(o);
    const out=this.decision;
    if(out.jumpSpeed>0)this.decision={...out,jumpSpeed:0};
    return out;
  }

  private evaluate(o:GoalieObservation) {
    this.reaction=.075+.045*(.5+.5*Math.sin(o.elapsed*5.17+o.score*.91));
    const rescue=this.rescueDecision(o);if(rescue){this.decision=rescue;return;}
    const clearance=this.clearanceDecision(o);if(clearance){this.decision=clearance;return;}
    const intercept=this.interceptDecision(o);if(intercept){this.decision=intercept;return;}
    const challenge=this.challengeDecision(o);if(challenge){this.decision=challenge;return;}
    this.decision=this.setDecision(o);
  }

  private isBehindDanger(o:GoalieObservation) {
    return o.ballZ<o.keeperZ-.012&&o.ballZ<-1.31&&Math.abs(o.ballX)<GOAL.width/2+.055&&o.ballY<FIELD.y+GOAL.height+.055;
  }

  private rescueDecision(o:GoalieObservation):GoalieDecision|null {
    if(!this.isBehindDanger(o))return null;
    const atRearLimit=o.keeperZ<=GOALIE_BACK_Z+.004,goalSide=o.keeperZ<o.ballZ-.012||atRearLimit;
    const side=this.rescueDirection(o);
    if(goalSide) {
      return {mode:'clear',targetX:clamp(o.ballX-side*.008,-GOALIE_SIDE_LIMIT,GOALIE_SIDE_LIMIT),targetZ:clamp(o.ballZ+.105,GOALIE_HOME_Z,GOALIE_FRONT_Z),urgency:1,reach:clamp((o.ballX-o.keeperX)*.16,-.014,.014),jumpSpeed:0,clearance:1};
    }
    const stagingX=clamp(o.ballX-side*.064,-GOALIE_SIDE_LIMIT,GOALIE_SIDE_LIMIT),lateralClear=Math.abs(o.keeperX-o.ballX)>.052;
    const trapped=Math.hypot(o.ballX-o.keeperX,o.ballZ-o.keeperZ)<.082;
    return {mode:'rescue',targetX:stagingX,targetZ:lateralClear?clamp(o.ballZ-.038,GOALIE_BACK_Z,GOALIE_HOME_Z-.012):clamp(o.keeperZ+.040,GOALIE_BACK_Z,GOALIE_FRONT_Z),urgency:1,reach:clamp((o.ballX-o.keeperX)*.18,-.015,.015),jumpSpeed:0,clearance:trapped?1:0};
  }

  private clearanceDecision(o:GoalieObservation):GoalieDecision|null {
    if(this.clearanceMemory<=0||o.ballZ>-.98||o.ballY>FIELD.y+.105||Math.abs(o.ballX-o.keeperX)>.25||Math.abs(o.ballZ-o.keeperZ)>.27||o.ballVZ>.52)return null;
    const side=this.rescueDirection(o),goalSide=o.keeperZ<o.ballZ-.018||o.keeperZ<=GOALIE_BACK_Z+.004;
    if(!goalSide) {
      const stagingX=clamp(o.ballX-side*.060,-GOALIE_SIDE_LIMIT,GOALIE_SIDE_LIMIT),lateralClear=Math.abs(o.keeperX-o.ballX)>.050;
      const trapped=Math.hypot(o.ballX-o.keeperX,o.ballZ-o.keeperZ)<.080;
      return {mode:'rescue',targetX:stagingX,targetZ:lateralClear?clamp(o.ballZ-.035,GOALIE_BACK_Z,GOALIE_HOME_Z-.010):clamp(o.keeperZ+.036,GOALIE_BACK_Z,GOALIE_FRONT_Z),urgency:.92,reach:clamp((o.ballX-o.keeperX)*.16,-.014,.014),jumpSpeed:0,clearance:trapped?1:0};
    }
    return {mode:'clear',targetX:clamp(o.ballX-side*.006,-GOALIE_SIDE_LIMIT,GOALIE_SIDE_LIMIT),targetZ:clamp(o.ballZ+.095,GOALIE_HOME_Z,GOALIE_FRONT_Z),urgency:.82,reach:clamp((o.ballX-o.keeperX)*.14,-.012,.012),jumpSpeed:0,clearance:1};
  }

  private interceptDecision(o:GoalieObservation):GoalieDecision|null {
    if(o.ballVZ>=-.10||o.ballZ<=GOALIE_HOME_Z-.015)return null;
    const time=(GOALIE_HOME_Z-o.ballZ)/o.ballVZ;
    if(time<=0||time>=1.65)return null;
    const intercept=this.foldBoardX(o.ballX+o.ballVX*time),height=o.ballY+o.ballVY*time-.5*PHYS.gravity*time*time;
    if(Math.abs(intercept)>GOAL.width/2+.055||height>FIELD.y+GOAL.height+.075)return null;
    const urgency=1-clamp((time-.11)/1.18,0,1);
    const uncertainty=(.0055+.0145*(1-urgency))*(1+clamp(Math.abs(o.ballVX)*.18,0,.22));
    const error=uncertainty*(.72*Math.sin(o.elapsed*4.31+o.score*1.7)+.28*Math.sin(o.elapsed*9.13+1.4));
    const targetX=clamp(intercept+error,-GOAL.width/2+.016,GOAL.width/2-.016);
    const lateral=Math.abs(targetX)/GOAL.width*2;
    const cut=clamp((time-.30)/.95,0,1)*.030*(1-.32*clamp(lateral,0,1));
    const targetZ=GOALIE_HOME_Z+cut;
    const highSave=height>FIELD.y+.071&&height<FIELD.y+.245&&Math.abs(intercept-o.keeperX)<.15;
    const wideEmergency=time<.25&&Math.abs(intercept-o.keeperX)>.073&&Math.abs(intercept-o.keeperX)<.20&&height<FIELD.y+.135;
    let jumpSpeed=0;
    if(this.jumpCooldown<=0&&(highSave||wideEmergency)) {
      jumpSpeed=highSave?clamp((height-FIELD.y-.052)/Math.max(.12,time)+PHYS.gravity*time*.5,.30,.66):.25;
      this.jumpCooldown=highSave?.92:.68;
    }
    return {mode:'intercept',targetX,targetZ,urgency,reach:urgency*clamp((targetX-o.keeperX)*.18,-.016,.016),jumpSpeed,clearance:.34+.24*urgency};
  }

  private challengeDecision(o:GoalieObservation):GoalieDecision|null {
    const speed=Math.hypot(o.ballVX,o.ballVZ),dx=o.ballX-o.keeperX,dz=o.ballZ-o.keeperZ;
    if(o.ballZ> -1.02||o.ballZ<GOALIE_BACK_Z-.015||o.ballY>FIELD.y+.095||Math.abs(o.ballX)>GOAL.width/2+.09||speed>.68||Math.hypot(dx,dz)>.24)return null;
    const side=Math.sign(o.ballX||o.keeperX),goalSide=o.keeperZ<o.ballZ-.024;
    if(goalSide) {
      return {mode:'challenge',targetX:clamp(o.ballX-side*.006,-GOALIE_SIDE_LIMIT,GOALIE_SIDE_LIMIT),targetZ:clamp(o.ballZ+.060,GOALIE_HOME_Z,GOALIE_FRONT_Z),urgency:.56,reach:clamp(dx*.12,-.010,.010),jumpSpeed:0,clearance:.82};
    }
    return {mode:'challenge',targetX:clamp(o.ballX-side*.010,-GOALIE_SIDE_LIMIT,GOALIE_SIDE_LIMIT),targetZ:clamp(o.ballZ-.042,GOALIE_BACK_Z,GOALIE_HOME_Z),urgency:.52,reach:clamp(dx*.11,-.009,.009),jumpSpeed:0,clearance:.58};
  }

  private setDecision(o:GoalieObservation):GoalieDecision {
    const distanceFromGoal=Math.max(.16,o.ballZ-GOAL.z),near=1-clamp((distanceFromGoal-.30)/1.40,0,1);
    const lateralPenalty=.45*clamp(Math.abs(o.ballX)/.85,0,1),targetZ=GOALIE_HOME_Z+.045*near*(1-lateralPenalty);
    const anticipatedX=o.ballX+clamp(o.ballVX*.10,-.055,.055),lineFraction=clamp((targetZ-GOAL.z)/distanceFromGoal,.05,.55);
    return {mode:'set',targetX:clamp(anticipatedX*lineFraction,-.145,.145),targetZ,urgency:.12+.23*near,reach:0,jumpSpeed:0,clearance:0};
  }

  private rescueDirection(o:GoalieObservation) {
    if(this.decision.mode!=='rescue')this.rescueSide=Math.sign(o.ballX)||(Math.sin(o.elapsed*3.7+o.score*.83)>=0?1:-1);
    return this.rescueSide;
  }

  private foldBoardX(x:number) {
    const half=FIELD.width/2-BALL.radius,width=2*half,shifted=x+half,phase=((shifted%(2*width))+2*width)%(2*width);
    return (phase<=width?phase:2*width-phase)-half;
  }
}
