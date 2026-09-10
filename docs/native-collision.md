# Native collision kernels

Facility and blanket collision extend the existing soft-body module; they do
not introduce a second solver or memory. Scalar C preserves double arithmetic
and contact order. Keep fast-math/reassociation disabled: later contacts consume
earlier corrections, and blanket clearance rounds after each Float32 store.

## Facility contacts

Registered facilities first share a native cage-bound calculation and cheap
world/group AABB rejection in JavaScript. Surviving facilities use one native
call for conservative candidate selection, the existing bulk
throw sweep, two contact iterations, and orientation stabilization. After the
first projection, traversal resumes at the next original box and includes
initially rejected boxes, since the correction invalidates the initial bounds.
The cylinder retains its one-sided radial barrier and vertical gates.
Per-piece rejection checks world AABBs before the oriented axes. Bounds include
the bulk sweep so fast throws cannot skip pieces crossed entirely in one step.
See [Collision hierarchy](collision-hierarchy.md) for the registration contract.

Sample indices and denominators upload once per collision object. Cage state,
previous positions, inverse masses and visible bindings already reside in the
module. Box records are reused; the wrapper checks their current values and
only writes changed transforms, supporting mutable authored boxes without a
separate invalidation contract. Buffers grow only when capacity is exceeded.
Steady-state wrapper calls reuse motion lists and grid views without allocating
per-box point arrays or spread-argument lists. Grid capacity grows geometrically
to bound retained allocations if a caller changes resolution repeatedly.

## Loading warmup

Built-in facility collision is warmed before the first rendered gameplay frame.
Each facility creates its normal persistent native collision object and repeatedly
executes the same box or cylinder export against synthetic geometry translated
far outside the play area. A synthetic admitting bound makes the native function
traverse its candidate and sampled narrow-phase loops, but the real cage cannot
contact the translated geometry, so positions, velocities and solver metadata
are untouched. This warmup bypasses the gameplay hierarchy intentionally; the
runtime rejection order and contact behavior are unchanged. The hierarchy's
native cage-bound export is warmed separately without populating its scoped
cache or diagnostic counters. Box warmup finishes by packing the real authored
transforms behind a rejecting synthetic bound, avoiding another first-use write
for static facility records.

The bed also executes the native blanket-contact and blanket-clearance exports
on scratch grids during loading. Their immutable uploads, projected-position
scratch and reusable grid buffers are therefore allocated before the player can
enter the bed. The scratch results are discarded and neither simulated nor
rendered blanket state changes.

The swing exposes a pendulum descriptor alongside its JavaScript callbacks.
All five seat boxes share one native speed record. Each contact immediately
updates that speed with the same point-velocity, effective-mass and impulse
equations; the final speed is written back once. Arbitrary callback motions
without this descriptor route the entire pass through JavaScript. Bodies
without WASM retain the existing JavaScript collision paths.

Native stabilization updates solver metadata once; JavaScript consumes those
counters, wakes the body, updates its center and marks the surface dirty without
running stabilization a second time.

## Blanket contact and clearance

The optical contact pass reconstructs its bindings directly from native cage
positions. Exact clearance reads the Float32 visible positions already produced
by `update_surface`; the caller still owns surface revision scheduling. Neither
pass caches results across body revisions or changes its existing geometry.

Immutable optical bindings and both index buffers upload lazily once per body.
Projected-position scratch and reusable grid buffers share the fixed 16 MiB
module memory. Only the small height/cloth grids cross the boundary per call;
the full visible skin is never copied. Grid input is preserved, including
existing contact heights, and clearance copies back only when it changes cloth.
Buffer lifetime matches the body; immutable model topology must not be replaced
inside an existing kernel instance. Allocation exhaustion fails explicitly.

## Verification

`npm run test:native-collision` compares the retained JavaScript algorithms with
the production embedded module: randomized swing poses (including moving seats
and fast contact), cylinder contacts, six deformed bed poses and no overlap.
It explicitly confirms throw-sweep and pendulum-impulse coverage, exercises
custom-motion fallback after native use, and compares resized grids.
Positions, velocities, pendulum speed, orientation counters, height fields and
Float32 cloth outputs must match exactly. Both facility paths use the same
native orientation stabilizer to isolate collision arithmetic.

The script also reports five-batch median timings including wrapper/grid-copy
costs, with no machine-dependent performance assertion. A local Node run gave
1.86× for swing contact including pose reset, 3.10× for optical blanket contact,
and 4.84× for exact blanket clearance. These are workload measurements, not
browser FPS predictions. Existing facility tests cover hard throws and grazing
release; bed tests independently verify visible-skin clearance and settling.

`npm run test:collision-warmup` verifies that box, cylinder and blanket warmup
create their native paths without changing body state, native solver metadata,
surface revisions or blanket state, and that a warmed box solver produces the
same next real contact result as a cold solver.
