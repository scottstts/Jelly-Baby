type WarmupObject={
  visible?:boolean;
  frustumCulled?:boolean;
};

type TraversableScene={
  traverse(callback:(object:WarmupObject)=>void):void;
};

type AsyncSceneCompiler<Scene,Camera>={
  compileAsync(scene:Scene,camera:Camera):Promise<unknown>;
};

type ObjectState={
  object:WarmupObject;
  visible:boolean|undefined;
  frustumCulled:boolean|undefined;
};

export type PipelineWarmupOptions={
  /** Hidden scene roots whose already-warmed descendants should stay excluded. */
  preserveVisibility?:ReadonlySet<WarmupObject>;
};

/**
 * Compile every renderable reachable from the main scene, including objects
 * outside the startup camera and objects that begin hidden. Three r185 builds
 * compile candidates through the ordinary visibility/frustum projection path,
 * so a single compileAsync(scene, startupCamera) can otherwise leave pipelines
 * cold until the player first looks at another part of the room.
 *
 * All object flags are restored before returning; this changes startup work
 * only, never gameplay visibility or culling. Callers may preserve the hidden
 * state of already-warmed world roots while still compiling through the main
 * scene so environment/fog/material context remains identical to gameplay.
 */
export async function warmMainScenePipelines<Scene extends TraversableScene,Camera>(
  renderer:AsyncSceneCompiler<Scene,Camera>,scene:Scene,camera:Camera,options:PipelineWarmupOptions={},
) {
  const states:ObjectState[]=[];
  scene.traverse(object=>{
    const visible=typeof object.visible==='boolean'?object.visible:undefined;
    const frustumCulled=typeof object.frustumCulled==='boolean'?object.frustumCulled:undefined;
    if(visible===undefined&&frustumCulled===undefined)return;
    states.push({object,visible,frustumCulled});
    if(visible!==undefined&&!options.preserveVisibility?.has(object))object.visible=true;
    if(frustumCulled!==undefined)object.frustumCulled=false;
  });
  try {
    await renderer.compileAsync(scene,camera);
  } finally {
    for(let i=states.length-1;i>=0;i--){
      const {object,visible,frustumCulled}=states[i];
      if(visible!==undefined)object.visible=visible;
      if(frustumCulled!==undefined)object.frustumCulled=frustumCulled;
    }
  }
}
