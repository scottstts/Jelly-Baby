# Soccer physics

Soccer uses SI units, the game's 240 Hz fixed step and `PHYS.gravity`. Skating
is powered support: forces act on live FEM node velocities, with stronger
lower-body support and a compliant crown. Only boarding, leaving and reset
place the rest pose directly. Acceleration is bounded, nominal speed is
82 cm/s, and releasing movement preserves a short coast. Support height
follows the pitch, access ramp and wooden concourse.

The ball is a 42 mm sphere with 8 g mass. Gravity, restitution, rolling drag,
contact-transferred spin, modest Magnus curvature and quaternion rotation run
at the physics rate. Posts use sphere/cylinder-distance contacts; nets damp
rebounds. A goal requires the whole ball to cross inside the posts and below
the bar, once per crossing. Dead balls and goals return to centre after a short
delay so the ball cannot stay unreachable.

Ball/jelly response uses a finite live FEM contact patch. The same normalized
weights determine effective inverse mass, displacement and recoil. A single
barycentric sample has too little effective mass and allowed the ball to pass
through a keeper that visually made contact. A regression checks equal/opposite
combined linear momentum in the isolated patch response.

Space and touch Shoot work only while skating. One second separates action
starts. The torso arches back, a short wheel-driven lunge moves the body, and
a contact-relative impulse releases during the forward phase. The shot never
aims at the goal or snaps the ball to the player. Internal arch/lean offsets
have zero mass-weighted translation; otherwise windup unintentionally drives
the whole body backward. The existing cry expression covers effort; a goal
requests the existing laugh for three seconds.

The keeper samples prediction every 120 ms. It estimates time to its defensive
line, folds wall rebounds into the intercept, and checks ballistic height
before a jump. Acceleration, speed, cooldown, short commitment and small
deterministic prediction error prevent perfect tracking. There is no
teleport-to-ball action. The shot sweep includes central saves and successful
corner shots; visual contact alone is not a passing save test.

Player/keeper collision uses a moving compound envelope and reciprocal
finite-mass recoil. It preserves separate core, head, arms and skates instead
of filling the whole silhouette with one large box.

Audio uses cached procedural friction and impact samples. Quiet skating
follows measured speed, attenuation and pan. Kicks, posts, body contacts, saves
and goals have separate envelopes; contacts are debounced. Mute, hidden tabs,
reset, portal menus, travel and disposal stop ongoing sound.
