# Soccer geometry and collision

The existing geometry-quality kit supplies lofts, swept tubes, turned profiles,
bevelled profile extrusion and molded solids. Parts stay named until batching.
Seats are continuous formed shells; the entrance is one deep bevelled arch;
the welcome desk has pierced trestles, a supported shelf and recessed drawer.
Gate leaves have continuous frames and hinged spindles. The open gate, field
access and goal mouths are real openings.

The architectural detail pass stays in the existing cream, blue, coral and
gold enamel palette, with empty seating and no changes to the field. Its
distinct treatments are:

- Curved seat pans with rolled front edges and a more gradual back transition.
- Smooth quarter-circle goal-frame shoulders with rounder tube sections.
- Rear goal bows, side base skids, roof stays, anchor shoes and rear feet.
- Transverse roof netting and vertical side netting completing the mesh holes.
- Exterior dado bands, cornices, pilasters and pilaster capitals.
- Alternating wall panels with raised louvres.
- Side roof ribs, alternating fascia tiles and solid triangular corbels.
- Rounded board caps and inset board badges.
- Terrace riser stripes and paired aisle tread grips.
- End roof edging and ribs, with framed colour medallions on the end walls.
- Scoreboard rain hood, team-colour tabs and gold underlines.
- A footed entrance sign with raised lettering and an arrow toward the gate.

These details live in `stadium-details.ts` and batch with the existing static
finishes. Mounts use shallow keyed joins rather than coincident overlay faces;
the assembly audit has no new clash exceptions. The sign sits centred in front
of the welcome desk on its +Z side, with a 12 cm wide panel and its highest
point at 7.5 cm above the ground table. Its foot clears the desk footprint by
over 1 cm, and the whole panel remains outside the entrance opening.
Its foot, post and shell have collision volumes, and traversal tests
continue to exercise the welcome-desk approach and direct entry route. The
scoreboard hood sets the envelope height to .50 m for shared shadow fitting.
Sign mounting and whole-stadium envelope containment are explicit geometry
contracts. Fine trim uses its structural host's collision volume; goal additions
remain within the existing post/net collision envelope.

The pitch is a material-mapped turf slab using the authored `grass_texture`
base, normal, roughness, and displacement maps. The maps use a `.16 m`
metre-based tile, so the 2 × 3.08 m pitch receives 12.5 × 19.25 square repeats
without stretching the grass. The displacement map supplies a restrained
vertex-height offset and fine bump detail; no procedural sprout mesh is needed.
Paint belongs to the same turf material as the base texture rather than
coplanar decals, and the slab receives shared shadows and jelly caustics.

The quality gate uses 25 micrometres of plane tolerance, 0.02 square millimetres
of clipped-overlap area, and a 1.5 mm solid-clash depth setting. Topology rejects
open solids, inverted components, invalid normals and degenerate faces. Four
hinge sleeves intentionally enclose their pivot rails and key into the jamb;
only those named pairs receive clash allowances, and coplanar checks stay on.
Turf is an intentional material-mapped slab: every emitted triangle and normal
is checked. Both named and material-batched assemblies are audited, including
the pitch and score digits.

Collision follows surfaces: seat pans and backs are separate, terraces and
canopies have finite height, posts follow frame segments, and thin net sheets
keep the goal mouth open. Gate-leaf boxes use the actual open yaw. The welcome
desk has separate top, drawer, shelf and trestle pieces. Soccer adds no equipment
collider or interaction blocker.

A 16 cm shallow ramp meets the raised turf without a gap at the field edge.
Its bottom toe has a finite vertical face: the tread must not converge with
the underside, which produces unstable grazing-angle strips. The underside
also clears the table. One inclined collision volume follows the tread, with
its end caps buried inside the pitch and below the table. This avoids the
undersides and end faces of thin segmented supports catching stretched skin.
Ramp and turf share a 0.35 mm contact margin; mismatched margins create an
invisible riser even when the visible surfaces meet. Both use local contacts
rather than a swept bulk stop. Tests sample the expanded support height across
both seams and drag from low, middle and high grips at different speeds and
positions across the ramp. Upward contact marks raised surfaces as
grounded after collision so ordinary walking and the 3× field run retain
traction on the ramp, pitch and seating. Side contacts cannot grant support.
No invisible rectangular player fence surrounds the pitch.

The turf landing volume keeps the local finite-mass contact response for fast
throws instead of using the structural-piece bulk-throw sweep. Small and high
releases therefore both transfer impact into the live cage deformation, with
high releases retaining proportionally stronger settling shake. Structural
stadium pieces retain the swept throw guard against tunnelling.

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
direct ramp access, jump landings and keeper jump/recovery extrema.
