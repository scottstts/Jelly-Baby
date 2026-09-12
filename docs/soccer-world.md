# Soccer world

The pitch is **2 × 3.08 metres**, against the existing 7 cm jelly. It stays on
the shared wooden table under the shared room lighting. The stadium extends
beyond the pitch: the near end includes a 29 cm clear concourse behind the net,
an offset entry aisle, and a separate gate and rental desk. The entrance is
60 cm off the goal centreline. Never move it back behind the net or fill the
entry aisle with seating. These are both measured and traversed in tests.

The shared portal offers Home, Play Tricycle and Play Soccer. Soccer geometry
loads on first selection and reuses objects afterward. Arrival uses the shared
camera-side placement and camera-facing rest pose. Reset stays in Soccer,
removes skates and resets the score and ball.

E or the contextual touch button at the rental desk puts the player on the
pitch in skates. The skates are low paired cradles with bearing cheeks and
three urethane wheels each; there are no boots or invented feet. The player
can return through the ramp and concourse, then use E near the stadium gate
to remove the skates and reappear outside.

WASD/arrows and the joystick remain camera-relative. The chase camera allows
a 1.46-radian polar angle while skating, including on mobile. It accepts manual
orbit while held and returns along the shortest arc after release. Leaving
skates restores the viewport-dependent normal camera limit, including its
portrait field-of-view allowance.

All three hats remain attached across travel and skating. Away from the exit,
the shared carried-attire action can use E to return a hat to its Home slot.
Skate support explicitly qualifies for removal despite the soft body being
above the tabletop and therefore not floor-grounded.

The goalkeeper uses an independent clone of the existing cage, the blueberry
material and existing face rendering. Its face binds in the original local
rest frame before the skin moves to the goal; binding after world placement
would silently put features in the wrong places.

See [soccer physics](soccer-physics.md) and
[soccer geometry and collision](soccer-geometry.md) for implementation contracts.
