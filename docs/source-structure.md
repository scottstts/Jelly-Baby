# Source structure

The source tree is organized around ownership. The application wires systems
together, shared infrastructure stays reusable, and a world owns the layouts,
scenery, and facilities that only make sense inside that world.

```text
src/
├── app/                         Application orchestration and presentation input
├── facilities/                  Shared facility contract, collision, sound, shadows, portals
├── graphics/
│   ├── character/               Jelly body, face, expression, and flavor rendering
│   ├── optics/                  Refractive light field and worker transport
│   ├── scene/                   Renderer, environment, table, compositing, warmup
│   └── shared/                  Manufactured geometry, toy parts, shared materials
├── physics/                     Soft-body model, kernels, surface deformation, grabs
├── worlds/
│   ├── main/facilities/         Playroom facilities: bed, swing, trampoline, wearables
│   ├── toy-track/               Track layout, road/scenery, and tricycle facility
│   └── travel.ts                World roots, managers, loading, and portal travel
└── main.ts                      Browser shell entry point
```

## Adding a world

Create a directory under `src/worlds/<world-name>/`. Keep its authored layout,
scenery, and world-specific facilities there. A facility that belongs only to
that world should use a feature folder with the same three-part shape:

```text
src/worlds/<world-name>/facilities/<facility-name>/
├── facility.ts    Facility-manager contract and lifecycle
├── physics.ts     Fixed-step behavior and body coupling
└── graphics.ts    Visible geometry, materials, and collision boxes
```

Small supporting modules can sit beside those files, as the bed and tricycle
features do for blankets, road contacts, camera behavior, and sound. Layout
constants belong in the world folder so portals, scenery, and physics share one
source of truth.

Register shared facilities through `src/facilities/manager.ts`; do not create a
second prompt or interaction router in a world. Use the existing collision,
shadow, and facility-sound modules from `src/facilities/` instead of duplicating
their plumbing. World travel owns one scene root and one manager per world, so
an inactive world can be hidden and disabled without changing the shared baby,
renderer, optical transport, or application loop.

## Shared versus world-owned code

Code belongs in a shared area only when more than one world or feature uses the
same behavior. The body solver and its kernels stay in `src/physics`; character
and scene rendering stay in `src/graphics`; and facility selection, collision,
shadows, sound, and portal implementation stay in `src/facilities`. The
`src/app` directory should remain orchestration and user-facing coordination,
not a new home for facility or world logic.
