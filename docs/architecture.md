# Architecture and runtime

Jelly Baby is a small real-time system with a strict separation between the
simulation, the visible surface, the optical calculations, and the presentation
shell. The browser runs one WebGPU renderer and one fixed-rate gameplay loop;
the only worker is the asynchronous optical-transport worker.

## Module boundaries

`WorldTravel` selects the playroom or toy-road root and its facility manager.
Travel reuses the renderer and baby, pauses the fixed-step loop behind the
loading overlay, and warms the destination before resuming. See
[Portal worlds](portal-worlds.md) for lifecycle and shadow ownership.

| Area | Primary modules | Responsibility |
| --- | --- | --- |
| Browser shell | `src/main.ts`, `src/style.css`, `index.html` | Create the loading/error UI, expose controls, load the runtime, and style the page. |
| Runtime orchestration | `src/app/runtime.ts` | Construct subsystems, connect callbacks, perform warmup, run the frame order, and dispose resources. |
| Physics | `src/physics/*`, `src/app/fixed-step.ts`, `src/app/locomotion.ts` | Advance the soft body, contact, grabbing, posture, jumping, and fixed-rate time. |
| Character rendering | `src/graphics/character/*` | Render the body, attach the face to the deformed skin, animate expression, and define jelly flavors. |
| Scene rendering | `src/graphics/scene/*` | Configure WebGPU, load and edit the HDR lighting, draw the table, and apply the final image pipeline. |
| Light transport | `src/graphics/optics/*` | Produce the GPU caustic field and asynchronous thickness/shadow fields. |
| Shared facility plumbing | `src/facilities/*` | Provide the facility contract, selection, collision, shadows, sound, and portal implementation. |
| World-owned features | `src/worlds/main/*`, `src/worlds/toy-track/*` | Keep each world's layouts, scenery, and facility implementations together. |
| Input and sound | `src/app/input.ts`, `src/app/sound.ts`, `src/app/flavor-picker.ts` | Translate pointer, keyboard, and touch input into simulation commands and connect presentation audio. |

The source tree is organized by ownership rather than by one flat list of
subsystems: application wiring lives in `app`, reusable facility infrastructure
lives in `facilities`, shared body simulation remains in `physics`, and each
world owns its layouts, scenery, and world-specific facilities under `worlds`.
The detailed directory map and extension guidance live in
[Source structure](source-structure.md).

The runtime is intentionally not a second home for subsystem logic. It wires
objects together and owns their lifetime; behavior belongs beside the data it
operates on.

## Startup sequence

`src/main.ts` writes the static interface immediately. It then dynamically
imports the runtime and passes two callbacks into `startGame`: a stage reporter
for the loading message and a terminal failure handler. Window-level `error`
and `unhandledrejection` listeners feed the same handler, so a failure outside a
local `try` block still reaches the visible error card.

`startGame` performs the following work in order:

1. Create and initialize the WebGPU renderer.
2. Append its canvas to `#viewport` and construct `JellySound` early so the
   first user gesture can unlock Web Audio while the rest of the scene loads.
3. Create the scene, camera, environment, soft body, baby, optical field, table,
   composite pipeline, locomotion rig, facility manager, flavor picker, input,
   and optical worker.
4. Attach reset, sound, facility, resize, and failure callbacks.
5. Settle the body for 80 fixed steps before showing the first frame. This lets
   contact and posture establish without exposing the startup pose.
6. Update the surface, then warm every built-in native facility collision path
   and both bed blanket collision paths using non-mutating scratch work. This
   moves lazy native allocations and cold execution into the loading screen.
7. Update the face, facility shadow field, caustics, and worker-backed
   transport; precompile the entire main scene with visibility and frustum
   rejection temporarily disabled, then restore those flags. This is required
   because Three r185's `compileAsync(scene, camera)` gathers candidates through
   the normal camera projection path, while the startup camera does not see the
   rear bed/dressing-table area. Render once and wait for
   `queue.onSubmittedWorkDone()` before declaring startup complete.
8. Start the renderer animation loop and hide the loading card.

The first-frame fence matters: compilation or submission errors must not be
mistaken for a successful boot merely because a canvas exists.

## Per-frame order

The animation callback clamps wall-clock `dt` to 50 ms. A hidden tab resets the
fixed-step accumulator and does not simulate or render a stale frame. For a
visible frame, the order is:

1. `FixedStepper.advance` runs up to 12 substeps at `PHYS.step` (240 Hz).
2. Each substep processes `Input.step`, every facility's `step`, and either the
   active facility or normal `Locomotion.step`.
3. `SoftBody.step` solves the body. `Facilities.afterStep` handles post-solver
   facility collisions, then `Input.afterPhysicsStep` consumes released grab
   samples. Normal locomotion receives its `afterStep` contact callbacks when a
   facility does not own the body.
4. If the body became dirty, the runtime checks finiteness and updates the
   full-resolution surface.
5. Facility meshes, facial expression, and the cached facility shadow field are
   updated.
6. Input updates camera follow and orbit state; sound updates its listener;
   optical transport follows the last traced body position; and the optical
   field/table coordinates are refreshed.
7. The worker is offered a transport update if its single-request and 30 Hz
   limits allow it, then the composite pipeline renders the frame.

This ordering is deliberate. Physics must see input before it runs, picking and
face attachment must see the same surface that rendering sees, and the optical
field must receive the post-physics body rather than a one-frame-old pose.

## Reset and lifetime

Reset is initiated from the reset button only:

- stop facility voices and reset both facility simulations;
- clear pointers and recenter the locomotion rig;
- restore the soft body and face expression;
- reset the fixed-step accumulator.

The normal disposal path stops the animation loop, removes input listeners,
terminates the transport worker, disconnects the resize observer, disposes the
facility manager, shadow field, flavor picker, composite pipeline, character,
table, environment, optical targets, and renderer. `pagehide` triggers disposal
unless the page is being persisted, and Vite HMR uses the same cleanup path.

Fatal startup or runtime errors stop rendering and expose the existing loading
card as a diagnostic panel. The panel includes the current stage, the viewport,
DPR, user agent, and the error message; it also offers a full-page retry.

## Camera and viewport policy

`OrbitControls` orbits around the mass center, cannot pan, damps rotation, and
keeps the distance in the range `.135`–`.42` metres during ordinary play. A
grab freezes both orbit and body-follow movement. Facilities can raise the
minimum camera distance while active.

`resizeView` is called through a `ResizeObserver` whose events are coalesced to
one animation frame. It uses the project-wide drawing-buffer policy:

- maximum of 4,000,000 physical pixels;
- DPR capped at 1.7 and reduced below 1 when the CSS viewport itself exceeds the
  pixel budget;
- one `setDrawingBufferSize` call per resize;
- transient zero-sized viewports ignored.

The camera uses a narrow tabletop framing, an adjusted field of view, a small
vertical view offset on mobile, and a polar-angle limit that keeps the horizon
out of frame.

## Cross-system invariants

Several decisions are architectural rather than local implementation details:

- WebGPU is mandatory. Renderer initialization failures are visible and there
  is no WebGL fallback or silent quality downgrade.
- The full visible surface is the shared source of truth for display, picking,
  face placement, and the transmission material. The optical proxy is an
  explicitly bounded exception for light transport only.
- Physics uses fixed SI-unit steps and does not slow time to recover from a
  render hitch. Catch-up is capped instead of becoming an unbounded spiral.
- Facilities own the body only while active. Inactive set pieces can continue
  their own small simulations, such as an empty swing coasting.
- Geometry, physics, and orchestration remain separate. A world-owned facility
  should keep its `facility.ts`, `physics.ts`, and `graphics.ts` modules
  together, while shared facility concerns stay in `src/facilities`.
- GPU device loss, renderer errors, worker errors, and invalid simulation state
  all use the same fatal UI path.
