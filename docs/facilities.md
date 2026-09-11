# Facilities

Facilities are small playable machines placed around the spawn point. They own
their own geometry and local physics, but they share interaction routing,
camera handoff, body ownership, reset, shadows, laughter state, and sound
events.

## Shared facility contract

[`src/facilities/manager.ts`](../src/facilities/manager.ts) defines the `Facility`
interface. Each implementation supplies:

- a unique `id` and short display `label`;
- `active`, optional `laughing`, optional `cameraDistance`, and an
  `interactionDistance` (`Infinity` means unavailable);
- `interact()` to board or leave;
- fixed-step `step(h)` and optional `afterStep()`;
- render-time `update()`;
- `reset()` and `dispose()`.

`Facilities` owns one DOM prompt and one touch button. It chooses the active
facility first; otherwise it sorts finite candidates by interaction distance.
The nearest available facility is therefore the only contextual affordance. An
active facility retains ownership even if another facility becomes closer.

Desktop `E` and the touch button call the same `interact` path. Key repeats are
ignored. On a successful transition the runtime clears ordinary input, resets
the locomotion rig, and unlocks audio. All facilities still receive fixed-step
updates, so an inactive swing can coast while another facility is active, but
only the active facility gets body-control ownership.

The manager defaults to `Play <label>` or `Get Off <label>`. Optional `action`
and `mobileAction` supply facility-specific verbs. The bed also supplies
`sleeping` for its facial expression. See [Bed and sleeping](bed-and-sleeping.md)
for placement, support, blanket, and expression design. The prompt hides when
there is no finite candidate. Reset clears every facility and hides the prompt;
dispose aborts the manager's listeners, removes the prompt, and disposes every
registered facility.

The portal housing uses the same contract with `action = 'Use Portal'` and
`mobileAction = 'Use Portal'`. Its interaction distance is finite only while
the baby is near the active portal and travel is available, so it participates
in nearest-candidate routing without adding a second prompt or key listener.
Its `afterStep()` resolves only the authored solid housing and fittings; the
membrane aperture remains open for the existing travel destination.

## Swing

### Geometry

[`src/worlds/main/facilities/swing/graphics.ts`](../src/worlds/main/facilities/swing/graphics.ts) builds a miniature joiner's
swing from rounded timber, sage seat pieces, brass pegs/rings, and paired rope
bridles. The seat is a three-slat assembly under a pivot group. The visual pivot
rotates around the X axis; the fixed frame stays in world space. The frame
exposes tight oriented collision boxes for its four angled beams, four foot
pads, two side rails, and top bar; the three moving seat slats and two underside
supports expose matching boxes that follow the pivot.

The visual material includes a small procedural TSL grain over the timber. All
geometry is disposed through the swing group rather than leaking shared
materials when the facility is removed.

### Pendulum and rider coupling

[`src/worlds/main/facilities/swing/physics.ts`](../src/worlds/main/facilities/swing/physics.ts) defines the swing in
metres:

| Quantity | Value |
| --- | ---: |
| World position | `x = -.155`, `z = -.035` |
| Pivot height | `.172` |
| Rope length | `.128` |
| Seat width | `.108` |
| Maximum angle | `.85` rad (about 49°) |
| Moving seat mass | `.026` kg |

The local machine is a damped nonlinear pendulum. While occupied, it gradually
raises its target amplitude over seven seconds, injects energy in phase with
the current motion, gives a short initial assist, and applies a conservative
energy ceiling at the turning points. It is a driven pendulum approximation,
not a rope solver or a full multibody constraint system.

Boarding is allowed only when the body is grounded, ungrabbed, and within `.145`
m of the swing. The body is placed into the current seat frame and receives the
corresponding tangential velocity. During the ride, each cage node is pulled
toward its seat-frame target with stiffness and damping that rise toward the
feet. The solver is still responsible for deformation, volume retention,
contact, and recoil; facility forces never replace particle positions with an
animation.

Dismounting moves the body to the clear approach side, undoes the seat frame,
places the lowest point just above the floor, and zeroes velocity. An inactive
swing continues to integrate its angle and speed and gradually loses energy.
When inactive and nearby, the facility resolves its frame boxes against the
deformed body surface and removes inward velocity so a walking body cannot
ghost through the structure.

The normal face blinks during the gentle initial ride. Once the swing crosses
15° during the current ride, `laughStarted` becomes true and laughter remains
active for the rest of that ride. Boarding an empty swing that is already
beyond 15° does not inherit laughter: the seat must first return inside the
normal-expression range and cross the threshold again. Reset and dismount
clear it.

## Head-wearable table

[`src/worlds/main/facilities/wearable/facility.ts`](../src/worlds/main/facilities/wearable/facility.ts) and
[`src/worlds/main/facilities/wearable/physics.ts`](../src/worlds/main/facilities/wearable/physics.ts) own the
dressing table's interaction state, while
[`src/worlds/main/facilities/wearable/graphics.ts`](../src/worlds/main/facilities/wearable/graphics.ts) owns the
table and the three reference-derived assets. The table is placed at
`(-.155, .305)` in the same lower-left authored quadrant as the supplied
layout drawing. Its tabletop, legs, and apron use the swing frame's shared
procedural timber material. All table and wearable meshes have both shadow
flags enabled and are registered with the same facility ground and raised
shadow systems.

The three equally spaced slots are Floral Crown, Top Hat, and Baseball Cap.
The asset constructors are kept in the graphics module with their geometry and
TSL material details ported from `refs/hat_assets.html`; only their uniform
root scales are tuned to the jelly's head. Five simple collision boxes cover the table: one thin tabletop slab and one fitted box per leg. The collision is broad-phase gated near the table and resolved against the deformed visible-surface bindings after the soft-body solver, so the prompt can appear before physical contact without letting the body pass through the asset.

When the body is grounded and ungrabbed within `.135 m` of an occupied slot, the nearest slot supplies `Wear <name>` when nothing is worn. If an item is already worn and the baby approaches another table item, the prompt instead supplies `Swap to <name>` and interaction returns the current item to its original slot before wearing the new one. A worn item is not an active facility, so ordinary movement and the camera remain available. If no swap target is nearby and the body leaves the table approach radius, the worn item supplies `Take off <name>`. Reset returns every item to the table.

The ordinary locomotion jump emits a dedicated `onJump` event after its Space
impulse. While a wearable is held, that event launches only the wearable's
relative one-dimensional hop: fixed-step gravity and an analytically chosen
initial velocity target a small `.0065 m` detachment above the live head basis, then settle it back onto the head. Facility boarding, trampoline bounces, grabs, and other motion never trigger this accessory hop. Going to bed automatically returns the currently worn item to its home slot on the table; getting up leaves it there.

## Trampoline

### Geometry

[`src/worlds/main/facilities/trampoline/graphics.ts`](../src/worlds/main/facilities/trampoline/graphics.ts) builds a padded
annular trampoline with a stitched cushion, thread rings, a dynamic fabric bed,
32 visible coil springs, three U-shaped tubular legs, collars, bolts, and six
molded rubber feet. The bed is a radial grid whose vertices carry a smooth
center-to-rim displacement weight. Its normals and bounds are recomputed when
the bed compression changes; the frame remains static.

### Support, bounce, and flight

[`src/worlds/main/facilities/trampoline/physics.ts`](../src/worlds/main/facilities/trampoline/physics.ts) defines:

| Quantity | Value |
| --- | ---: |
| World position | `x = .165`, `z = -.035` |
| Outer radius | `.10` |
| Mat radius | `.075` |
| Bed height | `.043` |
| Target bounce | `.105` m |
| Laugh threshold | `.035` m |

Boarding requires grounded, ungrabbed proximity within `.145` m. The body is
placed over the bed and the rest of its velocity is cleared. While active,
weighted lower nodes measure foot height and foot speed. If the feet are below
the bed, a unilateral spring force combines compression, damping, and a
bounded energy pump that gradually approaches the 10.5 cm target bounce.

The force is distributed through foot weights while horizontal and airborne
posture forces keep the body centered. The vertical posture term has zero net
force around the mass-weighted center, so once the feet leave the bed the body
flies under gravity and the soft-body solver handles its own deformation. The
unloaded bed follows a damped recoil mode rather than a cloth simulation.

The normal face becomes sustained laughter after the center rises 3.5 cm above
the bed. Leaving moves the body to the clear side of the trampoline, rests it
on the floor, and stores any remaining supported bed speed so the empty bed can
finish recoiling. When inactive, a cylinder-shaped keep-out boundary keeps a
walking body from entering the trampoline disk.

### Collision volumes

Facility collision is intentionally shape-specific. The `Box3` registered with
`FacilityShadows` is only a shadow/motion-envelope broad phase; it is never used
as the physical obstacle.

The inactive swing uses the tight oriented boxes exposed by its frame and moving
seat geometry. Moving seat boxes expose their instantaneous point velocity and a
finite rotational inertia, so contact impulses transfer momentum into the jelly
and slow the empty swing instead of letting its seat pass through the body.
The inactive trampoline uses a vertical cylinder with the trampoline's outer
radius and cushion height. Its radial side is a one-sided keep-out boundary, so
the jelly can route around it and can still clear it with a high enough jump.

The narrow phase evaluates about 2,500 spatially thinned points from the exact
deformed visible-surface bindings. Each point moves its four owning cage nodes
through the same inverse-mass weighting used by the soft-body contacts. This is
enough to keep the rendered surface clear of the simple facility volumes while
avoiding a full 72,234-vertex triangle collision scan every fixed step. Most
facility boxes use a small 2 mm contact margin to cover spacing between
anchors. The swing frame retains that margin, while its fitted moving seat
boxes use only a 0.1 mm fitting tolerance so the seat cannot retain contact
after the mesh has visually cleared.

Both facilities use a `.145 m` grounded approach radius, intentionally larger
than the physical contact region. The `Press E to ...` affordance therefore
appears before the player reaches the collision volume and remains usable when
the volume is doing its job.

## Facility shadow projection

[`src/facilities/shadows.ts`](../src/facilities/shadows.ts) gives
opaque facilities fixed-world shadows without adding transparent geometry to the
table. Each facility registers a world-space `Box3` that covers its entire
motion envelope. The constructor projects the bounds along the measured
downward window direction and builds a 512² orthographic target for the main
playroom footprint. If the active world is larger, the target grows in proportion
to its fitted footprint so its world-space texel density stays the same; returning
to the playroom restores the original target size.

Each descendant mesh is represented twice in the shadow scene:

- a red directional projection; and
- a green contact projection with height fade near the floor.

Both channels use max blending, so a cushion or bed cannot erase the legs and
feet beneath it. A target is rerendered only when a source matrix, visibility,
dynamic position-attribute version, or explicit dirty flag changes. This keeps
idle facility shadows stable and catches deformed trampoline fabric even when
its object transform is unchanged. The render target and renderer state are
restored after each update.

The table performs a deterministic 3×3 tent lookup of these channels. Its
world-to-UV transform accounts for the WebGPU row direction explicitly; there
is no camera-following shadow shimmer.

`FacilityShadows.add` also registers every descendant mesh with
[`SurfaceShadows`](../src/facilities/surface-shadows.ts) and marks it
`receiveCaustics = true` for the shared caustic receiver layer. Two 2048² single-channel depth maps
provide jelly-to-facility, facility self-shadowing, and facility-to-jelly
occlusion. They share the measured window direction and fixed facility motion
bounds with a 12 mm lateral margin and a 25 cm margin along the light depth
axis for nearby riders. Keeping the lateral bounds tight avoids spending most
of the texels on empty space. Facilities receive both maps;
the jelly receives only facilities. The maps share visible geometry, track
deformation and inherited visibility, and update only when their casters change.
Each tap compares against depth extrapolated along the rasterized receiver
plane, with a 0.2 mm bias converted to the fitted depth range. A single fixed
receiver depth is insufficient: neighbouring texels on a tilted beam then
incorrectly shadow the beam itself. The filter uses the ground shadow's exact
3×3 tent weights and 1.5-ground-texel spacing, transformed from world X/Z into
light UVs. Softness therefore stays consistent with the ground as depth-map
resolution changes. Each of the nine lookups interpolates four depth comparisons
so subtexel motion stays smooth. Depth itself is never linearly filtered across
unrelated surfaces.
This raised-shadow path leaves the caustic generator itself unchanged; caustic reception is injected separately through `CausticReceivers`.

Curved receivers may opt into an additional per-mesh receiver-depth map via
`curvedShadowReceiver`. The blanket uses this to sample its actual surface at
the wide filter taps instead of extending one triangle's plane across the
curved skirt. Center-depth separation preserves overlapping self-occlusion;
other receivers retain the existing plane-corrected path. See
[Bed and sleeping](bed-and-sleeping.md) for the contact and shading details.

## Facility sound hooks

Each facility owns a `FacilityMotionSound` instance and emits semantic events
from fixed physics steps. The swing emits at hinge reversals and fast bottom
crossings. The trampoline emits on landing and early spring recovery. The
events carry strength and a world position; `JellySound` handles distance,
stereo placement, mute state, and voice limits. The complete audio path is
documented in [Input, audio, and UI](input-audio-ui.md).

## Performance invariants

Facility collision keeps the same 2,526 spatial samples, default margin,
contact iterations, and exact response, but rejects oriented boxes axis by axis
and stops the second pass when the first pass found no overlap. Authored fitted
boxes may override that default margin, as the swing seat does. The trampoline
barrier uses a squared radial test before taking a square root.

Collision bounds the current cage's surface bindings before reconstructing any
contact samples. A shared world AABB and per-facility AABBs replace the old
center-distance collision gates. The conservative
bound includes signed/extrapolating weights and partition-of-unity error; it
does not depend on the last rendered surface or a fixed body-center radius.
Per-piece world AABBs followed by box-axis projections reject individual pieces, and rejecting every piece skips
the whole facility narrow phase. The cylinder rejects by height and horizontal
distance from the body enclosure. Fast-throw bounds include the sweep path.
Bounds are shared only within the controlled facility pass and invalidated after
each correction because earlier facilities can change cage positions in the same step.
Like boxes, the cylinder omits its second iteration when the first finds no
contact, since an identical repeated pass cannot change the result.

Candidate rejection lasts only until the first contact in a call. That contact
can move shared cage nodes into a previously excluded piece, so subsequent
checks immediately resume the original complete traversal, including the second
iteration. This preserves sample order, contact response and moving-seat recoil.
Occupancy gates and interaction radii remain unchanged; no delayed activation
or sleeping timer is introduced. The conservative gates also cover stretched
limbs beyond the old center-distance cutoffs. See [Collision hierarchy](collision-hierarchy.md)
and `npm run test:collision-broadphase` for exact comparisons
against the exhaustive traversal and focused collision CPU measurements.

Fast bulk throws (over 0.8 m/s) get one additional sweep of the existing contact
samples against nearby static boxes. On a hit, that substep keeps the previous
deformed shape, translates it up to the entry face, and applies the floor's low
restitution to inward bulk velocity. This bounded approximation targets throws
into thin frame pieces while preserving ordinary local contact deformation.
The sweep is reserved for impacts whose remaining inward normal travel exceeds
one quarter of the normal collision margin. High-speed motion that is almost
entirely tangential to a face therefore stays in the ordinary local contact pass;
otherwise a micrometre-scale re-entry at the start of each step can repeatedly
rewind all tangential travel and suspend the body against an inclined frame while
its unapplied tangential velocity keeps growing. It uses the existing proximity
gates and sample density, so it does not guarantee clearance for every extreme
deformation or a jump across an entire facility in one step. Moving seats and
the trampoline retain their existing contact response.

The occupied blanket still performs exact visible-skin clearance and the full
128-pass fairing. Its render pass is keyed by blanket version, body surface
revision, and occupancy, so unchanged render inputs do no work. Fixed mattress
heights and membrane neighbor indices are precomputed, and fairing alternates
two height-only buffers. These changes do not alter the cloth grid, clearance,
margin, stencil, or settling thresholds.

Facility ground and raised-surface shadows synchronize registered roots once
per frame. Geometry revisions dirty the relevant target without rebuilding
unchanged caster matrices; transform, visibility, and lighting changes still
invalidate the required maps. The trampoline keeps its deforming bed as one
mesh and merges its static meshes by material in group-local space, preserving
all triangles, normals, UVs, and materials while reducing shadow and main-pass
drawables. Rest-frame bed and swing rider coefficients are cached at facility
construction and reuse the same forces and targets each step.

## Adding a facility

To add another set piece:

1. add a feature folder under the owning world, such as
   `src/worlds/main/facilities/<name>/`;
2. keep the implementation's `facility.ts`, `physics.ts`, and `graphics.ts`
   modules together; put reusable selection, collision, shadow, and sound
   plumbing in `src/facilities/`;
3. give it a unique `id`, concise `label`, interaction distance, reset, and
   disposal behavior;
4. register it with `facilities.add(...)` in `src/app/runtime.ts` or the
   owning world's setup;
5. register its complete motion envelope with `FacilityShadows.add(...)`; this
   supplies ground/raised shadow casting and reception and, by default, caustic
   reception for all descendant PBR meshes;
6. route semantic sound events through `FacilityMotionSound` if it has motion;
   and
7. add a focused verification script for boarding, ownership, reset, body
   coupling, bounds, and any user-facing expression/audio threshold.

For scene geometry that is not a facility, follow the same optical rule
explicitly: any material surface that could plausibly receive jelly-caustic light
should set `receiveCaustics = true` and be registered with `CausticReceivers`.
Do not leave new props caustic-dark simply because they bypass the facility
manager.

The active facility should own body posture only for the duration of the ride.
The shared manager should remain the owner of prompts, `E`, touch action,
exclusive selection, and teardown.

## World-scoped facilities

Each portal world owns a manager. `enabled` gates interaction, prompts and
simulation in the inactive world. Portal travel normally resets the facilities
owned by the world being left. `persistAcrossTravel` is reserved for state that
must genuinely cross that boundary: a worn dressing-table item uses it to keep
its attachment state, while a lightweight proxy in the toy-world manager owns
only carried-item update and the low-priority take-off action. The playroom
table collision and nearby-item interactions therefore stay scoped to the
playroom. The portal itself is registered in each manager as the world-scoped
`PortalFacility`, exposing `Use Portal` through the same nearest-candidate
prompt while its housing collision stays local to that world.

Optional `crying` is aggregated even after the rider releases active ownership,
so post-crash recovery can use ordinary locomotion while retaining the facial
expression. `showPrompt=false` hides the action during an ejection. See
[Portal worlds](portal-worlds.md) and
[Toy road and tricycle](toy-road-and-tricycle.md).
