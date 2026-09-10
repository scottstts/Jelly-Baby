# Portal worlds

The playroom portal sits at `(0, -.255)` behind the swing and trampoline.
The toy-world portal is at `(.47, .40)`, outside the lower-right part of the
road. Arrival faces away from the portal, 10 cm in front of it, with a one-second retrigger
cooldown. Crossing the opening, rather than pressing an interaction button,
initiates travel. Grabs and occupied facilities cannot initiate travel.

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
cameras refit to active-world envelopes on passage, so visiting the larger
road does not permanently lower playroom shadow resolution.

The portal uses one opaque, double-sided TSL spiral membrane and three rotating
enamel jelly arcs. No scene capture, screen-space transmission, particles or
extra lights are needed. A single uniform drives the membrane animation.

Browser appearance and WebGPU shader execution are left to manual inspection
under the project rules. The build verifies module splitting; automated tests
exercise physics and geometry without launching Vite.
