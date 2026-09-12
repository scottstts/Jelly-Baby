# Input, audio, and UI

The interface keeps the scene almost unobstructed. Controls are small, contextual
and accessible, while the pointer system is allowed to do the expressive work:
orbit the table, pick the actual skin, pull it, and let the physics carry the
release.

## Browser shell and interface

Portals open a destination menu. Arrows and Enter belong exclusively to the
modal until confirmation or cancellation. In Soccer, the touch jump button
becomes Shoot and Space runs the shot action. Leaving skates restores the hop
caption. Soccer uses forward/reverse throttle and left/right steering, with a
motion-gated rolling turn and an in-place duck-like pivot hop when stationary.
It keeps the lower chase angle and the same drag/release return behavior as the
tricycle.

While riding the tricycle, WASD and the touch joystick supply vehicle-relative
throttle and steering. The movement hint changes to “pedal · steer,” and the
touch hop button is disabled. E or the contextual button dismounts. On foot,
camera-relative walking resumes. Crash crying is independent of grabbing and
does not trigger the post-release chuckle; see
[Toy road and tricycle](toy-road-and-tricycle.md).

[`src/main.ts`](../src/main.ts) creates the page shell inside `#app`:

- the full-screen WebGPU viewport;
- the masthead and “a small, soft world” label;
- sound, reset, flavor, and day/night buttons;
- desktop keyboard/mouse hints;
- the specimen caption;
- a touch joystick and hop button; and
- a loading card that becomes the fatal diagnostics card when startup fails.

The markup uses labels, pressed/expanded state, live regions, button semantics,
and an ARIA label on the canvas. CSS in [`src/style.css`](../src/style.css)
switches to a joystick layout for coarse pointers or narrow screens, respects
safe-area insets, scales the loading and control surfaces for short landscape
viewports, and disables decorative motion when `prefers-reduced-motion` is set.

`index.html` supplies the page metadata, favicon, social preview image, and a
`noscript` message explaining that JavaScript and WebGPU are required.

The day/night button displays the current mode as a sun or moon and labels the
action to switch to the other mode. It starts in day mode on each load, exposes
pressed/busy state, and temporarily disables duplicate activation while the
night HDR loads. Its controller is disposed with the runtime.

## Orbit and camera follow

[`Input`](../src/app/input.ts) creates `OrbitControls` on the renderer canvas.
Pan is disabled, damping is enabled, and distance/polar limits keep the camera
near the tabletop. Dragging the background is therefore an orbit gesture;
scroll or pinch changes distance.

The camera target follows the body's mass center with exponential smoothing. The
target is kept above a small floor threshold and the camera's minimum distance
is raised while a facility is active. A real body grab freezes both the follow
offset and orbit controls until every grip is released.

## Desktop and touch movement

Movement is represented as a set of active commands. `WASD` and the arrow keys
are camera-relative: the input layer flattens the camera's forward direction,
constructs a horizontal basis, and gives the locomotion rig a normalized vector.
`Space` queues a jump. Reset is available only from the reset button; `R` has no
gameplay binding. `E` is reserved for facility interaction; `Escape` releases
all grips.

Near an available head-wearable slot, `E` uses the same shared facility route to wear the nearest item and the touch button reads `Wear <name>`. While an item is worn, approaching a different table item changes the prompt to `Swap to <name>`, and walking away from the table changes it to `Take off <name>`. Worn items persist through portal travel. In the toy world, take-off remains a fallback E action only when no nearer facility such as the tricycle needs that key; removing the item there returns it to its original dressing-table slot in the playroom. The ordinary Space jump also drives the wearable's short local detachment in either world; facility-controlled motion and grabs do not.

The touch joystick clamps its knob to a circular track and maps horizontal and
vertical offsets to the same camera-relative movement vector. Its pointer is
captured, reset to center on release, and cleared on blur or hidden-tab changes.
The hop button uses the same `Space` command and unlocks audio on its first
gesture. While a facility owns the body, ordinary movement and jump commands
are suppressed but the camera can still orbit.

Every input listener is connected to an `AbortController`. Blur, visibility
changes, pointer cancellation, lost pointer capture, reset, and disposal all
clear keys, touch commands, joystick state, and active grips.

## Picking, dragging, and multitouch

Pointer-down on the canvas first gives the refittable `SurfaceBVH` the current
body surface. A hit is resolved against the rendered full-resolution triangles,
then converted by [`surfaceGrab`](../src/physics/grab.ts) into cage-node weights.
This avoids an O(144k) triangle scan without changing the selected triangle or
the mechanical binding.

Mouse and pen use one grip. Touch can add independent simultaneous grips up to
the solver's 16-grab capacity. Each pointer stores its own drag plane, raw
target, release state, and physics-sample counters, so moving or releasing one
finger never retargets another. While any grip exists, orbit is disabled and
the canvas receives a `grabbing` class.

Move events prefer the newest coalesced pointer sample. The release event itself
is sampled before the grip is marked pending. A grip remains in the body's grab
array until the physics loop has consumed its final target, which preserves a
quick flick instead of dropping its last impulse. A lost mouse button is also
recovered from a later move with no primary button bit.

Hover only changes the cursor after a bounding-box test. It never creates a
mechanical binding; pointer-down always performs the exact BVH hit. Dragging
into the tabletop intersects a floor plane while keeping the target on the
camera ray.

## Flavor picker

[`FlavorPicker`](../src/app/flavor-picker.ts) builds its options from
[`src/graphics/character/jelly-flavors.ts`](../src/graphics/character/jelly-flavors.ts). The current
choices are lime, strawberry, blueberry, and lemon. Each option supplies a
surface color and three absorption coefficients. Choosing one updates the body
material and the optical field together, so surface tint and transmitted light
change as one design decision.

The menu supports click/tap, outside-pointer dismissal, `Escape`, selected
state via `aria-pressed`, and expanded state via `aria-expanded`. Its controller
is disposed with the runtime.

## Facial attachment and expression

The face is not a floating sticker. [`FaceSkin`](../src/graphics/character/face-skin.ts)
indexes the rest-space upper-front triangles into 2 mm XY bins. Each eye, brow,
blush, mouth, and tongue vertex is transformed in that rest-space frame, sampled
back onto the highest suitable skin triangle, and offset along the current
deformed normal.

`refinePatch` tessellates the flat mouth and tongue artwork before projection so
their curves remain smooth on the rounded, changing skin. Details render after
the transmissive body and stay just outside it.

[`FaceExpression`](../src/graphics/character/face-expression.ts) layers small procedural
states over the resting smile:

- blinks arrive on a human-ish timer with occasional double blinks;
- a held grab eases into a wobbly, worried/squished expression;
- a short release window produces a buoyant laugh; and
- an active facility can hold the laugh state once its physics threshold is
  crossed.

The bed supplies an independent sleep blend with curved closed eyelids,
relaxed brows, a small mouth, and a fading tongue. A damped translucent bubble
attaches at the nose through the deformed skin sampler. Wake reverses the blend
and deflates the bubble. See [Bed and sleeping](bed-and-sleeping.md).

The face updates only when the body surface or expression state needs it, but
its animation clock continues through sleeping physics so a resting baby can
blink.

## Sound lifecycle

[`JellySound`](../src/app/sound.ts) creates `AudioContext` lazily on the first
pointer, touch, or key gesture. It primes a silent buffer for mobile output,
routes all sound through a gain and dynamics compressor, and starts with a
master gain of `.62`. If a browser exposes only `webkitAudioContext`, that path
is used. Audio failure does not block the game.

Body contact uses no audio files. It combines three damped sine membrane modes
with a short band-passed noise transient. Foot contacts use a higher transient
band than body contacts, and strength is derived from impact speed. The sound
listener follows the camera and stores its right vector for facility panning.
Tricycle collisions reuse the body-contact texture but trigger only on a meaningful
new impact; sustained obstacle contact is held as one contact so it cannot retrigger
at the 240 Hz physics rate. Landing on a raised toy-track curb feeds its downward
impact into the same body-contact debounce, so it sounds like an ordinary floor
landing rather than a separate facility effect.

A moving tricycle adds one deliberately quiet continuous procedural rolling
texture. It begins only above a small motion threshold, follows absolute vehicle
speed with smooth gain/filter/rate changes, and uses the same camera-relative
distance attenuation and stereo direction as other positional effects. The layer
is stopped together with facility audio on mute, reset, world travel, hidden-tab
cleanup and disposal. A separate higher-band squeak layer adds two subdued axle
chirps per sample cycle through the same movement gate and spatial transport.

Facility audio is event-driven by fixed-step motion, not a free-running loop.
[`FacilityMotionSound`](../src/facilities/sound.ts) detects swing reversals,
bottom crossings, trampoline landings, and spring recovery, with per-kind
cooldowns. Swing creaks use meaningful angular speed and the incoming speed
peak at a reversal rather than absolute seat angle, so a seat held high remains
quiet. Center-crossing air sounds also require a real crossing with meaningful
speed. `FacilityAudio` turns those events into deterministic cached PCM
variants, attenuates them by distance, pans them in stereo, keeps at most six
voices, and ignores facilities farther than `.9` m.

Mute fades the master gain and stops active facility voices. Hiding the tab also
stops facility voices; reset stops and clears them. Disposal aborts listeners,
disconnects nodes, and closes the context if it is still open.
