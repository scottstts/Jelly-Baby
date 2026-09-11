import type { Object3DEventMap } from 'three/src/core/Object3D.js';

declare module 'three/src/core/Object3D.js' {
  // The generic parameter must match Three's declaration for interface merging.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Object3D<TEventMap extends Object3DEventMap = Object3DEventMap> {
    /** Opt this object into the game's shared projected jelly-caustic receiver pass. */
    receiveCaustics?:boolean;
  }
}
