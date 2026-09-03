# tvOS parity queue — running trace for the Apple TV agent

Maintained by the server-side session (Dave's ask, 2026-08-28): every
change landing after the tvOS app's build that NEEDS (or should be
verified against) Apple TV client-side work, curated as behavior, not
diffs. Complements `tvos/PARITY.md`'s commit-diff workflow — that finds
everything mechanically; this file says which of it matters and why.

Hand this file to the tvOS agent when Dave says so. Items get checked
off there, not deleted here.

## REQUIRED — new client behavior

- [ ] **Night mode** (`night: true` in display.json, 2026-09-03): pages
  arrive as fully transparent PNGs with a single `motion` overlay (the
  badge). Play a black looping video FULL SCREEN beneath the page layer
  (Roku reuses its keep-alive clip: MainScene `applyNight`), hide any
  opaque backdrop, draw the badge overlay normally. On `night` false or
  absent, restore the backdrop and the hidden keep-alive player. A black
  image is NOT equivalent: TVs only dim their backlight for video.

- [ ] **`scroll` overlay type — natively scrolled calendar cells / lists**
  (Roku `ScrollOverlay`, commit `37f3826`). For Roku the server no longer
  films scrolling cell content into a `gif` sprite sheet; it captures it
  ONCE as a tall transparent strip and the device animates it. Fields:
  `rect` (window, canvas px — clip to it), `segments` (`[{file,h}]`
  pieces top-to-bottom, each PNG ≤ 2048px tall; `stripFile` = first
  piece), `stripW`/`stripH` (canvas px; PNGs are at output scale),
  `fromY`/`toY` (strip translation relative to the window top at loop
  start/end: `+rect.h` → `-stripH`), `durationMs` (one loop), `loop`
  (default true). Linear, repeating, sub-pixel — a `CABasicAnimation`
  on the strip layer's position does it. The server emits `scroll` ONLY
  to device ids in `NATIVE_SCROLL_PREFIXES` (`render-service/capture.js`,
  currently `["RK"]`); tvOS keeps receiving `gif` sheets until `"ATV"` is
  added there — ship the client first, then flip the list. Reference:
  `components/overlays/ScrollOverlay.brs`; schema in MANIFEST.md.

- [ ] **`manifest.showPage` — jump to the page being edited**
  (Roku commits `b0c3f90`, `29daa64`). A layout edit in the webapp now
  navigates the portal to the edited page, and the published
  `display.json` carries a top-level `showPage` (integer page index)
  on every publish inside a ~15s window after the edit. On applying a
  manifest: if `showPage` is present, in range, and differs from the
  page currently shown → transition to it (animated, like a manual
  page turn) and restart that page's rotation dwell. Same page or out
  of range → normal in-place refresh. Repeats inside the window are
  idempotent (only jump when different). Roku reference:
  `components/MainScene.brs` `maybeApplyPages`.

- [ ] **`motion` overlay type — natively animated weather icons**
  (Roku `MotionOverlay`; server `3665bd4` widget icons, `9272ebe` calendar
  strips; deployed to test 2026-09-02). For platforms in
  `NATIVE_WEATHER_PREFIXES` (`render-service/capture.js`, currently `RK`)
  the server no longer films an animated weather-widget icon into a `gif`
  sheet when its SVG decomposes: it ships one transparent PNG per moving
  part with rotate / translate / opacity tracks (SMIL semantics, see
  MANIFEST.md `motion`). Client: stack the layer images at `rect`,
  animate each with its tracks (Core Animation keyframe animations map
  1:1: `transform.rotation` about `center`, `position`, `opacity`; linear
  timing, `repeatCount` infinite, `beginTime` = delay), nest `chain`
  levels as parent layers. `scale` tracks (`[[sx, sy]]` about `center`)
  exist too. The calendar 10-day strips use the same type: two overlays
  per cell (particles at the strip rect, icon at its box), tracks sampled
  from the portal's CSS keyframes. Add `ATV` to the prefix list once done;
  until then tvOS keeps receiving sheets. Reference:
  `components/overlays/MotionOverlay.brs`.

## VERIFY — server behavior changed; client likely fine as built

- [ ] **Rotating weather-icon layers now arrive as `gif` frame sheets**
  (2026-09-02, `WXM_VERSION` 4): a sunny / partly-cloudy / sun-rain icon
  is emitted as up to three overlays at the same rect - `motion` (layers
  below), `gif` (the rays, 90 frames in a cols x rows grid, `frameW/H` =
  `rect.w/h` canvas px), `motion` (layers above) - in that list order.
  No `rotation` tracks are emitted for icons any more. If tvOS draws
  overlays in list order and already plays `gif` sheets, nothing to do;
  check that the sheet's `cols`/`rows` grid (not a single column) is
  honoured and that frames are stretched to `frameW x frameH`.
- [ ] **Two popup entries can share one sprite sheet** (firework runs
  two concurrent players, `8d01b6d`): the effects array may contain
  multiple `popup` entries whose `stripFile` is the same file with
  different `dwellMsRange`. One player node per ENTRY, fetch/decode
  the shared sheet once.
- [ ] **Layout edits now arrive fast and page-targeted** (`5fcdbe5`,
  `d0c5763`, `ea6d385`): no client change — they land as ordinary
  version bumps (~4s after a webapp edit) — but expect much more
  frequent single-page updates than the old restart-display cadence.
- [ ] **`imageOnly` may be promoted to full** when an interaction
  changes a page's overlay set (`4e88eb6`, e.g. calendar scrolled off
  the 10-day weather window): the client must rebuild that page's
  overlays on a full manifest even mid-gesture. If the tvOS gesture
  path assumes swipe answers are always imageOnly, revisit.

- [ ] **Staged publishes arrive as two manifests seconds apart**
  (`dbf5b6e`): a user-driven multi-page render publishes the priority
  page first (with `showPage`), then everything again moments later.
  Verify the client applies consecutive versions gracefully - and that
  a briefly SMALLER page count (page-add: stage one may carry N pages,
  stage two N+1) doesn't reset rotation state or crash an
  out-of-range current page.

- [ ] **Remote double-click timing** (`<latest>`): if the tvOS client
  implements an arrow/button double-press gesture, match the Roku's
  corrected rule - a press is only a "hold" once it has glided a
  visible distance (4 steps), not on its first glide tick, and the
  window from release to next press is 550ms. The portal's own
  `remotePointer.js` uses 250ms release-to-release with no hold
  disqualification at all; a too-strict rule makes gestures feel
  impossible to trigger on a real remote.

## TODO — checkboxes inside scrolling lists (Roku channel + service, 2026-09-02)

`scroll` overlays may now carry `boxes` + `sprites` (MANIFEST.md). A
scrolling to-do/chores list had NO checkboxes on Roku: the page-level
target extractor drops boxes inside a hidden scroll box, and a static
target could not follow a sliding row anyway. The server now extracts the
checkboxes in strip coordinates during the one-shot strip capture (and
re-shoots the strip when their checked state changes - `boxSig` is in the
strip cache key). Client: draw one poster per box inside the moving strip
(Roku `ScrollOverlay` boxes/boxNodes), hit-test at strip offset + box
offset while the row is inside the window, pause the strip while the
pointer is over it (`paused`), tick through the normal interact call with
`payload.id`, and keep the local "held" override until the render catches
up - exactly what the static targets do (Roku `InteractionLayer`
onStripOverlays/itemRect).

## TODO — display rotation (Roku channel `71399e1`, service `5586aa0`, 2026-09-02)

**Manifest:** `canvas` may now be **1080x1920**, and a new top-level
`rotation` field (0 | 90 | 270, degrees clockwise as the viewer sees it)
says how to turn it. See MANIFEST.md `rotation`. A landscape display is
unchanged (1920x1080, rotation absent/0).

**What the server does:** for a display whose backend record has
`mirrorOrientation` 1 (90° clockwise) or 2 (counter-clockwise) it loads
the portal's plain landscape page (`&embed=true`) at a 1080x1920
viewport, outputs images at the device's dimensions swapped (720x1280 /
1080x1920), and publishes `rotation` 90 / 270. Every overlay rect, sprite,
strip and effect is in that portrait canvas - nothing is per widget. An
orientation change re-reads the record, reopens the portal and
recaptures every page.

**What the client must do (Roku reference: MainScene `applyCanvas`, the
`stage` group in MainScene.xml):**
- Size the page image layer to `canvas` (not the screen).
- Put page image + overlays + effects + pointer/celebration layers in ONE
  container; place it so the canvas centre sits on the screen centre
  (`translation = ((screenW - w)/2, (screenH - h)/2)`, rotate about
  `(w/2, h/2)`); rotate by `rotation` clockwise. Do not touch individual
  overlays.
- Effects that spawn against screen bounds must use canvas bounds
  (ParticleEffect / DropperEffect / PopupEffect / SpriteMover /
  SlideshowOverlay default rect read `canvasW/H` off their config; the
  Roku scene injects those into every effect/overlay config).
- Pointer/arrow navigation: map the viewer's arrows onto canvas axes
  (90: up->left, down->right, left->down, right->up; 270: the reverse);
  clamp the pointer to canvas bounds; start it at the canvas centre.
- Page-slide transitions travel one canvas width/height.
- Untested on tvOS: nothing here depends on Roku specifics, but check
  that clipping (scroll strips, sprite windows) survives the container
  rotation on your renderer - on Roku it is the one thing to watch.

## TODO — canvas at the device's own resolution (Roku channel + service, 2026-09-02)

**Manifest:** `canvas` is now the display's **own resolution** - 1280x720
for an HD Roku, 1920x1080 for FHD, swapped when rotated (720x1280). It
was always 1920x1080 / 1080x1920 before. The page image is exactly
canvas-sized. See MANIFEST.md "Coordinate space".

**What the server does:** opens the portal at the device's reported
resolution with a device scale factor of 1 (Dave, 2026-09-02: "set the
size to the same thing as the Roku user"). Text is rasterised on whole
pixels - the uneven letter spacing of a 1920 layout drawn at 2/3 is
gone - and the display's backend record becomes that size, so the
webapp designer and the layout geometry follow it like any browser
display. Native-scroll pace and effect spawn bounds follow the canvas
(`csPaceScale`, `extractEffects` canvasW/H). There is no other
layout.

**What the client must do (Roku reference: MainScene `init` + `applyCanvas`):**
- Read `canvas` from display.json; never assume 1920x1080.
- Run the scene at the device's OWN resolution and draw the page image
  1:1. On Roku that is manifest `ui_resolutions=fhd,hd` plus sizing
  the scene, page posters and background from `GetUIResolution()`. A
  scene the firmware scales (single `fhd` declaration on a 720p device)
  resamples every texture and smeared all small text (2026-09-02).
- Keep ONE uniform stage scale as a safety net for a canvas that does
  not match the scene: `s = sceneLong / max(canvas.w, canvas.h)`; for a
  rotated canvas, scale about the same centre the rotation uses.
- An Apple TV reports 1920x1080 and renders at it, so on tvOS this is
  already the case; the canvas-mismatch path still has to exist.

## DONE by the tvOS session already (listed for the record)

- [x] Calendar cell-weather overlays (`overlay_cw_*` gif entries,
  mixed per-entry frameMs) — tvOS verified 2026-08-27.
- [x] Content-hashed sheet filenames / cache eviction — tvOS commit
  `2937646` predates and covers it.
- [x] Celebrations burst + finale — tvOS Phase B chunk 5.

## NO client impact (noted so nobody re-checks)

- Version counter now continues across deploys (`display.json` carries
  `version`; a restarting task seeds from it) and a draining task stops
  publishing. Still a small integer; "differs from what I hold" semantics
  unchanged. Cached sheets/strips are restored from the bucket at start,
  so a deploy no longer refilms - server-side only.

- Assets moved R2 → S3+CloudFront (`81d5eb3`, `2a8769a`): clients
  follow `assetBase` from display.json; r2.dev URLs are gone, Roku
  needed no change and neither does tvOS. Page images now carry
  `Cache-Control: no-cache` (served via CloudFront revalidation) —
  only matters if a client caches by URL ignoring headers AND ignores
  `imageHash`; the tvOS ImageCache keys on hash, so fine.
- Weather icon / cell-weather / rain-drop filming fixes (`a9e91c4`,
  `7244211`, `96011e8`, `fcbe2fb`): sheet CONTENT quality only.
- Effect-tiles capture fix, weather settle, portal console piping,
  layout-signal portal hooks: all server/portal-side.

*Baseline context: tvOS parity marker sits at Roku `56392b2`; this
queue covers everything after it. Last updated: 2026-08-28 (showPage).*
