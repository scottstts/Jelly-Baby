/** Small, interruptible performance layered over the original resting smile. */
export class FaceExpression {
  sleep=0;
  blink=0;
  sob=0;
  laugh=0;
  time=0;
  private held=false;
  private heldFor=0;
  private releaseFor=10;
  private blinkAt=2.4;
  private blinkFor=-1;
  private doubleBlink=false;
  reset() {
    this.sleep=0;this.blink=0;this.sob=0;this.laugh=0;this.time=0;
    this.held=false;this.heldFor=0;this.releaseFor=10;
    this.blinkAt=2.4;this.blinkFor=-1;this.doubleBlink=false;
  }
  update(dt:number,grabbed:boolean,playing=false,sleeping=false,crying=false) {
    dt=Math.min(.05,Math.max(0,dt));this.time+=dt;
    this.sleep+=((sleeping?1:0)-this.sleep)*(1-Math.exp(-dt*(sleeping?3:7)));
    if(this.sleep<.0001)this.sleep=0;
    if(this.held&&!grabbed&&this.heldFor>.12)this.releaseFor=0;
    this.heldFor=grabbed?this.heldFor+dt:0;this.held=grabbed;
    this.releaseFor+=dt;
    this.sob+=((grabbed?1:0)-this.sob)*(1-Math.exp(-dt*(grabbed?10:7)));
    if(crying){this.sob=1;this.laugh=0;this.releaseFor=10;}
    // A little breath after release, then buoyant chuckles, then home.
    const laughTarget=sleeping||crying?0:playing?1:!grabbed&&this.releaseFor>.22&&this.releaseFor<1.65
      ?Math.sin(Math.PI*(this.releaseFor-.22)/1.43):0;
    this.laugh+=(laughTarget-this.laugh)*(1-Math.exp(-12*dt));
    if(this.sob<.0001)this.sob=0;if(this.laugh<.0001)this.laugh=0;
    this.blinkAt-=dt;
    if(this.blinkAt<=0&&this.blinkFor<0) {
      this.blinkFor=0;
      this.blinkAt=this.doubleBlink?2.8+Math.random()*2.8:Math.random()<.22?.32:2.8+Math.random()*2.8;
      this.doubleBlink=this.blinkAt===.32;
    }
    if(this.blinkFor>=0) {
      this.blinkFor+=dt;
      const t=this.blinkFor;
      this.blink=t<.065?Math.sin(t/.065*Math.PI/2):t<.095?1:Math.max(0,Math.cos((t-.095)/.12*Math.PI/2));
      if(t>=.215){this.blinkFor=-1;this.blink=0;}
    }
  }
}
