import { DEFAULT_JELLY_FLAVOR, JELLY_FLAVORS, type JellyFlavorName } from '../graphics/character/jelly-flavors.ts';

export function flavorPickerMarkup() {
  const options=Object.entries(JELLY_FLAVORS).map(([name,flavor])=>`
    <button class="flavor-option" type="button" data-flavor="${name}" aria-pressed="${name===DEFAULT_JELLY_FLAVOR}" style="--flavor-color:${flavor.surface}">
      <span class="flavor-option-swatch" aria-hidden="true"></span><span>${name}</span>
    </button>`).join('');
  return `<div id="flavor-picker" class="flavor-picker">
    <button id="flavor" class="icon-button flavor-picker-button" type="button" aria-label="Choose jelly flavor (currently ${DEFAULT_JELLY_FLAVOR})" aria-haspopup="true" aria-expanded="false" aria-controls="flavor-menu" title="Jelly flavor: ${DEFAULT_JELLY_FLAVOR}">
      <svg class="palette-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 3C6.48 3 2 6.92 2 11.75C2 16.58 6.48 20.5 12 20.5H13.4C14.6 20.5 15.35 19.2 14.75 18.16C14.24 17.28 14.88 16.18 15.9 16.18H17.2C19.85 16.18 22 14.03 22 11.38C22 6.75 17.52 3 12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="7.2" cy="10.2" r="1.25" fill="#FF5A5F"/>
        <circle cx="9.8" cy="6.8" r="1.25" fill="#FFB400"/>
        <circle cx="14.2" cy="6.7" r="1.25" fill="#34C759"/>
        <circle cx="17.2" cy="9.8" r="1.25" fill="#5B8CFF"/>
      </svg>
    </button>
    <div id="flavor-menu" class="flavor-menu" role="group" aria-label="Jelly flavor choices" hidden>${options}
    </div>
  </div>`;
}

type FlavorSelectionHandler=(flavor:JellyFlavorName)=>void;

function isJellyFlavorName(value:string|undefined):value is JellyFlavorName {
  return value!==undefined&&Object.prototype.hasOwnProperty.call(JELLY_FLAVORS,value);
}

export class FlavorPicker {
  private readonly root:HTMLDivElement;
  private readonly button:HTMLButtonElement;
  private readonly menu:HTMLDivElement;
  private readonly options:NodeListOf<HTMLButtonElement>;
  private readonly onSelect:FlavorSelectionHandler;
  private readonly abort=new AbortController();

  constructor(onSelect:FlavorSelectionHandler) {
    this.root=document.querySelector<HTMLDivElement>('#flavor-picker')!;
    this.button=this.root.querySelector<HTMLButtonElement>('#flavor')!;
    this.menu=this.root.querySelector<HTMLDivElement>('#flavor-menu')!;
    this.options=this.root.querySelectorAll<HTMLButtonElement>('[data-flavor]');
    this.onSelect=onSelect;
    const {signal}=this.abort;
    this.button.addEventListener('click',this.toggle,{signal});
    this.options.forEach(option=>option.addEventListener('click',this.choose,{signal}));
    document.addEventListener('pointerdown',this.closeWhenOutside,{signal});
    document.addEventListener('keydown',this.handleKeyDown,{signal});
    this.setSelected(DEFAULT_JELLY_FLAVOR);
  }

  private toggle=(event:MouseEvent)=>{
    if(this.menu.hidden)this.open(event.detail===0);
    else this.close();
  };

  private open(focusOption:boolean) {
    this.menu.hidden=false;this.button.setAttribute('aria-expanded','true');
    if(focusOption)this.options[this.selectedIndex()]?.focus({preventScroll:true});
  }

  private close=()=>{
    this.menu.hidden=true;this.button.setAttribute('aria-expanded','false');
  };

  private closeWhenOutside=(event:PointerEvent)=>{
    const target=event.target;
    if(!(target instanceof Node)||!this.root.contains(target))this.close();
  };

  private handleKeyDown=(event:KeyboardEvent)=>{
    if(event.key==='Escape'&&!this.menu.hidden) {
      event.preventDefault();this.close();this.button.focus({preventScroll:true});
    }
  };

  private selectedIndex() {
    return [...this.options].findIndex(option=>option.getAttribute('aria-pressed')==='true');
  }

  private choose=(event:MouseEvent)=>{
    const name=(event.currentTarget as HTMLButtonElement).dataset.flavor;
    if(!isJellyFlavorName(name))return;
    this.setSelected(name);this.close();
    (event.currentTarget as HTMLButtonElement).blur();
    this.onSelect(name);
  };

  private setSelected(name:JellyFlavorName) {
    this.button.title=`Jelly flavor: ${name}`;
    this.button.setAttribute('aria-label',`Choose jelly flavor (currently ${name})`);
    this.options.forEach(option=>option.setAttribute('aria-pressed',String(option.dataset.flavor===name)));
  }

  dispose() {this.abort.abort();this.close();}
}
