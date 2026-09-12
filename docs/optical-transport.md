# Optical transport

The jelly's appearance is built from two related but separate optical paths:

1. a synchronous GPU caustic field that follows the current shape and feeds a
   shared scene-wide caustic receiver layer; and
2. an asynchronous worker path that updates directional shadow/contact data and
   view-dependent thickness for the transmissive body material.

This split keeps the bright, shape-sensitive caustic pass on the render device
while moving CPU ray/BVH work off the browser's main thread.

## Shared surface representations

The visible surface is the exact 72,234-vertex body surface. The optical proxy
is generated from the same implicit model at a reduced polygonizer resolution,
currently 10,090 vertices and 20,176 triangles. Both surfaces are embedded in
the same 980-node mechanical cage and can therefore be deformed from the same
particle state with [`deformSurface`](../src/physics/deform-surface.js).

The proxy is not a visual LOD. It is used only for bounded light transport. The
model build records two mappings:

- optical vertices to cage nodes for deformed proxy positions; and
- visible vertices to proxy triangle IDs and barycentric weights for copying
  view thickness back to the full surface.

[`SurfaceBVH`](../src/graphics/optics/refractive-light.js) builds a centroid-split
triangle hierarchy once and refits its node bounds as positions change. It is
used for visible picking, proxy thickness rays, and worker-side tracing without
the cost of a linear scan over every triangle.

## GPU caustic field

[`RefractiveLightField`](../src/graphics/optics/refractive-light.js) creates four
render targets:

| Target | Size | Role |
| --- | ---: | --- |
| Front depth | 128², half-float + depth | Light-space front intersection. |
| Back depth | 128², half-float + depth | Light-space back intersection. |
| Raw caustic | 160², half-float | Additive projected transmitted energy. |
| Filtered caustic | 160², half-float | Shared receiver texture exposed as `lightTexture`. |

The optical surface uses TSL attributes for four cage IDs and weights. A storage
buffer packs the current cage positions, and the GPU position node reconstructs
each proxy vertex directly from that buffer. This keeps the depth and caustic
passes on the current shape without transferring a full visible mesh every
frame.

For a shape update, the field:

1. computes a light-space receiver span and origin around the body and its
   projected footprint;
2. positions an orthographic light camera along the measured window direction;
3. renders front and back light-space depth, with the surface drawn from the
   front and back sides into separate targets;
4. reconstructs entry and exit points and normals from neighboring depth texels;
5. refracts the incoming ray into the jelly, iterates the exit intersection
   against the back depth field several times, and refracts back into air;
6. intersects the exiting ray with the planar tabletop receiver;
7. rejects invalid rays, folds outside the target, total internal reflection,
   and rays that do not travel down toward the receiver;
8. evaluates an inverse screen-space Jacobian to concentrate energy at folds,
   caps pathological singularities, and multiplies by Schlick entry/exit
   transmission and Beer–Lambert absorption; and
9. rasterizes an 80×80 source grid additively into the raw target, then runs a
   small nine-tap reconstruction filter into the final target.

The caustic material is tone-map-exempt and additive. Its RGB energy uses one
shared refracted path; the selected flavor's three absorption coefficients are
applied independently along that path. This is a perceptual real-time optical
model rather than three separately traced spectral simulations.

[`CausticReceivers`](../src/graphics/optics/caustic-receivers.ts) is the
receiver-side interface for that same field. The projection remains the existing
planar XZ/tabletop projection; universal reception does not add another caustic
simulation or rerun refraction per object. A plausible scene receiver sets
`receiveCaustics = true` and is registered once with the receiver layer. The
layer injects the existing caustic texture into PBR node-material emissive
response, multiplied by the receiver albedo and the same measured irradiance and
source color used by the tabletop. For raised geometry, each fragment is first
projected from its world position down to the y=0 caustic plane along the measured
light direction before sampling. This is essential: sampling raw world XZ would
vertically extrude every bright floor texel through tall props. The sampled energy
is also multiplied by geometric light-facing incidence relative to the horizontal
receiver calibration, clamped so a raised surface cannot become brighter than the
established floor response. Upward horizontal surfaces retain exactly the same
caustic intensity as the tabletop. Existing emissive nodes are added to rather
than replaced. `FacilityShadows.add(...)` opts all descendant facility meshes in
automatically, so current and future ordinary set pieces receive caustics by
default. The tabletop uses the same receiver layer with its existing
facility-shadow visibility mask.

Additional jelly bodies use independent instances of the same GPU field and
worker transport. `CausticReceivers.addSource` attaches their contributions to
existing and future receivers. Ground receivers share `groundReceiver` for the
tabletop and elevated floors; it combines each jelly's optical shadow/contact
field with the existing facility projection, preserving the floor coefficients.

The scene rule is intentionally broad: **every opaque/material surface that could
plausibly be illuminated by the jelly caustic should receive it**. Exceptions
should be deliberate optical cases, such as the transmitting jelly itself or
non-surface effects, rather than omissions made for convenience.

The field is updated only when forced, when the body surface revision changes,
when the center moves, or when flavor absorption or the lighting mode changes. Light direction and the
horizontal-flux correction are dynamic shader inputs. Camera-only movement
does not rerender the caustic field.

## Worker-backed shadow and thickness transport

[`OpticalTransport`](../src/graphics/optics/transport.ts) starts
[`transport.worker.ts`](../src/graphics/optics/transport.worker.ts) as a module worker.
The initialization message sends the optical proxy topology, rest normals, cage
bindings, and the measured light direction. At most one frame request is in
flight, and requests are limited to 30 per second.

When the body surface revision changes, the main thread sends copies of cage
particles and nodal deformation gradients using transferable buffers. The worker
deforms and refits the proxy, updates its `OpticalShadowField`, and posts the
shadow/contact texture first. The main thread installs those bytes into the
256² RGBA shadow texture, updates its receiver coordinates, and records the
traced center/origin. The worker then performs view-thickness tracing and posts
a second message.

When only the camera moved, the request contains no particles or gradients. The
worker reuses the most recent shadow/contact field and sends only new thickness.
This is why camera orbit remains responsive without repeatedly rebuilding the
directional field.

`follow()` compensates for body translation between the worker's traced center
and the current center. It shifts the contact origin horizontally and reprojects
the directional shadow origin for the current vertical offset, so a delayed
worker result stays attached to the moving body.

Lighting-mode changes send the new direction separately and force the next
shape request even for a sleeping body. Shadow replies carry a lighting revision
so an in-flight day result cannot overwrite a night field (or vice versa).
View thickness is independent of this revision and can still complete normally.

## View thickness

For each proxy vertex facing the camera, the worker refracts the camera ray from
air into the jelly and intersects the internal ray against the proxy BVH. The
distance is clamped to a small useful range and stored in the proxy's
`opticalThickness` attribute. The main thread interpolates the proxy values onto
the full visible surface with the generated three-vertex mappings. The baby
material reads that attribute as its physical transmission thickness.

The thickness calculation is deliberately view-dependent. It is not a costly
per-pixel volume integration and it does not alter the mechanical or visible
surface geometry.

## Directional shadow/contact field

The worker's [`OpticalShadowField`](../src/graphics/optics/refractive-light.js)
projects every proxy triangle along the measured incoming light direction onto a
256² receiver. It stores two channels:

- red: directional body shadow;
- green: a height-faded contact contribution from low body triangles.

Both channels receive a small separable blur before being packed into RGBA
bytes. The table samples them with separate coordinate transforms. The field is
kept independent from the GPU caustic targets so caustic changes cannot alter
the established opaque shadow/contact behavior.

## Facility shadows are separate

Opaque facility geometry is handled by
[`FacilityShadows`](../src/facilities/shadows.ts), not by the optical
worker. It renders complete facility geometry into a 512² main-world target,
resizing that target for larger active-world footprints so ground texel density
does not fall when the toy track is active. It stores red directional shadow and
green near-floor contact channels. The table combines this target with the
optical field using a deterministic tent filter. See [Facilities](facilities.md)
for its invalidation and swept-bounds rules.

## Current helper status

[`src/graphics/optics/beam-raster.js`](../src/graphics/optics/beam-raster.js) contains a
conservative CPU triangle-to-pixel flux integrator with reusable clipping
scratch buffers. It is retained as a standalone optical utility, but it is not
imported by the current runtime. The live caustic path is the GPU render-target
pipeline above; the worker currently publishes shadow/contact and thickness, not
CPU caustic photons.

## Approximation budget

The optical result intentionally makes bounded choices:

- a reduced proxy for CPU tracing and a finite 128²/160² GPU light path;
- a planar tabletop receiver;
- screen/view-dependent thickness rather than a full volume solve;
- a shared RGB refracted trajectory rather than wavelength-separated paths;
- capped Jacobian focus and a small fixed reconstruction filter; and
- rejection at visibility discontinuities, invalid exit rays, and unsupported
  geometry configurations.

These approximations preserve the visual relationships that matter—colored
transmission, bright folded caustics, directional shadow, and body-attached
light—without making the render loop wait for an unbounded optical simulation.
