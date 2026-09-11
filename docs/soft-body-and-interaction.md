# Soft body and interaction physics

The baby is simulated as a small, nearly incompressible soft solid. The visible
mesh is not animated by a canned squash-and-stretch pose: it is embedded in a
regular tetrahedral cage, and the cage is advanced by the solver.

## Model data and generated cage

The source shape lives in [`refs/jelly_baby_mesh.html`](../refs/jelly_baby_mesh.html).
`scripts/build-model.mjs` extracts only its implicit-model definitions and
marching-tetrahedra builder, scales the result to a 7 cm body, preserves the
original surface triangles, and writes a packed binary asset plus a JSON
manifest.

The checked-in asset currently contains:

| Data | Size | Use |
| --- | ---: | --- |
| Visible surface | 72,234 vertices / 144,464 triangles | The rendered, picked, and facially attached body. |
| Mechanical particles | 980 nodes | Positions, velocities, mass, contact, and cage deformation. |
| Tetrahedral elements | 4,026 | Elastic, volume, and orientation constraints. |
| Contact bindings | 2,138 | Barycentric floor samples around the lower body. |
| Optical proxy | 10,090 vertices / 20,176 triangles | Bounded light-space depth, shadow, and thickness work. |

The counts come directly from the generated manifest arrays: `particles` has
2,940 scalar coordinates, `volumes` has 4,026 entries, and the visible and
optical index buffers contain 433,392 and 60,528 indices respectively. The
manifest stores the source SHA-256, physical volume, scale, and byte ranges for
each typed array. `src/physics/baby-cage.ts` reconstructs those arrays into
Three.js geometries and per-surface four-node bindings.

`scripts/model-cage.mjs` lays a 7.5 mm regular lattice over the implicit solid.
Each occupied lattice cell is split into six tetrahedra. Element volumes are
weighted by implicit occupancy samples and then globally rescaled so the cage
has the exact signed volume of the reference surface. Every visible vertex is
embedded into the first containing tetrahedron with barycentric weights. Surface
contact bindings are selected from cell extrema so the floor constraints reach
the actual lower silhouette instead of an arbitrary cage plane.

The optical surface is generated from the same implicit model at a lower
polygonizer resolution. Its vertices are also embedded into the full cage, and
each visible vertex receives a three-vertex mapping back to the proxy for view
thickness interpolation. The proxy never replaces the rendered mesh.

## Physical parameters

[`src/physics/constants.js`](../src/physics/constants.js) is the shared source
of simulation constants:

| Parameter | Value | Meaning |
| --- | ---: | --- |
| Density | `1050` | kg/m³ mass density. |
| Shear modulus | `1200` | Pa, resistance to distortion. |
| Bulk modulus | `65000` | Pa, resistance to volume change. |
| Damping | `3` | Internal damping rate used by axial viscosity. |
| Gravity | `2.4` | m/s², deliberately gentler than Earth gravity. |
| Fixed step | `1 / 240` s | Solver rate. |
| XPBD iterations | `3` | Elastic/contact projection passes per step. |
| Static / dynamic friction | `.65` / `.42` | Floor tangential response. |
| Restitution | `.065` | Small bounce response. |
| Floor | `.00015` m | Contact plane height. |
| Maximum grab force | `2.8` | Force limit used by the grab constraint. |

The low gravity and small jump impulse are part of the intended feel: the body
has time to show its elastic response without becoming a fast arcade character.

## Solver step

[`src/physics/soft-body.js`](../src/physics/soft-body.js) stores positions and
velocities in `Float64Array`s. For each fixed step, the JavaScript path:

1. copies the current positions to `previous`, clears contact accumulators, and
   applies exponential air damping and gravity;
2. predicts positions from velocity;
3. clears XPBD multipliers and runs three iterations over every tetrahedron,
   alternating element traversal direction;
4. solves the coupled elastic distortion and hydrostatic constraints, then the
   orientation barrier, grabs, and floor contacts;
5. applies floor friction from the solved tangential displacement;
6. runs bounded orientation repair, then accepts only admissible nodal motion if
   the candidate still violates the orientation threshold, without shrinking the timestep;
7. reconstructs velocity from the corrected position delta and applies a small
   impact response when a contact arrived with meaningful downward speed;
8. applies equal-and-opposite axial viscosity along unique cage edges; and
9. updates the mass center and marks the surface dirty.

The elastic constraints are solved together from the reference neo-Hookean
energy:

```text
W = μ/2 (||F||² − 3) + K/2 (J − 1 − μ/K)²
```

Solving distortion and volume as a coupled two-constraint system makes the
identity deformation force-free. The separate orientation barrier prevents an
element from inverting. Difficult candidates use the bounded acceptance rule
below; a failed repair is never accepted as the next recovery reference. The
body still consumes the complete 1/240-second step.

The solver has no self-collision or tearing. This is an intentional bounded
soft-body model, not a general-purpose deformable-material package.

## WebAssembly accelerator and fallback

[`src/physics/soft-body-kernel.js`](../src/physics/soft-body-kernel.js) embeds a
WebAssembly module generated from
[`scripts/native/soft-body-kernel.c`](../scripts/native/soft-body-kernel.c).
`createSoftBodyKernel` allocates the model arrays in a fixed 16 MiB linear
memory region, configures the same topology and constants, and exposes the
kernel's positions, velocities, contact data, nodal deformation gradients,
surface positions, normals, and metadata back to the `SoftBody` object.

The accelerator executes the same elastic projection, grab, contact, barrier,
orientation-repair, damping, sleeping, and surface-embedding arithmetic in
tight linear-memory loops. The visible output is intentionally unchanged: the
performance regression compares accelerated positions and normals with the
original JavaScript embedding and requires zero error. If WebAssembly is not
available or initialization fails, the class keeps the JavaScript solver with
the same equations and public behavior.

The kernel reserves capacity for 16 simultaneous grabs. The input layer uses the
same capacity check before creating a grip, so the fallback and accelerated
paths have the same interaction limit.

### Bounded recovery under violent grabs

Opposing grabs and abrupt shaking can drive many elements through the orientation
barrier. The original nested recovery could run over 65,000 corrections in one
substep and still return an inverted cage. That result then became the next
"previous valid" reference, causing progressive collapse and persistent repair
work after release. A real three-pointer replay with frame-held commands at
30 Hz reproduced this in both the original kernel and its indexed optimization.

The native kernel builds a tournament tree of element Jacobians when a step
needs repair. A static node-to-element adjacency list identifies every
tetrahedron touching the four corrected nodes. After projection or local blending,
only those Jacobians are recalculated, once each, and their tree paths refreshed.
The next worst element is available at the root. Equal minima select the lowest
element index, matching the original strict-comparison scan exactly.

Local projection is capped at 32 corrections. If it still leaves a determinant
below `.12`, the solver starts from a validated reference and makes two
forward/reverse sweeps toward the proposed pose, moving one node at a time.
Each incident tetrahedron's determinant is linear in that single-node motion,
so its admissible fraction is calculated directly. A small margin keeps the
result away from the boundary. This gives fixed work even when many constraints
conflict, instead of starting another repair loop.

The solved mass-center displacement is preserved, with a rigid upward correction
only where necessary for floor clearance. Independent nodes can continue moving;
neither the timestep nor the pointer command is rewound. Only a validated result
is saved for subsequent recovery. Facility contacts apply the same rule after
their positional corrections, before those edits reach rendering or another step.

The index is rebuilt for each repair call; it is never trusted across external
position edits. Scratch and the saved valid cage are allocated once within the
existing 16 MiB WASM memory. The JavaScript fallback uses the same bounded
acceptance rule. Ordinary elastic/contact arithmetic, material parameters,
force caps, input response and full-resolution surface embedding are unchanged.
Extreme candidates that previously exhausted recovery now have a defined,
admissible outcome.

`test:orientation` checks native index/scan agreement under this bounded policy
and a deterministic per-substep work ceiling. `test:deformation` uses the actual
input handlers and fixed-step clock at 20, 30 and 60 Hz, checking sustained
multi-grab motion, volume, orientation, release recovery and eventual sleep.
Frame-held input and post-release recovery are essential: a short replay that
retargets every physics substep can miss the collapse entirely.

## Surface embedding

[`src/physics/deform-surface.js`](../src/physics/deform-surface.js) is the
single embedding implementation. For each visible or optical vertex it:

- interpolates the four current cage positions with the stored barycentric
  weights;
- interpolates the four nodal deformation gradients;
- applies the cofactor matrix to the rest normal and normalizes it; and
- updates the position and normal `BufferAttribute`s and bounds.

The exact full-resolution CPU surface is therefore shared by rendering, the
surface BVH, grabbing, face placement, optical thickness, and facial
clearance. The accelerated path writes the same arrays from WebAssembly, then
updates the same Three.js attributes and bounding volumes.

## Facility volume contacts

Facility obstacles do not scan the full visible triangle mesh. A fixed rest-space
grid selects roughly 2,500 visible-surface anchors, and each anchor retains the
four cage-node weights from the normal surface embedding. At a facility contact
the anchor is projected out of the obstacle and its inward normal velocity is
removed from those same four nodes. This preserves deformation and lets the
body slide or squash against the obstacle without introducing a second body
representation.

The facility narrow phase supplies the obstacle-specific shape: oriented boxes
for the swing frame and its moving seat, plus a radial side boundary for the
inactive trampoline cylinder. Moving boxes can provide point velocity and a
finite effective mass; the solver then applies the matching reaction impulse to
the mover, while static boxes behave as infinite-mass obstacles. A small
hierarchy of world and per-facility AABBs avoids this work when the body is well away from the
facility. Inside those gates, a conservative enclosure derived from the current
cage and binding weights rejects non-overlapping facility pieces before surface
samples are reconstructed. Individual pieces first receive world-axis AABB
rejection, then their oriented-axis test. After any contact it restores full traversal, since
contact corrections can invalidate the initial enclosure. This is a deliberately bounded approximation between a single
enclosing AABB and full deforming mesh-to-mesh collision.

The existing WASM module now executes the complete facility pass, including
the throw sweep and orientation acceptance, directly on its cage memory.
See [Native collision kernels](native-collision.md) for motion ordering,
buffer ownership, fallback behavior, and equivalence verification.
See [Collision hierarchy](collision-hierarchy.md) for swept bounds and cache
invalidation across the four facilities.

## Floor contact, sleep, and wake-up

Floor constraints use the precomputed four-node contact bindings. A contact
sample projects upward if it falls below `PHYS.floor`, accumulates penetration
for friction and audio, and contributes to `grounded`. Tangential correction
uses static friction below the threshold and dynamic friction above it.

When locomotion allows sleeping, the body must be grounded, complete a full
fixed step, and remain below 5 mm/s RMS kinetic speed for more than 0.45 s. It
then zeros velocity and stops changing positions. A grab, a movement command,
a jump, or a facility wakes it. Sleeping is exact: later steps leave the
position array unchanged until the next wake.

## Grabbing and throwing

[`src/physics/grab.ts`](../src/physics/grab.ts) turns a visible triangle hit into
a mechanical grip:

1. The hit point is converted to triangle barycentrics.
2. Those weights are composed with the triangle vertex-to-cage stencils.
3. Duplicate cage nodes are merged and renormalized.
4. The resulting anchor is checked against the visible hit point; a mismatch is
   an error rather than a silent offset.
5. The solver applies a compliant XPBD point constraint with a bounded force.

The input layer maintains a short-lived target command. Pointer motion is read
from the newest coalesced sample, limited only for absurd raw world-space
teleports, and advanced with a fast exponential response. On release, the
final target sample is kept for one or two physics substeps so a quick flick
still transfers momentum.

While a grip exists, the camera is frozen and orbit controls are disabled. A
drag target is projected onto a plane aligned with the camera; if it would fall
through the table, it is intersected with a floor plane while remaining on the
pointer ray.

## Locomotion and jumping

[`src/app/locomotion.ts`](../src/app/locomotion.ts) is a force-controlled rig,
not an animation replacement. It computes a mass-weighted center and velocity,
turns toward the requested camera-relative direction, and applies per-node
posture/gait forces toward a yawed rest shape. Feet receive stronger support;
alternating nodal stride forces create a simple walk cycle.

Movement forces release when a grip is active and recover over 0.55 s after the
body is released. Stopping movement removes gait drive and lets damping settle
the body. A jump queues a `.43` m/s base vertical impulse with a little extra
impulse at low rest-space nodes, subject to grounded state and a `.24` s
cooldown. The resulting flight and landing are still solved by the soft body.

Facilities temporarily own posture and vertical support while active. Normal
locomotion is skipped during that handoff; the active facility drives nodes and
the soft-body solver remains responsible for deformation, contact, and recoil.

## Fixed-rate timing

[`src/app/fixed-step.ts`](../src/app/fixed-step.ts) accumulates clamped frame
time and executes up to 12 steps. Four steps cover a normal 60 Hz frame and 12
steps cover the full accepted 50 ms hitch. Excess beyond the caller's contract
is reduced to a remainder instead of creating a slow-motion catch-up spiral.
