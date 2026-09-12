import assert from 'node:assert/strict';
import { DestinationMenu, DESTINATIONS } from '../src/worlds/destination-menu.ts';

globalThis.window=new globalThis.EventTarget();
const element=()=>{const el=new globalThis.EventTarget();el.children=[];el.append=(...nodes)=>el.children.push(...nodes);el.setAttribute=()=>{};el.remove=()=>{};el.focus=()=>{globalThis.document.activeElement=el;};el.click=()=>el.dispatchEvent(new globalThis.Event('click'));el.showModal=()=>{el.open=true;};el.close=()=>{el.open=false;};return el;};
const app=element();globalThis.document={createElement:element,querySelector:()=>app,activeElement:null};
let selected,closed=0;const menu=new DestinationMenu(id=>{selected=id;},()=>closed++);
assert.deepEqual(DESTINATIONS.map(d=>d.label),['Home','Play Tricycle','Play Soccer']);
const key=(code)=>{const event=new globalThis.Event('keydown',{cancelable:true});event.code=code;globalThis.window.dispatchEvent(event);assert(event.defaultPrevented);};
menu.show('home');assert(menu.opened);key('Enter');assert.equal(selected,'home','current world is selected by default');assert(!menu.opened);
menu.show('home');key('ArrowDown');key('Enter');assert.equal(selected,'toys');
menu.show('soccer');key('ArrowDown');key('Enter');assert.equal(selected,'home','arrow navigation wraps');
menu.show('toys');menu.element.children.find(b=>b.textContent==='Home').click();assert.equal(selected,'home','mouse/touch selection');
menu.show('home');menu.element.children.find(b=>b.textContent==='Stay here').click();assert.equal(closed,1);assert(!menu.opened);
menu.show('home');menu.element.dispatchEvent(new globalThis.Event('cancel'));assert.equal(closed,2);assert(!menu.opened);
menu.dispose();console.log('Destination labels, modal key capture, arrow/Enter, mouse/touch selection, cancellation and teardown passed.');
