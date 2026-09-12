# Portal worlds

The playroom portal sits at `(0, -.255)` behind the swing and trampoline. The
toy-world portal is derived from the enlarged road layout rather than a fixed
legacy coordinate. It now sits directly beside the track's starting point, outside
the widened curb, with 10 cm of clear tabletop between the portal housing and the
curb's outer edge. That keeps a healthy physical gap while making the parked
tricycle and start line immediately nearby after arrival. The placement remains
derived from the road geometry so later layout changes do not reintroduce the old
large separation.

Arrival is 10 cm from the destination membrane on whichever side the current
orbit camera occupies. Camera translation preserves that side through the
teleport, so the portal never stands between the camera and the newly arrived
baby. The baby's soft-body rest pose is also rotated during placement to face
the current camera, and locomotion yaw is synchronized to the same angle before
play resumes. The arrival point remains open tabletop space with a one-second
retrigger cooldown. The portal housing is registered as a world-scoped
facility, so approaching it selects the shared nearest-facility prompt:
`Press E to Use Portal` on desktop and `Use Portal` on touch. The existing
facility availability gates keep travel unavailable while loading, grabbed, in
the cooldown, or while another facility owns the body. Travel still uses the
same loading, arrival, and camera-side placement path after the interaction.

Interaction opens a modal destination selector: **Home**, **Play Tricycle**,
and **Play Soccer**. Mouse/touch or arrows and Enter confirm a destination;
Escape or Stay here cancels. Navigation keys belong exclusively to the modal,
and simulation pauses until it closes. Each time it opens, the current world is
the selected and focused destination, so confirming immediately leaves the
player in place. Choosing the current world just closes it.

[`WorldTravel`](../src/worlds/travel.ts) owns three scene roots and independent
facility managers. The home placement lives in
[`src/worlds/main/layout.ts`](../src/worlds/main/layout.ts), while the track
placement is derived by
[`src/worlds/toy-track/portal-layout.ts`](../src/worlds/toy-track/portal-layout.ts).
Only the
current manager can show prompts, own input or run contacts. The baby, wood,
environment, flavor, camera controls and optical transport are shared. Leaving
resets ordinary facilities in that world, but a currently worn dressing-table
item is explicitly travel-persistent: its visual remains parented to the baby and
its head attachment continues updating in the toy world. A low-priority toy-world
interaction exposes `Take off <name>` whenever no nearer facility owns E; taking
it off reparents the item to its original slot on the hidden dressing table so it
is waiting there on return. Reset stays in the current world.

The toy and soccer worlds are imported and built on their first passage. The existing loading
screen paints before construction, collision warmup and first-visit shader compilation.
Soccer starts its facility-module load and grass-texture load concurrently. Physics
pauses; the destination receives a hidden first render and GPU completion fence
before the overlay closes. Each fully built destination compiles only once; later
passages reuse both geometry and hot pipelines while retaining the hidden render/fence.
When a new destination compiles, already-warmed inactive world roots stay hidden so
they do not re-enter the compile candidate set. Failures use the existing terminal
error UI with the transition stage. Disposal releases all worlds. Soccer follows the
same arrival, reset, persistent-attire and lighting contracts; see
[Soccer world](soccer-world.md) for placement and access.

Shadow proxies respect inherited world visibility. Both portal housings are
registered as ordinary facility-lighting participants: their complete static
visible envelope casts onto the tabletop and other raised surfaces, receives
facility/jelly raised-surface shadows, and receives the shared jelly caustic field.
Ground and raised shadow cameras refit to active-world envelopes on passage. The
ground target grows with the twofold road/scenery footprint to preserve the main
world's shadow texel density, while returning to the playroom restores its
original target size and fit.

The portal is a stationary molded toy device: a deep cream aperture shell, a
recessed seal and proud brass bezel on each face, three fixed pastel energy
cartridges whose swept ends seat into the shell chamfer, and mirrored weighted
plinths with rubber undertrays and vented power pods. The plinths and undertrays use
separate vertical and depth datums so their visible seam stays stable above the
tabletop; the undertray bottom is 1.5 mm clear of the floor. Both faces have a
destination dial and small status windows because travel works from either side.
PBR enamel, satin metal and matte rubber separate the manufactured surfaces.
Only the opaque, double-sided TSL membrane animates; hardware stays fixed.
Static parts batch by finish, with no scene capture, particles or extra lights.
The shared batcher preserves authored indices instead of expanding indexed meshes
to duplicate triangle vertices, so unchanged geometry can retain lower vertex traffic.
Repeated identical house/tree/flag shells are constructed once and transformed into
the batch rather than rerunning procedural geometry generation for every copy.
The geometry verification keeps the named assembly audit before batching and
checks the emitted batched surfaces again for z-fighting and topology defects.
The housing is also a static facility collision assembly: a segmented annulus
keeps the membrane opening clear, while the shell depth, cartridge rails,
control panels, mirrored plinths, undertrays and power pods keep the jelly on
the solid toy hardware. Home and toy portals register their own boxes with the
active world manager and warm the same authored set before travel begins.

Browser appearance and WebGPU shader execution are left to manual inspection
under the project rules. The build verifies module splitting; automated tests
exercise physics and geometry without launching Vite.
