# Head wearables

The lower-left set piece is a small wooden dressing table at
`x = -.155`, `z = .305`. Its tabletop, four legs, and apron use the same
procedural timber material graph as the swing frame. The visible table is
registered as a facility with five fitted oriented boxes: one thin slab for the
top and one simple box per leg. The soft-body surface is therefore resolved out
of the table after each physics step without blocking the empty leg gaps.

The three table slots are equally spaced left-to-right: Floral Crown, Top Hat,
and Baseball Cap. Their geometry and TSL materials are direct ports of the
constructors in [`refs/hat_assets.html`](../refs/hat_assets.html). Their fitted
uniform scales are now `.016` for the floral crown, `.0144` for the top hat,
and `.0125` for the baseball cap, with matching table rests and worn offsets so each item actually seats on the jelly head. The floral crown keeps its existing fit; the top hat is raised so the underside of its inner brim rests on the crown instead of cutting through it. The baseball cap also uses a corrected rearward seating offset that matches its built-in tilt, with the binding rim resting on the curved head surface instead of being buried in it.

## Interaction state

The shared facility manager receives the nearest available slot when the
grounded, ungrabbed body enters the table's `.135 m` approach radius. The
desktop prompt is generated as `Press E to Wear <name>` and the touch button as
`Wear <name>`. Only one item can be worn at a time, but wearing one no longer
locks out the table: when the baby approaches a different occupied slot, the
prompt becomes `Swap to <name>` and the current item is returned to its home
slot while the new one is worn. If no swap target is nearby and the grounded
body walks away from the table, the prompt becomes `Take off <name>`.

The worn transform is no longer a pure world-up anchor. Five surface bindings
are sampled every frame: crown, front, back, left, and right. Those points form
a local jelly-head basis so the accessory follows translation, deformation, and
full tilt when the baby is dragged or squashed. Each wearable is positioned by
that live local frame plus a small per-item fit offset.

## Jump detachment

`Locomotion.onJump` fires only when the ordinary grounded jump path applies its
Space impulse. It is not emitted by the swing, trampoline, grabs, or any other
facility. A worn item then enters a short one-dimensional free-flight state
relative to the live head basis with `PHYS.gravity` and an initial velocity
chosen for an apex of about `.0065 m`. This keeps the brief jump motion reading
as a small detachment from the head rather than as a hat launching on its own.

The item remains a normal opaque facility caster while on the table and while
worn. Worn updates now force fresh world matrices, which keeps the shared
ground and raised-surface shadow systems in sync and eliminates the worn-item
shadow shimmer that came from stale transforms. Going to bed automatically
returns a worn item to its original slot; getting up leaves it on the table,
so it must be worn again deliberately.

All three items also travel to Soccer. While skating, physical skate support
qualifies for carried-item removal even though the body is above the floor.
The active Soccer facility yields E to carried attire when its exit action is
unavailable; approaching the exit gives that contextual action priority.
