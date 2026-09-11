import assert from 'node:assert/strict';
import { warmMainScenePipelines } from '../src/graphics/scene/render-warmup.ts';

function tree() {
  const root={visible:true,frustumCulled:true,children:[]};
  const offscreen={visible:true,frustumCulled:true,children:[]};
  const hidden={visible:false,frustumCulled:false,children:[]};
  const plain={children:[]};
  root.children.push(offscreen,hidden,plain);
  const all=[root,offscreen,hidden,plain];
  return {
    root,offscreen,hidden,plain,all,
    scene:{
      visible:true,frustumCulled:true,children:[root],
      traverse(callback){
        const visit=object=>{callback(object);for(const child of object.children??[])visit(child);};
        visit(this);
      },
    },
  };
}

{
  const fixture=tree();let calls=0;
  const renderer={async compileAsync(scene){
    calls++;
    scene.traverse(object=>{
      if(typeof object.visible==='boolean')assert.equal(object.visible,true,'warmup exposes hidden objects to compilation');
      if(typeof object.frustumCulled==='boolean')assert.equal(object.frustumCulled,false,'warmup disables camera-frustum rejection');
    });
  }};
  await warmMainScenePipelines(renderer,fixture.scene,{});
  assert.equal(calls,1);
  assert.equal(fixture.scene.visible,true);assert.equal(fixture.scene.frustumCulled,true);
  assert.equal(fixture.root.visible,true);assert.equal(fixture.root.frustumCulled,true);
  assert.equal(fixture.offscreen.visible,true);assert.equal(fixture.offscreen.frustumCulled,true);
  assert.equal(fixture.hidden.visible,false);assert.equal(fixture.hidden.frustumCulled,false);
  assert.equal('visible' in fixture.plain,false);assert.equal('frustumCulled' in fixture.plain,false);
}

{
  const fixture=tree();
  const renderer={async compileAsync(){throw new Error('synthetic compile failure');}};
  await assert.rejects(()=>warmMainScenePipelines(renderer,fixture.scene,{}),/synthetic compile failure/);
  assert.equal(fixture.hidden.visible,false,'visibility restores after compile failure');
  assert.equal(fixture.offscreen.frustumCulled,true,'culling restores after compile failure');
}

console.log('PASS: scene pipeline warmup bypasses startup visibility/frustum rejection and restores all flags');
