# Collision hierarchy

Facility collision rejects work in this order:

1. The cage-derived body AABB against the union of all registered facilities.
2. The body AABB against each registered facility AABB.
3. The body AABB against individual collision-piece world AABBs, then their
   existing oriented-axis tests (or the trampoline's radial rejection).
4. The existing sampled surface contacts, throw response and orientation safety.

World and facility rejection happen before moving-box packing or contact-kernel
dispatch. The final stage retains the same anchors, margins and contact order;
this is not a replacement with full visible-triangle collision. The swing seat's
0.1 mm fitting margin and the default 2 mm margin are unchanged.

## Conservative bounds

The body bound reads the 980 cage nodes, never the dense surface. Absolute
binding-weight sums and partition error are collected from the full embedding
once, so signed/extrapolated vertices remain enclosed. Fast-motion bounds also
include the previous cage and its bulk-translated endpoint, matching the existing
throw sweep. This fixes the old gate's ability to discard a thin piece crossed
entirely between substeps. The response equations remain unchanged; no new
continuous moving-seat collision algorithm is introduced.

Per-piece AABBs enclose the intersection of the actual dot-product slabs using
the inverse axis matrix. Assuming perfectly orthonormal axes could make this
gate smaller than the narrow-phase shape. Near-singular axes disable that extra
rejection. Outward numerical padding is separate from the contact margin and
does not cause earlier contact.

## Registration and lifetime

Each built-in facility registers its collision geometry after construction and
unregisters on disposal. Static geometry and margins are immutable after
registration; re-register if those change. Swing pendulum pieces register a
full X-axis orbit envelope, so their current transforms need updating only if
the outer gate admits the body. Arbitrary callback motions without a known
envelope disable group rejection conservatively. Never use shadow bounds as
collision bounds.

The union is updated on registration/removal. The old center-distance gates are
removed because they do not conservatively enclose stretched limbs. Interaction
distances and boarding behavior remain separate and unchanged.

Loading-time native warmup is outside this hierarchy contract. It uses translated
non-contacting geometry plus a synthetic bound solely to initialize and tier the
same native exports before gameplay. Normal facility calls still enter through
the hierarchy in the rejection order above; no warmup enclosure is registered
or retained.

## Cache scope

`Facilities.afterStep` opens a batch after all ordinary physics writes. Within
it, facilities sharing a body reuse its bound until a contact changes state.
Contact completion invalidates that bound before the next facility, and a
facility without the built-in collision contract also invalidates it after its
callback. The batch ends in `finally`; no cached enclosure survives to the next
physics step, reset, interaction or direct call outside a batch.

Built-in `afterStep` methods must mutate cage state only through their collision
object. Any additional direct cage writes there must explicitly invalidate the
hierarchy or remove that cache-sharing contract. Bed cloth, support, audio and
animation updates are never skipped by collision rejection.

## Checks and cost

`test:collision-hierarchy` compares 320 facility resolutions against ungrouped
calls and checks both rejection levels, fully crossed obstacles, signed weights,
contact-induced invalidation, full seat orbits and skewed box axes. Hierarchy
counters expose bound builds and world/facility rejections for focused diagnosis.

A local Node run measured about 0.0017–0.0018 ms for all four rejected groups,
with one cage enclosure and zero contact-kernel dispatches. This is about 4×
cheaper than invoking all four ungrouped kernels in that fixture; it is not a
comparison against the old center-distance shortcuts or a browser FPS claim.
