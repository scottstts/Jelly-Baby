# Portal worlds

The playroom portal sits at `(0, -.255)` behind the swing and trampoline. The
toy-world portal is derived from the enlarged road layout rather than a fixed
legacy coordinate: it sits outside the road near the +Z side with 18 cm of clear
tabletop between the portal housing and the widened curb's outer edge, plus
substantial separation from the parked tricycle. This keeps portal placement correct when the road
layout changes.

Arrival is 10 cm from the destination membrane on whichever side the current
orbit camera occupies. Camera translation preserves that side through the
teleport, so the portal never stands between the camera and the newly arrived
baby. The baby's soft-body rest pose is also rotated during placement to face
the current camera, and locomotion yaw is synchronized to the same angle before
play resumes. The arrival point remains open tabletop space with a one-second
retrigger cooldown. Crossing the opening, rather than pressing an interaction
button, initiates travel. Grabs and occupied facilities cannot initiate travel.

`WorldTravel` owns two scene roots and independent facility managers. Only the
current manager can show prompts, own input or run contacts. The baby, wood,
environment, flavor, camera controls and optical transport are shared. Leaving
resets that world's facilities, including returning wearables. Reset stays in
the current world.

The toy world is imported and built on first passage. The existing loading
screen paints before construction, collision warmup and shader compilation.
Physics pauses; the destination receives a first render and GPU completion
fence before the overlay closes. Failures use the existing terminal error UI
with the transition stage. Later passages reuse geometry; disposal releases
both worlds.

Shadow proxies respect inherited world visibility. Ground and raised shadow
cameras refit to active-world envelopes on passage. The toy-world envelope was
expanded with the twofold road/scenery footprint, while returning to the
playroom still restores the smaller active-world fit rather than permanently
lowering its shadow resolution.

The portal uses one opaque, double-sided TSL spiral membrane and three rotating
enamel jelly arcs. No scene capture, screen-space transmission, particles or
extra lights are needed. A single uniform drives the membrane animation.

Browser appearance and WebGPU shader execution are left to manual inspection
under the project rules. The build verifies module splitting; automated tests
exercise physics and geometry without launching Vite.
