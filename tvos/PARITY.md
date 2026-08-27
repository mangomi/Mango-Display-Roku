# tvOS ↔ Roku parity marker

**Behavior parity as of Roku commit `56392b2`** (branch `live-portal`;
docs-only commits since `cfc6c1a`, which is the Roku client state this
port was written against).

## The porting workflow (APPLE_TV.md §7)

Any session porting Roku-side changes into this app:

1. Read this file.
2. `git log 56392b2..HEAD -- components/ source/ images/ fonts/ manifest`
   to list Roku-side changes since parity.
3. Port the *behavioral* ones; skip Roku-only mechanics (texture-cap
   packing, the keep-alive video, registry plumbing). The commit messages
   are the spec — read the story, not the diff.
4. Update the hash at the top of this file.

## What the spike covers (Phase A)

- **Identity**: `ATV` + 9 digits (each 1–9, mirroring BrightScript
  `Rnd(9)`), generated once, persisted in **Keychain** (survives
  reinstall; Roku uses `roRegistrySection "mangodisplay"`).
- **Pairing** (`PairingTask.brs` → `Backend.swift`): 5s
  `mirrors/deviceId/{code}` poll, one-shot `saveMirror`
  self-registration with the exact Roku/Tizen payload, pairing screen
  copy + layout (`MainScene.xml` pairingGroup).
- **Control loop** (`VersionTask.brs` → `DisplayController.waitLoop`):
  `/wait` long-poll (55s cap vs the server's 50s hold) with full
  identity, `launch=1` announcement until the first reply, busy applied
  on every reply, assetBase learned at runtime, inline manifest with
  display.json fetch fallback, `/version` heartbeat + 5s backoff on
  failure, version *change* (not increase) detection.
- **Pages** (`MainScene.brs` core → `DisplayController` + `DisplayView`):
  load-then-swap slots (incoming page on top), in-place quiet refreshes,
  imageHash-keyed image cache with stale pruning, rotation per
  `delaySeconds`/`autoRotate` (min 3s, default 60s), transitions
  fade/slideleft/slideright/slideup/slidedown/pop, busy spinner with 75s
  watchdog, schema gate (known schema: **1**).
- **Keep-alive**: `isIdleTimerDisabled` replaces the Roku muted-video
  hack (APPLE_TV.md §3) — the one deliberate divergence.

## Phase B progress

Landed 2026-08-26 (chunk 1 — fonts + first overlays):

- **Fonts**: the shared `fonts/` folder is bundled via a folder
  reference (same files as Roku, no copies), every face registered at
  launch (`FontRegistry`), families resolved through `fontMap.json` —
  emitted by the same `tools/fetch-roku-fonts.sh` run as `fontMap.brs`
  so the clients can never disagree. Fallback: Source Sans Pro
  (bold only as fallback), matching `rokuFontFile()`.
- **Clock overlay** (`ClockOverlay.brs` → `ClockOverlayView`): verbatim
  composition rules — values only, all format decisions from the
  manifest (12/24h, meridiem strings/side/spacing, localized date
  pattern), legacy English fallbacks, `tzOffsetMinutes`, 5s tick.
  VERIFIED on the live display (24h padded time + date at measured
  rects).
- **Countdown overlay** (`CountdownOverlay.brs` → view): epoch math,
  fixed modulo, 1s-ahead display, 1s tick. Ported but NOT yet verified
  — "Apple TV Spike" has no countdown widget; add one to exercise it.
- **GIF/sticker overlays** (`GifOverlay.brs` → `GifOverlayView` +
  `SpriteSheetView`): sheet-grid stepping through a clipped window,
  ~30fps cap, wall-clock frame index (rebuilds never restart a GIF).
  The sheet path was chosen over native GIF decode of `source` because
  effects art is sheet-only anyway — one player for everything.
  VERIFIED animating (stickers + weather icon).
- **Slots are canvas-true**: each page slot composes under-layers →
  image → overlays in 1920×1080 canvas space and scales as ONE unit,
  so overlays ride page transitions like Roku's slot children.
- **imageOnly / overlaysUnchanged**: in-place image swaps keep live
  overlay views (and their animations) untouched.
- **Transitions at portal parity**: 3.0s inOutCubic (was a placeholder
  0.5s), `rotate` implemented (half-turn + fade + growth), `flip` as
  the Roku squash/expand approximation. Only `fade` verified on screen
  so far — the display has one page; add a second to exercise turns.
- Cache pruning keeps overlay sprite sheets alive, not just page
  images.

**SwiftUI scar (do not reintroduce):** multiple `.position`ed labels
placed directly in a `TimelineView`'s builder get implicitly stacked —
each child was offset by a share of the canvas (the clock's date line
rendered 540px low). Every timeline-driven overlay wraps its labels in
one explicit `ZStack(alignment: .topLeading)`.

Landed 2026-08-26 (chunk 2 — slideshow/background, layered pages):

- **Slideshow + background overlays** (`SlideshowOverlay.brs` →
  `SlideshowOverlayView`, one view for both types like Roku's
  registry): interval stepping (min 3s), per-widget transition with
  first-reveal-always-fades, failed loads skip ahead, `pageColor`
  under the photos, `cropToFill`, brightness dim (multiply-equivalent
  black overlay), and cross-rotation position persistence
  (controller `overlayState` ↔ Roku's `startIndex`/`lastIndex`,
  advance-one-on-re-entry). `background` renders in the slot's under
  layer — the layered transparent-PNG page contract. VERIFIED: both
  pages' photo backgrounds rotate and resume across page turns.
  Not yet exercised: slideshow as a *placed widget* (same code path,
  needs a widget fixture), brightness < 1, slide/flip photo swaps.
- **Memory rule honored**: slideshow photos bypass the shared cache
  entirely — fetched on demand and DOWNSAMPLED to the widget rect
  (Roku's `loadWidth` cap); only the on-screen A/B pair stays
  resident. A 60-photo background list must never be cached whole.
- Watched the painted pipeline self-correct in real time: a capture
  taken mid-edit baked the portal's loading spinner + half-rendered
  weather widget into `display_p0.png`; the next version's capture
  replaced it. The device needs no defense — any change bumps the
  version and the hash-keyed URLs refetch exactly the changed pixels.

Landed 2026-08-26 (chunk 3 — the effects layer):

- **All five effect players** (`components/effects/*` → analytic
  SwiftUI/Canvas renderers): particle (balloons/snow/leaves/hearts,
  exact .brs math for drift/fade/growth/spin), popup (pop-in keyframes
  0→1.5→0.8→1 with half-turn, dwell ranges, no-repeat sprite picks),
  dropper (thread + sway + alternate down/up, fixed 100ms frame tick
  like the .brs XML), sprite-mover (per-axis triangle-wave bounce ==
  Roku's leg mechanics, pre-mirrored flip sheets, rotate-on-turn,
  mirrored companion offset), and string lights via the existing sheet
  player (`spritesheet` type → GifOverlayView, same registry reuse as
  Roku). Effects live ABOVE the page slots in canvas space and rebuild
  only when the sortedKeys fingerprint of the whole config changes.
  Position/frame are pure functions of wall-clock time - rebuilds and
  page turns can never restart or stutter them.
- VERIFIED live by toggling every overlay in the webapp, one by one:
  balloons, fireworks (two overlapping players), string lights,
  flowing hearts, bursting hearts, falling leaves, flying witch
  (witch + trailing bats + thread spiders + walkers), scary pop-ups,
  disappearing elf, flying santa, falling snowflakes. All eleven
  drew correctly on the simulator (screenshots in the session log,
  2026-08-26).
- **Cache rule learned**: effect sprites regenerate server-side under
  FIXED filenames (only the burst sheets are content-hashed), so a
  changed effects set evicts its asset URLs from the shared cache
  before the new views load. The Roku texture cache has the same
  staleness exposure - flagged to Dave rather than assumed.

**Server-side bug found while testing (NOT client, NOT fixed here):**
with leaves / witch / hearts overlays enabled, the portal's own effect
`<img>` elements break inside the render environment and escape
`hideEffects`, so Chromium broken-image tiles get BAKED into the
published captures (verified by compositing `display_p0.png` directly
- dozens of tiles in the pixels). Affects Roku identically. Fix
belongs in the render service (hide coverage / why the images break);
Dave owns it.

Landed 2026-08-26 (chunk 4 — the interaction layer):

- **InteractionLayer.brs → InteractionController + views**, verbatim
  semantics: OK reveals the center pointer (revealing press acts on
  nothing), arrows nudge 10px / glide 250px/s after 0.35s hold, 15s
  idle hide, warm-on-reveal, native checkboxes from `targets` with
  the manifest sprite pair, green outline over whatever the pointer
  is over, 12px forgiveness pad, optimistic ticks with the 180s
  local-override rule, `/interact` GETs with identity (45s timeout),
  double-click page turn from the RELEASE with the 450ms window,
  gesture switches honored from display.json, busy-at spinner
  anchoring, one-swipe-at-a-time lock with 8s cooldown released
  early by the imageOnly manifest, celebrate events emitted
  (burst/finale grouping rule ported; the PLAYER is the next chunk).
- Targets apply at slot finalize only, never on in-place refreshes
  (Roku parity - overrides carry the truth through imageOnly renders).
- VERIFIED end-to-end on the live display: pointer walked onto a real
  todo checkbox, ticked optimistically, `/interact` tap delivered,
  the portal completed the task in the todo backend, the next render
  returned checked=true and the override reconciled to "0 held
  locally". Double-click page turn verified on a parked display.
  autoRotate=false parks rotation correctly (Dave's layout edit).
- Remote input via pressesBegan/Ended (UIKit), bypassing the focus
  engine; Menu is never consumed (App Review rule). DEBUG builds add
  a Darwin-notification remote (`com.mangodisplay.key.<k>.<phase>`)
  for headless driving.
- Calendar swipe LIVE-FIRE VERIFIED (2026-08-26 evening), both
  directions: double-up scrolled the calendar to September, double-down
  a month back; ~4.4s gesture-to-pixels both times; busy spinner
  anchored on the calendar widget, not screen center. Both lock
  release paths ran for real: the imageOnly early release ("swipe
  manifest applied - gestures unlocked") on the clean run, and the 8s
  cooldown fallback on a run where a live layout edit raced the swipe
  and the service folded the redraw into a full edit render - the
  exact race the cooldown exists for. A render-service restart between
  tests reset version numbers downward and reopened the portal at the
  current month; the change-not-increase version rule absorbed it
  silently.

**Test-harness notes (not product behavior):** Darwin notifications
coalesce and drop under rapid fire - same-name posts ~0.3s apart can
merge, and a dropped `release` once left the glide running to the
screen edge (hence the atomic `tap` phase). `notifyutil` spawn
latency is ~0.2-0.4s, so a scripted double-click needs NO sleep
between posts or it misses the 450ms window. A real remote has
neither problem.

Verified 2026-08-26 (calendar cell weather, served as plain `gif`
overlays by render-service d8d3750/c7a5214/bd7f2f7):

- 10 `overlay_cw_*` entries on the calendar page, 3 content-hashed
  sheets shared across cells, mixed 70ms/140ms frame rates. The
  existing sheet player needed nothing new: frameMs is honored
  per-entry (each view runs its own timeline period), animations stay
  inside the 163x54 header bands, temps/dates stay sharp beneath, no
  ghost icon, and the 5.6s rain loop wraps phase-consistently.
- One client bug found by this verification, as the server session
  predicted: ImageCache had an actor-reentrancy hole - the awaited
  fetch suspends the actor, so N views requesting one sheet
  concurrently ALL missed the cache and ALL fetched+decoded (six
  cells share the rain sheet). Fixed with in-flight task coalescing:
  one fetch+decode per URL, latecomers await the same task, failures
  retry fresh, evict() cancels in-flight fetches for the evicted URL.

## Not yet ported (Phase B remainder)

- Celebrations (burst + finale; needs `tools/generate-celebrations.js`
  to emit a JSON map alongside the .brs one). The interaction layer
  already emits the events.
- Exit/lifecycle reporting (`&lastexit=`; lifecycle notifications +
  MetricKit) and real memory-level reporting (currently coarse
  `normal`→`low` after a pressure warning).
- The 60s fallback refresh timer (`refreshTimer`); the in-loop
  heartbeat covers dead connections for now.
- Dev helper: Roku's `*` key regenerates the device code — no tvOS
  equivalent mapped yet.

## Spike-only conveniences to revisit

- `images/logo.png` is *copied* into `Assets.xcassets/Logo.imageset/`
  (752×182 original, displayed at 560pt like Roku). If the logo ever
  changes, both copies must move — or the asset should be shared via a
  build phase.
- No app icon / top-shelf art (store prep is Phase D).
- Bundle id `com.mangodisplay.tv`, display name "Mango Display" (Dave,
  2026-08-26).
