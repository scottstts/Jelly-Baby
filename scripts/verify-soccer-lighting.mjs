import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Mesh, MeshPhysicalNodeMaterial, Vector3 } from 'three/webgpu';
import { FacilityShadows } from '../src/facilities/shadows.ts';
import { SoccerStadium } from '../src/worlds/soccer/stadium.ts';
import { SOCCER_ENVELOPE } from '../src/worlds/soccer/layout.ts';

const received=new Set(),shadows=new FacilityShadows(new Vector3(-.55,-.76,.35).normalize(),.7,{register(mesh){received.add(mesh);}});
const home=new Group();home.add(new Mesh(new BoxGeometry(.2,.1,.2),new MeshPhysicalNodeMaterial()));
shadows.add(home,new Box3(new Vector3(-.35,0,-.35),new Vector3(.35,.2,.45)));
const renderer={autoClear:true,target:null,getRenderTarget(){return this.target;},setRenderTarget(target){this.target=target;},render(){}};
shadows.update(renderer);const reference=shadows.spanNode.value.clone(),width=shadows.target.width,height=shadows.target.height;
const stadium=new SoccerStadium();stadium.group.visible=false;shadows.add(stadium.group,SOCCER_ENVELOPE);home.visible=false;stadium.group.visible=true;shadows.update(renderer);
const densityX=shadows.target.width/shadows.spanNode.value.x,densityY=shadows.target.height/shadows.spanNode.value.y;
assert(densityX>=width/reference.x&&densityX<width/reference.x+1);assert(densityY>=height/reference.y&&densityY<height/reference.y+1);
stadium.group.traverse(mesh=>{if(mesh.isMesh)assert(mesh.castShadow&&mesh.receiveShadow&&mesh.receiveCaustics&&received.has(mesh),'every new stadium mesh participates in shared lighting');});
stadium.group.visible=false;home.visible=true;shadows.update(renderer);assert.equal(shadows.target.width,width);assert.equal(shadows.target.height,height);
console.log('Soccer shadow density matches Home; all surfaces cast/receive shadows and receive caustics; returning restores Home targets.',{densityX,densityY});
shadows.dispose();stadium.dispose();home.children[0].geometry.dispose();home.children[0].material.dispose();
