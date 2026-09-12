# Soccer geometry and collision

The existing geometry-quality kit supplies lofts, swept tubes, turned profiles,
bevelled profile extrusion and molded solids. Parts stay named until batching.
Seats are continuous formed shells; the entrance is one deep bevelled arch;
the rental desk has pierced trestles, a supported shelf and recessed drawer.
Gate leaves have continuous frames and hinged spindles. The open gate, field
access and goal mouths are real openings.

Grass has two scales: 26,000 closed physical fibers provide silhouette and
grazing detail, while a deterministic mipmapped ribbon-height field represents
dense short plastic pile underneath. Height, color and roughness share that
field. Paint belongs to the material rather than coplanar decals. The slab
and physical fibers receive shared shadows and jelly caustics.

The quality gate uses 25 micrometres of plane tolerance, 0.02 square millimetres
of clipped-overlap area, and a 1.5 mm solid-clash depth setting. Topology rejects
open solids, inverted components, invalid normals and degenerate faces. Four
hinge sleeves intentionally enclose their pivot rails and key into the jamb;
only those named pairs receive clash allowances, and coplanar checks stay on.
Turf is an intentional aggregate: every emitted triangle and normal is checked,
with the repeated closed-fiber topology checked separately. Both named and
material-batched assemblies are audited, including the pitch and score digits.

Collision follows surfaces: seat pans and backs are separate, terraces and
canopies have finite height, posts follow frame segments, and thin net sheets
keep the goal mouth open. Gate-leaf boxes use the actual open yaw. The desk has
separate top, drawer, shelf and trestle pieces. The displayed skates have a
collider that disappears when equipped.

A 16 cm shallow ramp reaches the raised turf. Upward contact marks raised
surfaces as grounded after collision so walking retains traction on the ramp,
pitch and seating. Side contacts cannot grant support. The same physical
stadium collisions run while skating; no invisible rectangular player fence
surrounds the pitch.

A static XZ index prunes distant collision pieces. Queries use conservative
cage/binding bounds, including swept throws and stretched skin, plus a small
post-resolution margin. Tests compare candidates against every overlapping
volume and walk/skate through the intended routes. Boards, posts and net backs
must block passage; the goal mouth and entry corridor must remain open.

Every mesh uses shared facility lighting. The ground target grows with the
soccer envelope to preserve Home's texel density. Raised receivers retain the
world-space filter footprint and depth bias. Returning Home restores its fit
and target size. No world-specific light or quality reduction is introduced.

Automated checks do not replace manual WebGPU review. Useful views include
both gate sides, the concourse behind the near net, grazing turf, skate side
and underside views, rental joins, and keeper jump/recovery extrema.
