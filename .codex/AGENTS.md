# Context

This repo is building **Jelly Baby**: a production-quality, WebGPU-only 3D game in Three.js using **TSL (Three.js Shading Language)**.

Core principles:

- WebGPU + TSL first-class: no WebGL fallback; shader work is NodeMaterial/TSL-driven.
- Use physics as the foundation for realistic interactions and graphics, balanced against real-time CPU/GPU responsiveness. Plausible approximations, optical proxies and bounded simulation work are encouraged when they preserve the established look, behavior and feel while improving smooth performance. Physical accuracy must not cause visible lag or freezes.
- Minimal UI and HUD

## Drawing-buffer and platform policy

The 4,000,000-pixel drawing-buffer limit is a hard cap. DPR may fall below 1
when the CSS viewport itself exceeds that budget; never restore a final
`Math.max(1, dpr)` floor, because that silently disables the cap on 4K desktop
viewports. Use the following base policy:

```typescript
const maxPixels = 4_000_000;
const width = Math.max(1, window.innerWidth);
const height = Math.max(1, window.innerHeight);

const dpr = Math.min(
  window.devicePixelRatio,
  1.7,
  Math.sqrt(maxPixels / (width * height))
);

renderer.setDrawingBufferSize(
  width,
  height,
  Number.isFinite(dpr) && dpr > 0 ? dpr : 1
);
```

If dynamic resolution is present, multiply this base DPR by the current render
scale before the single `setDrawingBufferSize()` call. Coalesce browser resize
events to one animation-frame commit, ignore transient 0x0 viewports, and never
call `setPixelRatio()` and `setSize()` separately for the same resize. These are
global correctness rules and must not visibly change an ordinary Mac viewport.
Backend-specific resource optimizations must remain isolated to the affected
platform and must not reduce rendering quality or add a lower-quality fallback.

## Boot and GPU failure handling

Treat the entire startup path—dynamic module import, renderer initialization,
system initialization, shader compilation, warmup, and first render—as one
observed promise chain with a terminal catch. Track the current boot stage and
surface failures through the project's existing entry/error UI with useful
stage, viewport, DPR, platform, and error diagnostics; never leave a frozen
loading screen or black canvas.

Install application `onDeviceLost` and `onError` callbacks immediately after
constructing `WebGPURenderer`, before awaiting `renderer.init()`, while preserving
Three's default callbacks so its internal bookkeeping and logging still run. If
the pinned Three version does not forward uncaptured GPU errors, attach an
`uncapturederror` listener to the backend device immediately after init. Any
unexpected device loss is fatal. Out-of-memory/internal GPU errors are fatal,
and every uncaptured GPU error during boot must abort startup. Stop the render
loop and show the same error UI for fatal runtime failures. Do not silently
recover by lowering quality, switching renderers, or falling back to WebGL;
unsupported, obsolete, or fundamentally unstable hardware should fail clearly.

**Important:** DO NOT stuff everything in a generic GameRuntime.ts, over time it has become a monolithic code file. runtime should just be an entry point, if you need specific side logic, define it elsewhere and import into runtime code

# Rules

- Do NOT use agent skills unless explicitly told to
- run lint and typecheck every time you finish a coding task to make sure code is clean
- don't run dev server for live browser inspection, I will do visual inspection myself
- do NOT commit code, I will do that myself
- When tuning gameplay values, treat each requested value as the new canonical default: update the constant directly and remove prior tuning history rather than expressing it as chained multipliers or derived adjustments.
- pay attention to relevant md docs in `docs/` dir, these can include intentions and design principles derived or surfaced during implementation beyond the code itself that are important for further implementing related features. Make sure you always update relevant docs in docs/ after new implementation to avoid stale and outdated references. During the initial implementation, add separate modular docs to document different parts of the game system
- When asked to write implementation documentations, do NOT include verbose and irrelevant things like broad project rules, what text was used, etc. The point of documentation for a specific session of implementation is to capture only design choices that were discussed or surfaced during coding beyond what code alone can tell that could potentially impact future implementations, not to repeat what the code or project rules already says
