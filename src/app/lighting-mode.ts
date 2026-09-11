import * as THREE from 'three/webgpu';
import { loadEnvironment } from '../graphics/scene/environment.ts';

type Environment=Awaited<ReturnType<typeof loadEnvironment>>;

/** Owns the optional night environment and commits each lighting change together. */
export class LightingMode {
  private readonly button=document.querySelector<HTMLButtonElement>('#lighting-mode')!;
  private readonly abort=new AbortController();
  private night:Environment|undefined;
  private isNight=false;
  private disposed=false;

  constructor(renderer:THREE.WebGPURenderer,scene:THREE.Scene,day:Environment,apply:(light:Environment)=>void,fail:(error:unknown)=>void) {
    const background=(scene.background as THREE.Color).clone();
    const fog=(scene.fog as THREE.Fog).color.clone();
    this.button.addEventListener('click',event=>{
      if(this.button.disabled||this.disposed)return;
      this.button.disabled=true;this.button.setAttribute('aria-busy','true');
      if((event as MouseEvent).detail>0)this.button.blur();
      const switchMode=async()=>{
        if(!this.isNight&&!this.night) {
          const night=await loadEnvironment(renderer,scene,true);
          if(this.disposed){night.dispose();return;}
          this.night=night;
        }
        if(this.disposed)return;
        const next=!this.isNight,light=next?this.night!:day;
        light.apply();apply(light);
        (scene.background as THREE.Color).copy(next?new THREE.Color('#171c2a'):background);
        (scene.fog as THREE.Fog).color.copy(next?new THREE.Color('#171c2a'):fog);
        this.isNight=next;
        document.documentElement.classList.toggle('night-mode',next);
        this.button.setAttribute('aria-pressed',String(next));
        this.button.setAttribute('aria-label',next?'Switch to day mode':'Switch to night mode');
        this.button.title=next?'Switch to day mode':'Switch to night mode';
      };
      void switchMode().catch(fail).finally(()=>{
        this.button.disabled=this.disposed;this.button.removeAttribute('aria-busy');
      });
    },{signal:this.abort.signal});
  }

  dispose() {
    this.disposed=true;this.abort.abort();this.button.disabled=true;
    this.night?.dispose();document.documentElement.classList.remove('night-mode');
  }
}
