# Soccer physics

Soccer uses SI units, the game's 240 Hz fixed step and `PHYS.gravity`. The
player is never transferred to a separate vehicle or locomotion controller.
Inside the 2 × 3.08 m pitch bounds, the shared `Locomotion` rig uses a calibrated
force scale that settles at 3× ordinary measured movement speed, plus a 3×
gait-cadence scale. Outside those bounds both scales return to 1 immediately.
This changes running speed and its matching gait only; ordinary camera-relative
direction, jumping, grabbing, soft-body response and stadium collision stay on
the shared path.

The ball is a 42 mm sphere with 8 g mass. Gravity, restitution, rolling drag,
contact-transferred spin, modest Magnus curvature and quaternion rotation run
at the physics rate. Posts use sphere/cylinder-distance contacts; nets damp
rebounds. A goal requires the whole ball to cross inside the posts and below
the bar, once per crossing. Dead balls and goals return to centre after a short
delay so the ball cannot stay unreachable.

Ball/jelly response uses a finite live FEM contact patch. The same normalized
weights determine effective inverse mass, displacement and recoil. A single
barycentric sample has too little effective mass and can let the ball pass
through a jelly that visually made contact. A regression checks equal/opposite
combined linear momentum in the isolated patch response.

Space and touch Shoot work only while the player is inside the pitch bounds.
One second separates action starts. The shot caches the nearby player-to-ball
direction, arches and crouches the body with zero-mass-centred posture forces,
then applies a brief whole-body forward thrust. The release waits until the
forward lunge has had time to close the normal shooting gap; the impulse is
emitted only when the live jelly surface is close enough to the ball. Its
horizontal angle is the physical centre/contact relationship at release, so
standing left, right or diagonally behind the ball produces the corresponding
shot. There is no goal targeting, remote kick or ball snap. The existing cry expression covers
effort; a goal requests the existing laugh for three seconds.

The goalkeeper has an independent force-driven jelly rig with a 0.40 m/s top
run speed. Roughly every 85–125 ms it predicts the ball at its defensive line,
folds side-board rebounds into the lateral intercept, estimates ballistic
height and commits to a bounded target with small deterministic error. Reaction
error shrinks as a shot becomes urgent. The keeper also biases its home position
toward the live ball, leans toward urgent lateral saves and uses physical jumps
for high balls or late wide emergencies. Acceleration, bounded speed, target
commitment and jump cooldown make it responsive without perfect tracking.
There is no teleport-to-ball action.

Player/keeper collision uses a moving compound body envelope and reciprocal
finite-mass recoil. It preserves separate core, head, arms and lower body rather
than filling the silhouette with one large box.

Audio uses cached procedural artificial-turf running and impact samples. The
field-only run loop combines short dry fiber noise with soft repeated footfall
pulses, then follows measured player speed, attenuation and pan. Kicks, posts,
body contacts, saves and goals have separate envelopes; contacts are debounced.
Mute, hidden tabs, reset, portal menus, travel and disposal stop ongoing sound.
