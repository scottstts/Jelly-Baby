# Assets, scripts, and verification

This project keeps the authored reference material separate from generated
runtime data. The asset pipeline is deterministic enough to hash the model
source and the verification suite exercises the same modules used by the game.

## Repository assets

The toy world and tricycle use authored procedural meshes, with no new texture
downloads. `npm run test:tricycle` covers drive, soft-body coupling, crash faces,
steering links and geometry budgets. `npm run test:world-travel` uses a renderer
stub for camera-side/camera-facing arrivals, round trips, loading ownership,
cooldown, reuse, reset and disposal;
it does not replace visual WebGPU inspection.

| Location | Role | Ownership |
| --- | --- | --- |
| `src/assets/bg_room.exr` | Source HDR room/window image for environment lighting and measured transport. | Authored runtime asset. |
| `src/assets/night.exr` | Unshaped night HDR environment, loaded on first toggle. | Authored runtime asset. |
| `src/assets/wood_texture/wood_base.jpg` | Table albedo. | Authored runtime asset. |
| `src/assets/wood_texture/wood_normal.png` | Table normal map. | Authored runtime asset. |
| `src/assets/wood_texture/wood_roughness.jpg` | Table roughness map. | Authored runtime asset. |
| `src/assets/model/jelly-baby.bin` | Packed generated model, cage, contact, optical, and mapping arrays. | Generated; consumed by runtime. |
| `src/assets/model/jelly-baby.json` | Packed-array layout, source hash, scale, and physical volume. | Generated; checked by tests. |
| `assets/screenshot.jpeg` | README hero image. | Authored presentation asset. |
| `public/favicon.svg` | Browser favicon. | Authored presentation asset. |
| `public/og_image.png` | Social preview image referenced by `index.html`. | Authored presentation asset. |
| `refs/jelly_baby_mesh.html` | Source implicit model and full-resolution polygonizer. | Reference/source input. |
| `refs/jelly-webgpu.html` | Earlier standalone WebGPU soft-body reference and solver target. | Reference only; not loaded by the app. |
| `refs/hat_assets.html` | Exact procedural flower crown, baseball cap, and top hat source constructors used by the dressing table. | Reference/source input. |
| `refs/jelly_baby.jpeg` | Reference image. | Reference only. |

## Model generation

Run `npm run build:model` after changing the supplied reference model. The
script:

1. extracts the model definitions between `const V =` and the reference
   viewer's startup code;
2. builds and scales the visible surface to `.07` m tall, deduplicating only
   coincident positions and preserving the source triangles and normals;
3. computes signed surface volume and checks for non-manifold/open edges;
4. calls `model-cage.mjs` to build the lattice cage, tetrahedra, volumes,
   surface bindings, contact IDs, and tetrahedron IDs;
5. calls `optical-model.mjs` to create the lower-resolution proxy, its cage
   bindings, and visible-to-proxy thickness mappings; and
6. packs every typed array on aligned byte boundaries into `jelly-baby.bin`
   and writes its layout and source SHA-256 to `jelly-baby.json`.

The generated model is currently 72,234 visible vertices, 144,464 visible
triangles, 980 cage particles, 4,026 tetrahedra, 10,090 optical vertices, and
20,176 optical triangles. Tests reject a stale manifest by hashing the exact
contents of `refs/jelly_baby_mesh.html`.

## WebAssembly kernel generation

`npm run build:kernel` compiles
[`scripts/native/soft-body-kernel.c`](../scripts/native/soft-body-kernel.c)
with `clang --target=wasm32 -O3`, exports the module memory and required
functions, base64-embeds the resulting module into
`src/physics/soft-body-kernel.js`, and removes its temporary directory. The
browser does not need clang: it instantiates the embedded module at runtime and
falls back to the JavaScript solver if that instantiation is unavailable.

The C source is not a separate physics design. It is the tight-loop execution
version of the JavaScript solver's model semantics and data layout.

Rebuilding or running `test:orientation` requires a clang with the wasm32 backend
and `wasm-ld` (for example, WASI SDK or Homebrew `llvm` plus `lld`). Apple's
system clang may lack WebAssembly support. `scripts/compile-kernel.mjs` shares
the compiler flags between generation and native equivalence verification,
invoking the compiler through interactive zsh; it automatically prefers an
installed Homebrew LLVM/LLD pair at `/opt/homebrew` or `/usr/local`. Set `CLANG`
explicitly when using another toolchain.

`npm run test:native-collision` checks exact native/JavaScript facility positions,
velocities, pendulum response, and blanket outputs, then reports a short median
benchmark of the complete calls. It uses the embedded production module and
does not need a compiler. See [Native collision kernels](native-collision.md).

`npm run test:collision-hierarchy` verifies world/group rejection without native
contact dispatch, shared-bound invalidation, swept throws, full pendulum envelopes,
signed bindings and non-orthogonal box axes. It compares the hierarchy with
ungrouped contact calls and reports a small clear-space benchmark.

## Package commands

The scripts in `package.json` are the supported entry points:

`npm test` is the aggregate check implemented by
[`scripts/test-suite.mjs`](../scripts/test-suite.mjs). It runs lint,
TypeScript checking, and Node's built-in test runner over every
`scripts/verify-*.mjs` file, including
the face regression. Test files run serially because several checks exercise
the same generated model and native toolchain. A passing run prints one total
summary; a failing run prints the accumulated diagnostics for every failed
audit and test file. The focused `test:*` aliases remain available when only
one regression is needed.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite for local development. |
| `npm run preview` | Preview a production build through Vite. |
| `npm run build` | Type-check, then create the Vite production bundle. |
| `npm run lint` | Run ESLint over `src`, `scripts`, and the config. |
| `npm run typecheck` | Run TypeScript with `noEmit`. |
| `npm run build:model` | Regenerate the packed model assets. |
| `npm run build:kernel` | Rebuild and embed the WebAssembly soft-body kernel. |
| `npm test` | Run lint, typecheck, and the complete serial verification suite with an aggregate pass/fail report. |
| `npm run test:physics` | Run the broad physics/rendering/optics regression, followed by bed and blanket coverage. |
| `npm run test:swing` | Verify swing behavior and shared facility routing. |
| `npm run test:trampoline` | Verify trampoline support, rebound, and transitions. |
| `npm run test:bed` | Verify bed support, blanket settling, sleep/wake, and shadow registration. |
| `npm run test:wearables` | Verify wearable geometry, swap/take-off routing, portal carry/take-off return, head-frame fit, bed return, shadow sync, and table collision. |
| `npm run test:blanket-shadows` | Reproduce curved-blanket shadow acne and verify receiver depths, real blockers, and caching. |
| `npm run test:facility-collision` | Verify tight facility volumes, surface clearance, and pre-contact hints. |
| `npm run test:portal-collision` | Verify the portal aperture stays passable while solid hardware collides, and verify the portal participates in universal shadows and caustic reception. |
| `npm run test:collision-broadphase` | Compare optimized and exhaustive contacts exactly, verify safe rejection/contact chains, and measure collision CPU cost. |
| `npm run test:facility-shadows` | Verify facility projection and invalidation. |
| `npm run test:caustics` | Verify the universal `receiveCaustics` opt-in, material deduplication, emissive preservation, and lighting updates. |
| `npm run test:facility-sound` | Verify motion-event timing and procedural audio. |
| `npm run test:multitouch` | Verify simultaneous grips and cleanup paths. |
| `npm run test:orientation` | Compile and compare indexed repair with full-scan native repair; requires a WASM-capable clang. |
| `npm run test:deformation` | Verify sustained frame-cadenced multi-drag, bounded recovery, volume, release/sleep and post-solver contacts. |
| `npm run test:performance` | Verify bounded stepping and optimized data paths. |
| `npm run benchmark` | Intended to print CPU timings for walking and severe stretching; currently stale. |

`npm run dev` is for the user's own visual inspection; the automated checks do
not need a development server or browser tab.

## Verification coverage

### Physics and optics

[`scripts/verify-physics.mjs`](../scripts/verify-physics.mjs) checks the source
hash, force-free rest behavior, settling, exact sleep, volume and upright
shape, visible-face render ordering and clearance, picking at multiple camera
angles, walking, turning, jumping, grabbing, throwing, damping, recovery,
floor-constrained pointer projection, abrupt drag response, and orientation
repair. It also measures the edited HDR window, checks proxy shadow coverage and
finite view thickness, and constructs the GPU caustic graph and its targets.

### Facilities

[`scripts/verify-swing.mjs`](../scripts/verify-swing.mjs) checks approach-radius
boarding, seat support, gradual energy pumping, bounded angle, volume retention,
normal blinking, per-ride laughter threshold/persistence (including boarding
an already-moving swing), dismount placement, empty swing decay, grab
exclusion, reset, and the manager's nearest-candidate and exclusive-owner
rules.

[`scripts/verify-trampoline.mjs`](../scripts/verify-trampoline.mjs) exercises
the trampoline's approach and boarding rules, supported compression, rebound
height, airborne behavior, face threshold, frame collision, leave/reset, and
facility lifecycle.

[`scripts/verify-wearables.mjs`](../scripts/verify-wearables.mjs) checks the
three reference asset roots for finite geometry and full shadow flags, verifies
nearest-slot selection and reparenting, confirms the Space-triggered `.025 m`
head hop and grounded take-off wording, and resolves a shallow approach against
the table's simple collision box.

[`scripts/verify-facility-collision.mjs`](../scripts/verify-facility-collision.mjs)
walks the deformed surface into both facilities and checks that the visible skin
stays outside the swing frame/seat boxes and trampoline cylinder. It also
verifies that each interaction hint appears before first physical contact and
that a moving seat transfers momentum into the body and loses angular speed on
contact.

[`scripts/verify-facility-shadows.mjs`](../scripts/verify-facility-shadows.mjs)
checks the directional projection matrix, WebGPU table lookup orientation,
full swept bounds, separate contact channel, max-blended overlapping supports,
idle render caching, dynamic bed invalidation, and restoration of renderer
state.

### Input, face, and sound

[`scripts/verify-multitouch.mjs`](../scripts/verify-multitouch.mjs) runs the
actual input handlers against both the WebAssembly and JavaScript solvers. It
checks independent simultaneous grips, opposing stretch, final release
samples, lost capture/blur/visibility/reset/escape/disposal cleanup, three-finger
retention, mouse single-grip behavior, and native/JS agreement.

[`scripts/verify-faces.mjs`](../scripts/verify-faces.mjs) is included by
`npm test` alongside the other verification files. Run it directly with:

```sh
node --experimental-strip-types scripts/verify-faces.mjs
```

It checks original artwork projection, finite animated details, multiple grabs,
release laughter, reset, rigid translation following, deformed-skin attachment,
and expression recovery.

[`scripts/verify-facility-sound.mjs`](../scripts/verify-facility-sound.mjs)
checks silence at rest, swing event timing, trampoline event ordering,
deterministic PCM samples and variants, no DC offset, bounded sample peaks,
distance/suspension filtering, six-voice limits, cached buffers, and cleanup. It
also checks the tricycle rolling loop's deterministic bounded texture, silence at
rest, speed-controlled start, parameter updates, buffer reuse and stop/restart
cleanup, plus the separate speed-gated squeak layer and its paired source
cleanup.

### Performance and architecture

[`scripts/verify-orientation.mjs`](../scripts/verify-orientation.mjs) verifies
the checked-in WASM payload alongside freshly compiled indexed
and full-scan variants of the same native physics. A deterministic three-grip
shaking/release sequence must yield byte-identical positions, velocities,
contacts, deformation gradients, visible positions/normals, and bounds. Separate
collapsed/flat-state cases cover equal minima, local blending, admissible motion
after the repair budget is exhausted, and cache invalidation after reset. Every
substep must stay below a deterministic work ceiling, and local indexing must
still avoid redundant full scans. Reported CPU timings are diagnostic only.
Verification exports and counters are excluded from the shipped kernel.

[`scripts/verify-deformation.mjs`](../scripts/verify-deformation.mjs) replays
actual pointer events once per rendered frame with two or three simultaneous
grips at 20, 30 and 60 Hz. It checks orientation every fixed substep, volume and
continued movement during shaking, exact visible embedding, camera/grip cleanup,
recovery of height and volume after release, and eventual exact sleep. It also
exercises the JavaScript fallback and invalid post-solver facility edits. This
covers the sustained mobile collapse that the earlier native-equivalence test
missed; accepting an inverted result after exhausting repair is now a failure.

[`scripts/verify-performance.mjs`](../scripts/verify-performance.mjs) checks
that the fixed step retains real time through hitches, grabbing does not scan
the visible mesh linearly, coalesced release endpoints are preserved, the
accelerated full-resolution surface matches the original CPU embedding exactly,
the optical proxy remains a calculation-only surface, shadow/thickness error is
bounded, GPU caustics stay in the render loop, and the real worker publishes
shadow before thickness while reusing shadow for camera-only requests.

[`scripts/benchmark.mjs`](../scripts/benchmark.mjs) is intended to report mean
and maximum timings for physics, surface embedding, face update, picking,
transport, and thickness during walking and a severe stretch. It is diagnostic
rather than a pass/fail threshold test. At the current revision it still calls
`RefractiveLightField.update` with the pre-worker API shape, so
`npm run benchmark` exits with a `TypeError` before printing timings. Updating
that call is outside this documentation-only change.

## Recommended local verification order

After a code or generated-asset change, use:

```sh
npm test
npm run build
```

Run `npm run benchmark` when a performance-sensitive path changed. Run the
standalone face check when changing `baby-face.ts`, `face-skin.ts`, or
`face-expression.ts`.

## Runtime requirements and inspection boundary

The built page needs JavaScript, a secure context, and a browser with stable
WebGPU support. WebGL fallback is intentionally disabled. Node regressions
cover numerical behavior, resource graph construction, worker protocol, and
data invariants; they do not replace visual inspection of GPU shader output,
touch feel, audio on the target device, or browser-specific WebGPU stability.

`npm run test:lighting` checks the actual night HDR source measurement, lighting-driven shadow cache invalidation, refitted swept bounds, and exact day projection restoration without a browser.
