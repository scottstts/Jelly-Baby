# Soccer world

The pitch is **2 × 3.08 metres**, against the existing 7 cm jelly. It stays on
the shared wooden table under the shared room lighting. The stadium extends
beyond the pitch: the near end includes a 29 cm clear concourse behind the net,
an offset entry aisle, an open gate and a decorative welcome desk. The entrance
is 60 cm off the goal centreline. Never move it back behind the net or fill the
entry aisle with seating. These are both measured and traversed in tests.

The shared portal offers Home, Play Tricycle and Play Soccer. Soccer geometry
loads on first selection and reuses objects afterward. Arrival uses the shared
camera-side placement and camera-facing rest pose. Reset stays in Soccer and
resets the score, ball and goalkeeper state.

Soccer has no equipment mode or contextual entry interaction. The player uses
the ordinary camera-relative locomotion path from the concourse, through the
ramp and directly onto or off the pitch. Entering the pitch bounds switches the
ordinary locomotion rig to a 3× movement-speed and 3× gait-cadence profile; the
jump, grab, collision and other movement behavior remain the shared on-foot
behavior. Artificial-turf running audio follows this field-only motion.

Space and the touch hop button become Shoot only while the player is physically
inside the pitch bounds. Off the pitch they remain the ordinary jump action.
Shooting has a one-second action-start cooldown. The animation is force-driven:
the jelly arches and crouches back, then elastically propels forward. The ball
receives an impulse only at a real nearby release contact, and the launch vector
comes from the live player-to-ball geometry rather than goal aiming.

The only soccer-specific camera behavior is pitch. Crossing onto the field
smoothly lowers the view to a more grazing polar angle; crossing back off the
field returns to the captured normal polar angle. Horizontal orbit remains
manual, there is no player-heading chase, and releasing a drag never snaps the
camera behind the player. Movement remains relative to the current view angle.

All three hats remain attached across travel and normal soccer locomotion. The
shared carried-attire E action remains available according to the usual grounded
wearable rules.

The goalkeeper uses an independent clone of the existing cage, the blueberry
material and existing face rendering. Its face binds in the original local rest
frame before the skin moves to the goal; binding after world placement would
silently put features in the wrong places. The keeper uses a force-driven foot
gait, prediction with finite reaction/commitment error, lateral anticipation,
body lean and physical jumps. It never teleports to the ball.

See [soccer physics](soccer-physics.md) and
[soccer geometry and collision](soccer-geometry.md) for implementation contracts.
