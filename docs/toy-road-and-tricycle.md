# Toy road and tricycle

The track-owned implementation lives under
[`src/worlds/toy-track/`](../src/worlds/toy-track/): `layout.ts` is the shared
road source of truth, `graphics/` owns the scenery, and
`facilities/tricycle/` keeps the vehicle facility's lifecycle, physics,
geometry, camera, collision, and sound modules together.

The asymmetric road now has a twofold centerline footprint relative to the
original toy-world layout, while its physical width is 30 cm (1.5x the original
20 cm width). The infield houses and trees scale twofold with that larger
world. Trees outside the loop keep their original object scale and are
repositioned beyond the wider curb. The tricycle, portal, start gantry and road
obstacles retain their original object scale. Their positions are recomputed
from the enlarged road:
obstacle lateral offsets preserve their intended fraction of road width, the
tricycle starts on the new centerline, and the portal is placed outside the road
at that same starting section with authored clearance, so arrival begins close to
the parked tricycle rather than elsewhere around the enlarged loop.

The 3 mm road slab remains visual-only to the walking jelly and uses the
underlying tabletop floor for support. The raised curbs are different: they have
dedicated finite-height walking collision matching the visible 19 mm height and
5 cm width. Widening preserves the original asphalt-facing edge: the outer
curb grows away from the track and the inner curb grows into the infield. Its
top is therefore broad enough for the baby to jump onto, walk across, and then
step down onto or off the road without narrowing the drivable asphalt. Mesh and
collision use the same width constant. Only a short run of curb segments near
the baby enters the 240 Hz narrow phase. The tricycle's separate wheel/road
constraint still uses the unchanged road-facing curb edge, so its driving
boundary is not loosened by the wider walking platform.

The road keeps its coral borders, connector seams, brass pins, center dashes and
a checkered start beneath bunting. A studded brick, pen, bottle, eraser and
cotton reel interrupt alternating sides of the road. Their meshes and collision
footprints are not scaled by the larger world. Painted houses and the infield
trees form the enlarged tabletop village; outer trackside trees remain their
original size. Every decorative tree has one cheap vertical collision envelope
covering its plinth, trunk and crown for the walking jelly. Infield tree envelopes
inherit the same twofold scenery scale. These envelopes are not tricycle
obstacles because the road boundary already keeps the vehicle out of the tree
areas.

Static parts are baked in assembly-local coordinates and merged by finish. The
vehicle batches each wheel, saddle and fork shell separately to preserve motion.
Construction is deterministic, with no per-frame geometry generation.

## Seat steering mechanism

The wheelbase is 9 cm, with two rear wheels and a larger front wheel. The
enamel frame supports a shallow oval saddle sized for the lower body, a padded
back hoop, brass side grip risers and foot rests. Saddle and grips rotate
together. Equal transverse crank arms under the saddle and at the front
spindle connect through two constant-length rods: a parallel four-bar linkage.
Seat and front fork therefore share yaw. Rods follow their actual pin positions;
wheel spin and pedal cranks follow traveled distance.

## Motion and body coupling

W/S or joystick fore/aft accelerate and brake; continued reverse input backs
up. A/D or joystick sideways steer relative to vehicle heading, deliberately
different from camera-relative walking. E and the shared mobile button board
or dismount. Coasting has rolling drag, steering has finite response, and yaw
follows wheelbase curvature with a bounded rate. Forward speed caps at 34 cm/s,
reverse at 10 cm/s.

While mounted, the chase camera's authored resting pose uses the maximum allowed
OrbitControls polar angle, which is the lowest/grazing view permitted by the
normal camera limits. Manual orbit still takes priority while dragging; after
release the existing chase return brings yaw and polar angle back to that pose.

The driven motion remains a bounded planar bicycle approximation, but obstacle
contacts use a small planar rigid-body response instead of simply cutting
forward speed. Four compact footprint samples cover the front, rear wheels and
central chassis. Contact impulses preserve tangential motion, can add lateral
velocity and yaw from an off-centre hit, and then tyre scrub damps the transient
side-slip and spin. This lets glancing impacts deflect or skew the tricycle while
head-on impacts still stop or rebound slightly without introducing a full
suspension solver.

Obstacle footprints follow the visible object rather than one generic box: the
bottle and cotton reel use circular bounds, the molded brick and eraser use
rounded oriented bounds, houses use their authored oriented footprint, and the
low pen stays in the wheel-height path so the bicycle can roll over it. Three
wheel support contacts still run at the 240 Hz physics step. On foot and after
ejection, scenery uses the existing visible-surface facility solver; the curb
uses the same contact response but only through the localized finite curb
segments described above. A downward curb-top contact forwards its incoming
vertical speed into the locomotion landing gate, so landing on the curb produces
the same damped jelly-body impact sound as landing on the tabletop/road without
creating a separate per-step contact sound. The parked vehicle has a separate
moving collision volume and cannot inherit static scenery bounds.

Rider forces act on live FEM node velocities. Lower-body support and hand grips
are stiff; the upper torso is compliant. Targets include steering-frame point
velocities so acceleration, braking, turning and collision-induced side-slip/yaw
cause inertial lag. Only boarding places the body into a rest frame. Impact
releases supports and retains incoming momentum. These are powered
vehicle/support approximations, not a momentum-conserving multibody simulation.

## Crash expression and impact audio

Laughter starts after .65 seconds riding once speed exceeds 12 cm/s. An impact
above 22 cm/s in the contact-normal direction ejects an already-laughing rider.
The face switches immediately to the existing sob shape and stays crying through
flight. After contact, ordinary locomotion restores posture. The two-second
timer advances only when grounded with the mass-weighted crown at least 38 mm
above the feet; falling again resets it. Recovery returns to the default
blinking face without the post-grab chuckle. Dismount and reset do not trigger
crying.

Obstacle and road-edge audio is emitted from contact onset, not every fixed step
while two bodies remain touching. A short contact hold keeps tiny numerical
separations from re-arming the sound, and sub-3.5 cm/s contacts remain silent.
This mirrors the event/cooldown behavior of ordinary jelly impacts while still
allowing a later genuine re-impact to sound again.

Tricycle translation also drives one quiet, continuous procedural rolling layer.
It is silent below 6 mm/s, then raises a filtered tyre/tread texture smoothly with
actual planar vehicle speed; playback rate and filter frequency increase with
speed, while camera-relative distance and stereo pan keep it spatially subdued.
The loop is not an engine sound and remains below impact/laughter levels. It is
stopped on mute, reset, portal transition, hidden-tab cleanup and disposal.
A faint pair of short, rounded axle squeaks runs as a separate filtered layer over
the unchanged rolling sample. It shares the rolling layer's speed gate, gain
envelope and spatial attenuation, so squeaks cannot continue independently when
riding motion stops.

`npm run test:tricycle` checks boarding, drive, braking, turning, volume and
orientation stability, seat retention, ejection, facial timing, standing
recovery, impact event gating, glancing rigid-body response, constant-length
steering links and batched geometry. `npm run test:toy-driving` additionally
checks the twofold layout and 30 cm road width, widened-curb road confinement,
finite 5 cm-wide walkable curb collision, localized curb narrow phase, cheap tree
collision envelopes, portal clearance, unscaled obstacle dimensions with width-relative placement, enlarged house
collision, authored obstacle footprints and low-pen wheel contact.
