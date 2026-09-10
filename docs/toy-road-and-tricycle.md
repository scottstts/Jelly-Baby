# Toy road and tricycle

The asymmetric road is 17 cm wide, with coral borders, connector seams, brass
pins, center dashes and a checkered start beneath bunting. Its 0.7 mm surface
is a cosmetic tabletop covering: the existing floor remains the contact plane.
Borders are visual guides, allowing riders to leave the track. A studded brick,
pen, bottle, eraser and cotton reel interrupt alternating sides of the road.
Painted houses and turned trees create the tabletop village.

Static parts are baked in assembly-local coordinates and merged by finish
(14 scenery meshes). The vehicle batches each wheel, saddle and fork shell
separately to preserve motion. Construction is deterministic, with no
per-frame geometry generation.

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

The vehicle is a planar, driven bicycle approximation with a three-wheel
footprint, rather than a full rigid-body suspension solver. Three footprint
circles test oriented obstacle boxes at 240 Hz. Travel per step stays below
1.5 mm, beneath the thinnest obstacle. On foot and after ejection, the baby
uses the existing visible-surface contact solver. The parked vehicle has a
separate moving collision volume; it cannot inherit static scenery bounds.

Rider forces act on live FEM node velocities. Lower-body support and hand
grips are stiff; the upper torso is compliant. Targets include steering-frame
point velocities so acceleration, braking and turning cause inertial lag.
Only boarding places the body into a rest frame. Impact releases supports and
retains incoming momentum. These are powered vehicle/support approximations,
not a momentum-conserving multibody simulation.

## Crash expression

Laughter starts after .65 seconds riding once speed exceeds 12 cm/s. An impact
above 22 cm/s in the contact-normal direction ejects an already-laughing rider.
The face switches immediately to the existing sob shape and stays crying
through flight. After contact, ordinary locomotion restores posture. The
two-second timer advances only when grounded with the mass-weighted crown at
least 38 mm above the feet; falling again resets it. Recovery returns to the
default blinking face without the post-grab chuckle. Dismount and reset do not
trigger crying.

`npm run test:tricycle` checks boarding, drive, braking, turning, volume and
orientation stability, seat retention, ejection, facial timing, standing
recovery, constant-length steering links and batched geometry.
