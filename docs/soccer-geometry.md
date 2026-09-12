# Soccer geometry and collision

The existing geometry-quality kit supplies lofts, swept tubes, turned profiles,
bevelled profile extrusion and molded solids. Parts stay named until batching.
Seats are continuous formed shells; the entrance is one deep bevelled arch;
the welcome desk has pierced trestles, a supported shelf and recessed drawer.
Gate leaves have continuous frames and hinged spindles. The open gate, field
access and goal mouths are real openings.

Grass has two scales: 26,000 closed physical fibers provide silhouette and
grazing detail, while a deterministic mipmapped ribbon-height field represents
dense short plastic pile underneath. Height, color and roughness share that
field. Paint belongs to the material rather than coplanar decals. The slab and
physical fibers receive shared shadows and jelly caustics.

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
keep the goal mouth open. Gate-leaf boxes use the actual open yaw. The welcome
desk has separate top, drawer, shelf and trestle pieces. Soccer adds no equipment
collider or interaction blocker.

A 16 cm shallow ramp reaches the raised turf. Upward contact marks raised
surfaces as grounded after collision so ordinary walking and the 3× field run
retain traction on the ramp, pitch and seating. Side contacts cannot grant
support. No invisible rectangular player fence surrounds the pitch.

A static XZ index prunes distant collision pieces. Queries use conservative
cage/binding bounds, including swept throws and stretched skin, plus a small
post-resolution margin. Tests compare candidates against every overlapping
volume and walk directly through the intended gate/ramp routes. Boards, posts
and net backs must block passage; the goal mouth and entry corridor must remain
open.

Every mesh uses shared facility lighting. The ground target grows with the
soccer envelope to preserve Home's texel density. Raised receivers retain the
world-space filter footprint and depth bias. Returning Home restores its fit
and target size. No world-specific light or quality reduction is introduced.

Automated checks do not replace manual WebGPU review. Useful views include both
gate sides, the concourse behind the near net, grazing turf, welcome-desk joins,
direct ramp access, shooting follow-through and keeper jump/recovery extrema.
