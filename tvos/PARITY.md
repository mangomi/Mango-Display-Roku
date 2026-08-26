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

## Not yet ported (Phase B remainder)

- Overlays: slideshow, background under-layers (`SlideshowOverlay.brs`;
  layered transparent-PNG pages), slideshow position persistence across
  rotations (`overlayState`/`lastIndex`).
- Effects: particle, popup, dropper, sprite-mover, string lights;
  celebrations (burst + finale; needs `tools/generate-celebrations.js`
  to emit a JSON map alongside the .brs one).
- InteractionLayer: pointer, targets, optimistic ticks, `/interact`,
  gestures, busy-at spinner placement, page-turn keys.
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
