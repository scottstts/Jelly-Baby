export const DESTINATIONS=[{id:'home',label:'Home'},{id:'toys',label:'Play Tricycle'},{id:'soccer',label:'Play Soccer'}] as const;
export type WorldId=typeof DESTINATIONS[number]['id'];

/** A modal input boundary: arrow navigation never leaks into locomotion. */
export class DestinationMenu {
  readonly element=document.createElement('dialog');
  private readonly abort=new AbortController();
  private readonly buttons:HTMLButtonElement[]=[];
  private previousFocus:HTMLElement|null=null;
  private selected=0;
  opened=false;
  constructor(select:(id:WorldId)=>void,close:()=>void) {
    const dialog=this.element,signal=this.abort.signal;
    dialog.className='destination-menu';dialog.setAttribute('aria-label','Travel to a world');
    const title=document.createElement('h2');title.textContent='Where shall we play?';dialog.append(title);
    for(const destination of DESTINATIONS) {
      const button=document.createElement('button');button.type='button';button.textContent=destination.label;
      button.addEventListener('click',()=>{this.hide();select(destination.id);},{signal});
      this.buttons.push(button);dialog.append(button);
    }
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Stay here';cancel.className='destination-cancel';
    cancel.addEventListener('click',()=>{this.hide();close();},{signal});dialog.append(cancel);
    dialog.addEventListener('cancel',()=>{this.hide();close();},{signal});
    window.addEventListener('keydown',event=>{
      if(!this.opened)return;
      if(['ArrowDown','ArrowRight','ArrowUp','ArrowLeft','Enter','Space','KeyE'].includes(event.code)) {
        event.preventDefault();event.stopImmediatePropagation();
        const direction=event.code==='ArrowDown'||event.code==='ArrowRight'?1:event.code==='ArrowUp'||event.code==='ArrowLeft'?-1:0;
        if(direction){this.selected=(this.selected+direction+this.buttons.length)%this.buttons.length;this.buttons[this.selected].focus();}
        if(event.code==='Enter'&&!event.repeat){const focused=document.activeElement; if(focused===cancel)cancel.click();else (this.buttons.find(b=>b===focused)??this.buttons[this.selected]).click();}
      }
    },{capture:true,signal});
    document.querySelector('#app')!.append(dialog);
  }
  show(current:WorldId) {
    this.opened=true;this.previousFocus=document.activeElement as HTMLElement|null;
    const currentIndex=DESTINATIONS.findIndex(d=>d.id===current);
    this.selected=currentIndex>=0?currentIndex:0;
    this.buttons.forEach((button,i)=>{button.setAttribute('aria-current',String(DESTINATIONS[i].id===current));});
    this.element.showModal();this.buttons[this.selected].focus();
  }
  hide(){if(!this.opened)return;this.opened=false;this.element.close();this.previousFocus?.focus();}
  dispose(){this.hide();this.abort.abort();this.element.remove();}
}
