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

## Not yet ported (Phase B+)

- Overlays: clock, countdown, gif strips, slideshow, background layers.
- Effects: particle, popup, dropper, sprite-mover, string lights;
  celebrations (burst + finale; needs the generator's JSON-map tweak).
- InteractionLayer: pointer, targets, optimistic ticks, `/interact`,
  gestures, busy-at spinner placement.
- Fonts: bundled TTFs + runtime registration + JSON family map.
- `rotate` and `flip` page transitions (currently fall back to fade).
- Exit/lifecycle reporting (`&lastexit=`; needs lifecycle notifications
  + MetricKit, no direct tvOS API) and real memory-level reporting
  (currently: coarse `normal`→`low` after a pressure warning).
- The 60s fallback refresh timer (`refreshTimer`); the in-loop
  heartbeat covers dead connections for the spike.
- `imageOnly` fast path (meaningless until overlay layers exist).

## Spike-only conveniences to revisit

- `images/logo.png` is *copied* into `Assets.xcassets/Logo.imageset/`
  (752×182 original, displayed at 560pt like Roku). If the logo ever
  changes, both copies must move — or the asset should be shared via a
  build phase.
- No app icon / top-shelf art (store prep is Phase D).
- Bundle id `com.mangodisplay.tv`, display name "Mango Display" (Dave,
  2026-08-26).
