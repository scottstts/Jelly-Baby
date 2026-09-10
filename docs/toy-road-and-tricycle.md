# Toy road and tricycle

The asymmetric road now has a twofold centerline footprint relative to the
original toy-world layout, while its physical width is 30 cm (1.5x the original
20 cm width). The infield houses and trees scale twofold with that larger
world. Trees outside the loop keep their original object scale and are
repositioned beyond the wider curb. The tricycle, portal, start gantry and road
obstacles retain their original object scale. Their positions are recomputed
from the enlarged road:
obstacle lateral offsets preserve their intended fraction of road width, the
tricycle starts on the new centerline, and the portal is placed outside the road
with authored clearance.

The 3 mm road slab remains visual-only to the walking jelly and uses the
underlying tabletop floor for support. The raised curbs are different: they now
have dedicated finite-height walking collision matching the visible 19 mm curb.
Only a short run of curb segments near the baby enters the 240 Hz narrow phase.
This prevents the old road-slab side face from acting like an invisible wall,
while still making a grounded baby collide with the curb and allowing an
ordinary jump to clear its real top. The tricycle continues to use its separate
wheel/road constraint, so it remains confined to the track whether occupied or
parked.

The road keeps its coral borders, connector seams, brass pins, center dashes and
a checkered start beneath bunting. A studded brick, pen, bottle, eraser and
cotton reel interrupt alternating sides of the road. Their meshes and collision
footprints are not scaled by the larger world. Painted houses and the infield
trees form the enlarged tabletop village; outer trackside trees remain their
original size.

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
segments described above. The parked vehicle has a separate moving collision
volume and cannot inherit static scenery bounds.

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

`npm run test:tricycle` checks boarding, drive, braking, turning, volume and
orientation stability, seat retention, ejection, facial timing, standing
recovery, impact event gating, glancing rigid-body response, constant-length
steering links and batched geometry. `npm run test:toy-driving` additionally
checks the twofold layout and 30 cm road width, road confinement, finite
jump-clear curb collision, localized curb narrow phase, portal clearance,
unscaled obstacle dimensions with width-relative placement, enlarged house
collision, authored obstacle footprints and low-pen wheel contact.
